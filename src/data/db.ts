// IndexedDB Local-First Database (Schema Version 31) with all 59 object stores & reactive state

import type {
  Adjustment,
  ArchiveFile,
  Asset,
  AssetAssignment,
  AuditLog,
  BeneficiaryUnit,
  Cable,
  CampLedger,
  CampStockLimit,
  Category,
  Destruction,
  DocCounter,
  Entitlement,
  EntitlementGroup,
  Facility,
  FuelAllocation,
  FuelAuditLog,
  FuelIssue,
  FuelMaintenance,
  FuelOpening,
  FuelSettingsRow,
  FuelStocktake,
  FuelStocktakeLine,
  FuelSupply,
  FuelTankReading,
  FuelTransfer,
  FuelUnit,
  FuelWarehouse,
  Issue,
  Item,
  KitchenLog,
  LinkArmament,
  LinkClearance,
  LinkCustodySheet,
  LinkCustodySheetRow,
  LinkFinCustody,
  LinkFinanceLedger,
  LinkMoneyReceipt,
  LinkPerson,
  LinkPurchaseContract,
  LinkStatusLog,
  LinkTerm,
  MealDispatch,
  MealDispatchLine,
  MealHeadcount,
  MealPlan,
  MealPlanEntry,
  MonthlySettlement,
  OpeningBalance,
  RationOrder,
  RationOrderLine,
  Receipt,
  ReturnRecord,
  SensitiveReview,
  Stocktake,
  StocktakeLine,
  StrengthRecord,
  Supplier,
  SupplyAuthority,
  SyncConflict,
  SystemConfig,
  Transfer,
  User,
  Warehouse,
  WarehouseStockLimit,
} from '../domain/types';

import { DbCipher, kSchemaVersion, PreMigrationBackup } from './dbGuards';

export const SCHEMA_VERSION = kSchemaVersion;
export const DB_NAME = 'emdad_erp_local_v31';
export const TABLES_STORE = 'tables_v31';

export interface EmdadDbState {
  users: User[];
  categories: Category[];
  items: Item[];
  warehouses: Warehouse[];
  suppliers: Supplier[];
  beneficiary_units: BeneficiaryUnit[];
  facilities: Facility[];
  audit_logs: AuditLog[];
  sensitive_reviews: SensitiveReview[];
  receipts: Receipt[];
  issues: Issue[];
  transfers: Transfer[];
  returns: ReturnRecord[];
  opening_balances: OpeningBalance[];
  destructions: Destruction[];
  adjustments: Adjustment[];
  stocktakes: Stocktake[];
  stocktake_lines: StocktakeLine[];
  assets: Asset[];
  asset_assignments: AssetAssignment[];
  strengths: StrengthRecord[];
  kitchen_logs: KitchenLog[];
  entitlements: Entitlement[];
  entitlement_groups: EntitlementGroup[];
  meal_plans: MealPlan[];
  meal_plan_entries: MealPlanEntry[];
  meal_headcounts: MealHeadcount[];
  meal_dispatches: MealDispatch[];
  meal_dispatch_lines: MealDispatchLine[];
  supply_authorities: SupplyAuthority[];
  ration_orders: RationOrder[];
  ration_order_lines: RationOrderLine[];
  camp_ledgers: CampLedger[];
  warehouse_stock_limits: WarehouseStockLimit[];
  camp_stock_limits: CampStockLimit[];
  monthly_settlements: MonthlySettlement[];
  fuel_warehouses: FuelWarehouse[];
  fuel_units: FuelUnit[];
  fuel_settings_rows: FuelSettingsRow[];
  fuel_allocations: FuelAllocation[];
  fuel_issues: FuelIssue[];
  fuel_supplies: FuelSupply[];
  fuel_openings: FuelOpening[];
  fuel_transfers: FuelTransfer[];
  fuel_stocktakes: FuelStocktake[];
  fuel_stocktake_lines: FuelStocktakeLine[];
  fuel_tank_readings: FuelTankReading[];
  fuel_maintenances: FuelMaintenance[];
  fuel_audit_logs: FuelAuditLog[];
  link_persons: LinkPerson[];
  link_status_logs: LinkStatusLog[];
  link_terms: LinkTerm[];
  link_fin_custodies: LinkFinCustody[];
  link_clearances: LinkClearance[];
  link_purchase_contracts: LinkPurchaseContract[];
  link_custody_sheets: LinkCustodySheet[];
  link_custody_sheet_rows: LinkCustodySheetRow[];
  link_armaments: LinkArmament[];
  link_money_receipts: LinkMoneyReceipt[];
  link_finance_ledger: LinkFinanceLedger[];
  cables: Cable[];
  archive_files: ArchiveFile[];
  doc_counters: DocCounter[];
  sync_conflicts: SyncConflict[];
  config: SystemConfig;
}

