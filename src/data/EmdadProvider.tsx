// Centralized Offline-First State Provider, Live StockLedger/Fuel Computations, Audit & Print/Archive Host

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applyThemeToDocument, todayIso } from '../core/ui/imdTokens';
import { ImdNumbers, type ImdNumberPrefs } from '../core/ui/imdNumbers';
import { nf, nfMoney } from '../core/ui/imdFormat';
import { Ids } from '../core/security/crypto';
import { AuthService } from '../core/security/authService';
import {
  DeviceActivation,
  loadDeviceRevocations,
  type ActivationPayload,
} from '../core/security/deviceActivation';
import { IdleLockController } from '../core/security/idleLock';
import { SysNotice } from '../core/security/warehouseScope';
import { DOC_PREFIXES, formatDocNumber, type DocKind } from '../domain/docNumbering';
import { computeStockLedger, type WarehouseItemBalance } from '../domain/stockLedger';
import { computeFuelTankBalances, type FuelTankBalance } from '../domain/fuelEngine';
import {
  buildPrintableHtmlAndArchive,
  type PrintableDocument,
} from '../core/print/printEngine';
import {
  clearPersistedState,
  loadPersistedState,
  savePersistedState,
  saveTableSlice,
  type CollectionKey,
  type EmdadDbState,
} from './db';
import { assertCanDeleteItem, enforceQuantityGuard, SyncMarks } from './dbGuards';
import { buildInitialSeedState } from './seed';
import type {
  AppSpace,
  AuditLog,
  RiskLevel,
  SystemConfig,
  User,
} from '../domain/types';
import { hasPerm } from '../domain/accessControl';

export interface ToastItem {
  id: string;
  message: string;
  tone: 'success' | 'danger' | 'warn' | 'info';
}

export interface PrintPreviewState {
  doc: PrintableDocument;
  html: string;
  signatureCode: string;
  qrDataUrl: string;
}

export interface DoorNavigationIntent {
  space?: AppSpace;
  door: string;
  subTab?: string;
  searchQuery?: string;
  prefillItemId?: string;
  prefillWarehouse?: string;
  focusId?: string;
  ts: number;
}

interface EmdadContextValue {
  ready: boolean;
  db: EmdadDbState;
  currentUser: User | null;
  activeSpace: AppSpace | null;
  activeDoor: string;
  navIntent: DoorNavigationIntent | null;
  navigateTo: (intent: Omit<DoorNavigationIntent, 'ts'>) => void;
  clearNavIntent: () => void;
  activeRecordCount: number;
  setActiveRecordCount: (count: number) => void;
  setActiveSpace: (space: AppSpace | null) => void;
  setActiveDoor: (door: string) => void;
  login: (user: User) => void;
  logout: () => void;
  locked: boolean;
  unlockSession: () => void;
  lockSession: () => void;
  ledger: WarehouseItemBalance[];
  fuelTanks: FuelTankBalance[];
  toasts: ToastItem[];
  notify: (message: string, tone?: ToastItem['tone']) => void;
  dismissToast: (id: string) => void;
  mutateDb: (updater: (prev: EmdadDbState) => EmdadDbState) => void;
  upsertRow: <K extends CollectionKey>(
    collection: K,
    row: EmdadDbState[K] extends Array<infer U> ? U : never
  ) => void;
  deleteRow: (collection: CollectionKey, id: string) => void;
  updateConfig: (patch: Partial<SystemConfig>) => void;
  nextDocRef: (kind: DocKind) => string;
  logAudit: (params: {
    action: string;
    entityType: string;
    summary: string;
    risk?: RiskLevel;
    refNo?: string;
    warehouse?: string;
    target?: string;
    status?: string;
    itemCount?: number;
    qty?: number;
    details?: Record<string, unknown>;
  }) => void;
  openPrintPreview: (doc: PrintableDocument) => Promise<void>;
  printPreview: PrintPreviewState | null;
  closePrintPreview: () => void;
  resetAllLocalData: () => Promise<void>;
  replaceDbState: (nextDb: EmdadDbState) => Promise<void>;
  fmt: (n: number, decimals?: number) => string;
  fmtMoney: (n: number) => string;
  numberPrefs: ImdNumberPrefs;
  updateNumberPrefs: (prefs: ImdNumberPrefs) => void;
  activationStatus: ActivationPayload | null;
  refreshActivationStatus: () => Promise<void>;
  keyRecoveryRequired: boolean;
  setKeyRecoveryRequired: (v: boolean) => void;
}