export type CollectionKey = Exclude<keyof EmdadDbState, 'config'>;

const STORAGE_KEY = 'emdad_local_snapshot_v31';
const TABLE_SLICE_PREFIX = 'emdad_tbl_v31:';

function ensureNewCollections(state: EmdadDbState): EmdadDbState {
  return {
    ...state,
    fuel_tank_readings: Array.isArray(state.fuel_tank_readings) ? state.fuel_tank_readings : [],
    fuel_maintenances: Array.isArray(state.fuel_maintenances) ? state.fuel_maintenances : [],
    fuel_audit_logs: Array.isArray(state.fuel_audit_logs) ? state.fuel_audit_logs : [],
  };
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
      if (!db.objectStoreNames.contains(TABLES_STORE)) {
        db.createObjectStore(TABLES_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadPersistedState(): Promise<EmdadDbState | null> {
  // Phase 2: Fail-closed cipher key verification on database open
  DbCipher.requireCipher();

  // 1. Try loading per-table AES-256-GCM encrypted slices from IndexedDB `tables_v31`
  try {
    const db = await openIdb();
    const rawSlices = await new Promise<Record<string, string>>((resolve, reject) => {
      const tx = db.transaction(TABLES_STORE, 'readonly');
      const store = tx.objectStore(TABLES_STORE);
      const out: Record<string, string> = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && typeof cursor.value === 'string') {
            out[cursor.key] = cursor.value;
          }
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });

    const keys = Object.keys(rawSlices);
    if (keys.length > 0 && rawSlices.config && rawSlices.users) {
      db.close();
      const assembled: Record<string, unknown> = {};
      for (const k of keys) {
        const plainJson = await DbCipher.decryptAtRest(rawSlices[k]);
        assembled[k] = JSON.parse(plainJson);
      }
      const state = ensureNewCollections(assembled as unknown as EmdadDbState);
      const savedSchema = state.config?.schemaVersion ?? 30;
      if (savedSchema < kSchemaVersion) {
        PreMigrationBackup.createBeforeUpgrade(
          savedSchema,
          kSchemaVersion,
          JSON.stringify({ config: state.config, itemsCount: state.items?.length ?? 0 })
        );
        state.config.schemaVersion = kSchemaVersion;
      }
      return state;
    }

    // 2. Fallback to legacy `kv` single-blob in IndexedDB and migrate to encrypted `tables_v31`
    const legacyVal = await new Promise<EmdadDbState | string | null>((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const req = store.get(STORAGE_KEY);
      req.onsuccess = () => resolve((req.result as EmdadDbState | string) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (legacyVal) {
      const parsed: EmdadDbState =
        typeof legacyVal === 'string'
          ? (JSON.parse(await DbCipher.decryptAtRest(legacyVal)) as EmdadDbState)
          : legacyVal;
      const rawJson = JSON.stringify(parsed);
      DbCipher.migratePlainIfNeeded(rawJson);
      const normalized = ensureNewCollections(parsed);
      const savedSchema = normalized.config?.schemaVersion ?? 30;
      if (savedSchema < kSchemaVersion) {
        PreMigrationBackup.createBeforeUpgrade(savedSchema, kSchemaVersion, rawJson);
        normalized.config.schemaVersion = kSchemaVersion;
      }
      // Migrate into encrypted per-table store asynchronously
      void savePersistedState(normalized);
      return normalized;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'DbCipherException') throw err;
    // Fallback to localStorage if IDB blocked
  }

  // 3. Fallback to localStorage (per-table slices or legacy snapshot)
  try {
    const rawConfig = localStorage.getItem(`${TABLE_SLICE_PREFIX}config`);
    if (rawConfig) {
      const assembled: Record<string, unknown> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (storageKey && storageKey.startsWith(TABLE_SLICE_PREFIX)) {
          const tableKey = storageKey.slice(TABLE_SLICE_PREFIX.length);
          const cipherVal = localStorage.getItem(storageKey);
          if (cipherVal) {
            const plain = await DbCipher.decryptAtRest(cipherVal);
            assembled[tableKey] = JSON.parse(plain);
          }
        }
      }
      if (assembled.config && assembled.users) {
        return ensureNewCollections(assembled as unknown as EmdadDbState);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const plainJson = await DbCipher.decryptAtRest(raw);
    const parsed = ensureNewCollections(JSON.parse(plainJson) as EmdadDbState);
    const savedSchema = parsed.config?.schemaVersion ?? 30;
    if (savedSchema < kSchemaVersion) {
      PreMigrationBackup.createBeforeUpgrade(savedSchema, kSchemaVersion, plainJson);
      parsed.config.schemaVersion = kSchemaVersion;
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.name === 'DbCipherException') throw err;
    return null;
  }
}

/**
 * O(1) Single-Table Encrypted Slice Persistence:
 * Encrypts and persists only the changed table (`users`, `items`, `receipts`, ..., `config`)
 * into IndexedDB `tables_v31` without re-serializing the other 61 tables.
 */
export async function saveTableSlice<K extends keyof EmdadDbState>(
  tableKey: K,
  value: EmdadDbState[K]
): Promise<void> {
  DbCipher.requireCipher();
  const plainJson = JSON.stringify(value);
  const encryptedPayload = await DbCipher.encryptAtRest(plainJson);

  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TABLES_STORE, 'readwrite');
      const store = tx.objectStore(TABLES_STORE);
      const req = store.put(encryptedPayload, String(tableKey));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    try {
      localStorage.setItem(`${TABLE_SLICE_PREFIX}${String(tableKey)}`, encryptedPayload);
    } catch {
      // ignore quota error
    }
  }
}

/**
 * Full Database Encrypted Persistence:
 * Encrypts each table slice with AES-256-GCM and writes all slices in a single IndexedDB transaction.
 */
export async function savePersistedState(state: EmdadDbState): Promise<void> {
  DbCipher.requireCipher();
  const keys = Object.keys(state) as Array<keyof EmdadDbState>;
  const encryptedEntries: Array<[string, string]> = [];

  for (const k of keys) {
    const plainJson = JSON.stringify(state[k]);
    const enc = await DbCipher.encryptAtRest(plainJson);
    encryptedEntries.push([String(k), enc]);
  }

  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([TABLES_STORE, 'kv'], 'readwrite');
      const tableStore = tx.objectStore(TABLES_STORE);
      for (const [k, enc] of encryptedEntries) {
        tableStore.put(enc, k);
      }
      // Remove legacy unencrypted full snapshot from kv if present
      tx.objectStore('kv').delete(STORAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    try {
      for (const [k, enc] of encryptedEntries) {
        localStorage.setItem(`${TABLE_SLICE_PREFIX}${k}`, enc);
      }
    } catch {
      // ignore quota error
    }
  }
}

export async function clearPersistedState(): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([TABLES_STORE, 'kv'], 'readwrite');
      tx.objectStore(TABLES_STORE).clear();
      tx.objectStore('kv').delete(STORAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
  try {
    const toRemove: string[] = [STORAGE_KEY];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(TABLE_SLICE_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}