const EmdadContext = createContext<EmdadContextValue | null>(null);

const TAB_SYNC_CHANNEL = 'emdad_live_sync_v1';
const TAB_INSTANCE_ID = Ids.next('tab');

export const EmdadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [db, setDb] = useState<EmdadDbState | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(() =>
    sessionStorage.getItem('emdad_session_uid')
  );
  const [activeSpace, setActiveSpaceState] = useState<AppSpace | null>(() => {
    const saved = sessionStorage.getItem('emdad_active_space');
    return saved === 'supply' || saved === 'fuel' ? saved : null;
  });
  const [activeDoor, setActiveDoor] = useState<string>('dashboard');
  const [navIntent, setNavIntent] = useState<DoorNavigationIntent | null>(null);
  const [activeRecordCount, setActiveRecordCount] = useState<number>(0);
  const [locked, setLocked] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [printPreview, setPrintPreview] = useState<PrintPreviewState | null>(null);
  const [numberPrefs, setNumberPrefs] = useState<ImdNumberPrefs>(() => ImdNumbers.load());
  const [activationStatus, setActivationStatus] = useState<ActivationPayload | null>(null);
  const [keyRecoveryRequired, setKeyRecoveryRequired] = useState<boolean>(false);
  const prevSyncedUserRef = useRef<User | null>(null);

  // Boot local-first database (and auto-upgrade untouched sparse v1 seed to rich v2 operational dataset)
  useEffect(() => {
    let mounted = true;
    (async () => {
      let state = await loadPersistedState();
      const isSparseUntouchedV1 =
        state &&
        state.items.length <= 10 &&
        state.receipts.length <= 2 &&
        state.warehouses.length <= 3 &&
        state.fuel_issues.length <= 3 &&
        state.audit_logs.length <= 2;
      if (!state || isSparseUntouchedV1) {
        state = await buildInitialSeedState();
        await savePersistedState(state);
      } else if (!state.config.activationToken && state.users.some((u) => u.id === 'usr_owner')) {
        // Auto-issue initial local activation token when upgrading existing seeded state from earlier phase
        const token = await DeviceActivation.issueCertificate({
          deviceId: state.config.deviceId,
          issuedTo: state.config.orgName,
          role: 'master',
          branch: 'المركز الرئيسي',
        });
        state = { ...state, config: { ...state.config, activationToken: token } };
        await savePersistedState(state);
      }
      if (mounted) {
        setDb(state);
        setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Multi-tab real-time BroadcastChannel synchronization
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(TAB_SYNC_CHANNEL);
    ch.onmessage = (ev: MessageEvent<{ senderId?: string; state?: EmdadDbState }>) => {
      if (!ev.data || ev.data.senderId === TAB_INSTANCE_ID || !ev.data.state) return;
      setDb(ev.data.state);
    };
    return () => ch.close();
  }, []);

  const currentUser = useMemo(() => {
    if (!db || !currentUserId) return null;
    return db.users.find((u) => u.id === currentUserId && u.active && u.approved) ?? null;
  }, [db, currentUserId]);

  // Verify DeviceActivation certificate + revocations whenever token updates
  const refreshActivationStatus = useCallback(async () => {
    if (!db) return;
    const res = await DeviceActivation.verifyToken(db.config.activationToken, loadDeviceRevocations());
    setActivationStatus(res);
  }, [db]);

  useEffect(() => {
    void refreshActivationStatus();
  }, [refreshActivationStatus]);

  // Live userVersion watcher: detect permission/role/block changes from BroadcastChannel/sync
  useEffect(() => {
    if (!currentUser) {
      prevSyncedUserRef.current = null;
      return;
    }
    if (prevSyncedUserRef.current && AuthService.hasUserVersionChanged(prevSyncedUserRef.current, currentUser)) {
      SysNotice.emit(
        'USER_VERSION_SYNCED',
        'تم تحديث صلاحيات أو نطاق حسابك عبر المزامنة وتم تطبيقها فوراً.',
        'warn'
      );
    }
    prevSyncedUserRef.current = currentUser;
  }, [currentUser]);

  // Apply active theme & space palette
  useEffect(() => {
    if (!db) return;
    applyThemeToDocument(db.config, activeSpace ?? 'supply');
  }, [db?.config, activeSpace]);

  // Auto Idle Lock timer via IdleLockController
  useEffect(() => {
    if (!currentUser || !db || db.config.idleLockMinutes <= 0) return;
    const controller = new IdleLockController(db.config.idleLockMinutes, (nextLocked) => {
      setLocked(nextLocked);
    });
    controller.start();
    return () => controller.stop();
  }, [currentUser, db?.config.idleLockMinutes]);

  const notify = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = Ids.next('tst');
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return SysNotice.subscribe((item) => {
      notify(item.message, item.tone);
    });
  }, [notify]);

  const mutateDb = useCallback((updater: (prev: EmdadDbState) => EmdadDbState) => {
    setDb((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (next === prev) return prev;

      const changedKeys = (Object.keys(next) as Array<keyof EmdadDbState>).filter(
        (k) => next[k] !== prev[k]
      );
      if (changedKeys.length > 0 && changedKeys.length <= 5) {
        for (const k of changedKeys) {
          void saveTableSlice(k, next[k]);
        }
      } else if (changedKeys.length > 5) {
        void savePersistedState(next);
      }

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const ch = new BroadcastChannel(TAB_SYNC_CHANNEL);
          ch.postMessage({ senderId: TAB_INSTANCE_ID, state: next });
          ch.close();
        } catch {
          // ignore channel errors
        }
      }
      return next;
    });
  }, []);

  const upsertRow = useCallback(
    <K extends CollectionKey>(
      collection: K,
      row: EmdadDbState[K] extends Array<infer U> ? U : never
    ) => {
      try {
        const guardedRow = enforceQuantityGuard(
          collection,
          row as unknown as Record<string, unknown>
        ) as unknown as typeof row;
        mutateDb((prev) => {
          const list = prev[collection] as Array<{ id?: string; itemId?: string }>;
          const targetId =
            (guardedRow as { id?: string; itemId?: string }).id ??
            (guardedRow as { itemId?: string }).itemId ??
            '';
          const idx = list.findIndex((x) => (x.id ?? x.itemId) === targetId);
          const updated =
            idx >= 0 ? list.map((x, i) => (i === idx ? guardedRow : x)) : [guardedRow, ...list];
          SyncMarks.record(
            collection,
            String(targetId),
            idx >= 0 ? 'UPDATE' : 'INSERT',
            prev.config.deviceId
          );
          return { ...prev, [collection]: updated };
        });
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err), 'danger');
      }
    },
    [mutateDb, notify]
  );

  const deleteRow = useCallback(
    (collection: CollectionKey, id: string) => {
      mutateDb((prev) => {
        if (collection === 'items') {
          try {
            assertCanDeleteItem(prev, id);
          } catch (err) {
            notify(err instanceof Error ? err.message : String(err), 'danger');
            return prev;
          }
        }
        const list = prev[collection] as Array<{ id?: string; itemId?: string }>;
        SyncMarks.record(collection, id, 'DELETE', prev.config.deviceId);
        return {
          ...prev,
          [collection]: list.filter((x) => (x.id ?? x.itemId) !== id),
        };
      });
    },
    [mutateDb, notify]
  );

  const updateConfig = useCallback(
    (patch: Partial<SystemConfig>) => {
      mutateDb((prev) => ({
        ...prev,
        config: { ...prev.config, ...patch },
      }));
    },
    [mutateDb]
  );

  const nextDocRef = useCallback(
    (kind: DocKind): string => {
      const prefix = DOC_PREFIXES[kind];
      let assigned = '';
      mutateDb((prev) => {
        const existing = prev.doc_counters.find((c) => c.prefix === prefix);
        const nextSeq = (existing?.seq ?? 0) + 1;
        assigned = formatDocNumber(prefix, prev.config.deviceId, nextSeq);
        const nextCounters = existing
          ? prev.doc_counters.map((c) => (c.prefix === prefix ? { ...c, seq: nextSeq } : c))
          : [...prev.doc_counters, { prefix, seq: nextSeq }];
        return { ...prev, doc_counters: nextCounters };
      });
      return assigned || formatDocNumber(prefix, db?.config.deviceId ?? 'K7QX2A', 1);
    },
    [db?.config.deviceId, mutateDb]
  );

  const logAudit = useCallback(
    (params: {
      action: string;
      entityType: string;
      summary: string;
      risk?: RiskLevel;
      refNo?: string;
      warehouse?: string;
      target?: string;
      status?: string;
      itemCount?: number;
      qty?: number;
      details?: Record<string, unknown>;
    }) => {
      const entry: AuditLog = {
        id: Ids.next('aud'),
        action: params.action,
        entityType: params.entityType,
        summary: params.summary,
        details: params.details ?? {},
        risk: params.risk ?? 'normal',
        actorEmail: currentUser?.email ?? 'system@imdad.local',
        actorName: currentUser?.name ?? 'النظام',
        actorRole: currentUser?.role ?? 'user',
        logDate: todayIso(),
        refNo: params.refNo ?? '',
        warehouse: params.warehouse ?? '',
        target: params.target ?? '',
        status: params.status ?? 'COMPLETED',
        itemCount: params.itemCount ?? 1,
        qty: params.qty ?? 0,
        createdAt: new Date().toISOString(),
      };
      mutateDb((prev) => ({
        ...prev,
        audit_logs: [entry, ...prev.audit_logs],
      }));
    },
    [currentUser, mutateDb]
  );

  const setActiveSpace = useCallback((space: AppSpace | null) => {
    setActiveSpaceState(space);
    if (space) {
      sessionStorage.setItem('emdad_active_space', space);
      setActiveDoor(space === 'fuel' ? 'fuelDashboard' : 'dashboard');
    } else {
      sessionStorage.removeItem('emdad_active_space');
    }
  }, []);

  const navigateTo = useCallback((intent: Omit<DoorNavigationIntent, 'ts'>) => {
    if (intent.space) {
      setActiveSpaceState(intent.space);
      sessionStorage.setItem('emdad_active_space', intent.space);
    }
    setActiveDoor(intent.door);
    setNavIntent({ ...intent, ts: Date.now() });
  }, []);

  const clearNavIntent = useCallback(() => {
    setNavIntent(null);
  }, []);

  const login = useCallback(
    (user: User) => {
      setCurrentUserId(user.id);
      sessionStorage.setItem('emdad_session_uid', user.id);
      setLocked(false);

      const canSupply = user.role === 'owner' || user.role === 'admin' || hasPerm(user, 'space.supply');
      const canFuel = user.role === 'owner' || user.role === 'admin' || hasPerm(user, 'space.fuel');

      if (canSupply && !canFuel) {
        setActiveSpace('supply');
      } else if (canFuel && !canSupply) {
        setActiveSpace('fuel');
      } else {
        setActiveSpace(null); // Show SpaceChooserScreen
      }
    },
    [setActiveSpace]
  );

  const logout = useCallback(() => {
    setCurrentUserId(null);
    sessionStorage.removeItem('emdad_session_uid');
    sessionStorage.removeItem('emdad_active_space');
    setActiveSpaceState(null);
    setLocked(false);
  }, []);

  const openPrintPreview = useCallback(
    async (doc: PrintableDocument) => {
      if (!db) return;
      const res = await buildPrintableHtmlAndArchive({ doc, config: db.config });
      if (res.archiveEntry) {
        mutateDb((prev) => ({
          ...prev,
          archive_files: [res.archiveEntry!, ...prev.archive_files],
        }));
        notify(`تمت أرشفة السند تلقائياً (${doc.refNo}) ببصمة SHA-256`, 'success');
      }
      setPrintPreview({
        doc,
        html: res.html,
        signatureCode: res.signatureCode,
        qrDataUrl: res.qrDataUrl,
      });
    },
    [db, mutateDb, notify]
  );

  const closePrintPreview = useCallback(() => setPrintPreview(null), []);

  const resetAllLocalData = useCallback(async () => {
    await clearPersistedState();
    const fresh = await buildInitialSeedState();
    await savePersistedState(fresh);
    setDb(fresh);
    logout();
    notify('تمت إعادة تهيئة قاعدة البيانات المحلية بنجاح', 'info');
  }, [logout, notify]);

  const ledger = useMemo(() => {
    if (!db) return [];
    return computeStockLedger({
      items: db.items,
      warehouses: db.warehouses.map((w) => w.name),
      openings: db.opening_balances,
      receipts: db.receipts,
      issues: db.issues,
      transfers: db.transfers,
      returns: db.returns,
      adjustments: db.adjustments,
    });
  }, [
    db?.items,
    db?.warehouses,
    db?.opening_balances,
    db?.receipts,
    db?.issues,
    db?.transfers,
    db?.returns,
    db?.adjustments,
  ]);

  const fuelTanks = useMemo(() => {
    if (!db) return [];
    const lowPct = db.fuel_settings_rows[0]?.lowStockPercent ?? 20;
    return computeFuelTankBalances({
      warehouses: db.fuel_warehouses,
      openings: db.fuel_openings,
      supplies: db.fuel_supplies,
      issues: db.fuel_issues,
      transfers: db.fuel_transfers,
      lowStockPercent: lowPct,
    });
  }, [
    db?.fuel_warehouses,
    db?.fuel_openings,
    db?.fuel_supplies,
    db?.fuel_issues,
    db?.fuel_transfers,
    db?.fuel_settings_rows,
  ]);

  const replaceDbState = useCallback(async (nextDb: EmdadDbState) => {
    await savePersistedState(nextDb);
    setDb(nextDb);
  }, []);

  const updateNumberPrefs = useCallback((prefs: ImdNumberPrefs) => {
    const saved = ImdNumbers.save(prefs);
    setNumberPrefs(saved);
  }, []);

  const fmt = useCallback(
    (n: number, decimals?: number) =>
      nf(n, {
        ...numberPrefs,
        qtyDecimals: decimals ?? numberPrefs.qtyDecimals,
        uiDigits: db?.config.numerals ?? numberPrefs.uiDigits,
      }),
    [db?.config.numerals, numberPrefs]
  );

  const fmtMoney = useCallback(
    (n: number) =>
      nfMoney(n, {
        ...numberPrefs,
        uiDigits: db?.config.numerals ?? numberPrefs.uiDigits,
      }),
    [db?.config.numerals, numberPrefs]
  );

  if (!ready || !db) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--imd-bg)', color: 'var(--imd-text)' }}
      >
        <div className="text-center space-y-2">
          <div className="text-lg font-bold">نظام الإمداد والتموين</div>
          <div className="text-sm" style={{ color: 'var(--imd-muted)' }}>
            جاري تهيئة قاعدة البيانات المحلية المشفّرة...
          </div>
        </div>
      </div>
    );
  }

  return (
    <EmdadContext.Provider
      value={{
        ready,
        db,
        currentUser,
        activeSpace,
        activeDoor,
        navIntent,
        navigateTo,
        clearNavIntent,
        activeRecordCount,
        setActiveRecordCount,
        setActiveSpace,
        setActiveDoor,
        login,
        logout,
        locked,
        unlockSession: () => setLocked(false),
        lockSession: () => setLocked(true),
        ledger,
        fuelTanks,
        toasts,
        notify,
        dismissToast,
        mutateDb,
        upsertRow,
        deleteRow,
        updateConfig,
        nextDocRef,
        logAudit,
        openPrintPreview,
        printPreview,
        closePrintPreview,
        resetAllLocalData,
        replaceDbState,
        fmt,
        fmtMoney,
        numberPrefs,
        updateNumberPrefs,
        activationStatus,
        refreshActivationStatus,
        keyRecoveryRequired,
        setKeyRecoveryRequired,
      }}
    >
      {children}
    </EmdadContext.Provider>
  );
};

export function useEmdad(): EmdadContextValue {
  const ctx = useContext(EmdadContext);
  if (!ctx) throw new Error('useEmdad must be used inside EmdadProvider');
  return ctx;
}
