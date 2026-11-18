// Local LAN Sync & Conflicts Resolution Engine (HLC, Differential Packets, AES-256-GCM, SyncConflicts Bulk Resolve)

import { decryptBackupJson, encryptBackupJson, Ids, sha256Hex } from '../../core/security/crypto';
import type { SyncConflict } from '../../domain/types';
import type { CollectionKey, EmdadDbState } from '../db';
import { SyncMarks, type SyncMarkEntry } from '../dbGuards';

export const SYNC_EXCLUDED_COLLECTIONS: ReadonlySet<CollectionKey> = new Set([
  'sync_conflicts',
  'doc_counters',
]);

export interface SyncPacketHeader {
  format: 'IMDAD_LAN_SYNC_V1';
  sourceDeviceId: string;
  hlc: string;
  nonce: string;
  exportedAt: string;
  sinceIso: string;
  recordCount: number;
  tombstoneCount?: number;
  sha256: string;
}

export interface SyncPacketPayload {
  header: SyncPacketHeader;
  tables: Partial<Record<CollectionKey, Array<Record<string, unknown>>>>;
  tombstones?: SyncMarkEntry[];
}

export function generateHlcTimestamp(deviceId: string): string {
  const now = Date.now();
  const devShort = (deviceId || 'LOCAL').slice(0, 6);
  const seq = Math.floor(Math.random() * 9000 + 1000);
  return `${now}-${seq}-${devShort}`;
}

const SYNC_FLOOR_STORAGE_KEY = 'emdad_sync_delivered_floor_v1';
let memoryDeliveredFloor = '1970-01-01T00:00:00.000Z';

export function getDeliveredFloor(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(SYNC_FLOOR_STORAGE_KEY) ?? memoryDeliveredFloor;
    }
  } catch {
    // fallback
  }
  return memoryDeliveredFloor;
}

export function setDeliveredFloor(iso: string): void {
  memoryDeliveredFloor = iso;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SYNC_FLOOR_STORAGE_KEY, iso);
    }
  } catch {
    // fallback
  }
}

/**
 * Exports differential encrypted LAN sync packet using pairing code (PBKDF2 100k + AES-256-GCM).
 * Includes both modified rows and SyncMarks DELETE tombstones.
 */
export async function exportEncryptedSyncPacket(
  db: EmdadDbState,
  pairCode: string,
  sinceIso?: string
): Promise<{ encrypted: string; header: SyncPacketHeader }> {
  const floor = sinceIso ?? getDeliveredFloor();
  const tables: Partial<Record<CollectionKey, Array<Record<string, unknown>>>> = {};
  let recordCount = 0;

  // Build map of SyncMarks for row-level change detection even on tables without updatedAt
  const allMarks = SyncMarks.getAll();
  const markTimeByTableRow = new Map<string, string>();
  for (const m of allMarks) {
    if (m.op !== 'DELETE') {
      markTimeByTableRow.set(`${m.tableName}:${m.rowKey}`, m.updatedAt);
    }
  }

  for (const key of Object.keys(db) as Array<keyof EmdadDbState>) {
    if (key === 'config') continue;
    const colKey = key as CollectionKey;
    if (SYNC_EXCLUDED_COLLECTIONS.has(colKey)) continue;
    const arr = db[colKey];
    if (!Array.isArray(arr)) continue;

    const changed = (arr as unknown as Array<Record<string, unknown>>).filter((r) => {
      const rid = String(r.id ?? r.itemId ?? r.key ?? '');
      const markTs = rid ? markTimeByTableRow.get(`${colKey}:${rid}`) : undefined;
      const ts = String(markTs ?? r.updatedAt ?? r.createdAt ?? r.date ?? '');
      return !floor || !ts || ts >= floor;
    });
    if (changed.length > 0) {
      tables[colKey] = changed;
      recordCount += changed.length;
    }
  }

  const tombstones = SyncMarks.getDeleteTombstones(floor);
  const tablesJson = JSON.stringify(tables);
  const digest = await sha256Hex(tablesJson);
  const header: SyncPacketHeader = {
    format: 'IMDAD_LAN_SYNC_V1',
    sourceDeviceId: db.config.deviceId,
    hlc: generateHlcTimestamp(db.config.deviceId),
    nonce: Ids.next('nonce'),
    exportedAt: new Date().toISOString(),
    sinceIso: floor,
    recordCount: recordCount + tombstones.length,
    tombstoneCount: tombstones.length,
    sha256: digest,
  };

  const payload: SyncPacketPayload = { header, tables, tombstones };
  const encrypted = await encryptBackupJson(JSON.stringify(payload), pairCode.trim());
  return { encrypted, header };
}

/**
 * Decrypts, verifies integrity, and merges peer differential packet (rows + SyncMarks DELETE tombstones).
 * Any record modified locally after deliveredFloor and also present in peer packet is captured in sync_conflicts.
 */
export async function mergeEncryptedSyncPacket(
  prev: EmdadDbState,
  encryptedText: string,
  pairCode: string
): Promise<{ nextState: EmdadDbState; mergedCount: number; conflictsAdded: number; sourceDeviceId: string }> {
  const plain = await decryptBackupJson(encryptedText, pairCode.trim());
  const payload = JSON.parse(plain) as SyncPacketPayload;
  if (!payload?.header || payload.header.format !== 'IMDAD_LAN_SYNC_V1') {
    throw new Error('صيغة حزمة المزامنة غير صالحة');
  }

  const checkHash = await sha256Hex(JSON.stringify(payload.tables));
  if (checkHash !== payload.header.sha256) {
    throw new Error('فشل التحقق من سلامة حزمة المزامنة (SHA-256 mismatch)');
  }

  const floor = getDeliveredFloor();
  const next: EmdadDbState = { ...prev };
  const newConflicts: SyncConflict[] = [];
  let mergedCount = 0;

  for (const [tableName, peerRows] of Object.entries(payload.tables) as Array<
    [CollectionKey, Array<Record<string, unknown>>]
  >) {
    if (!Array.isArray(peerRows) || SYNC_EXCLUDED_COLLECTIONS.has(tableName)) continue;
    const localRows = [...((next[tableName] as unknown as Array<Record<string, unknown>>) ?? [])];
    const indexById = new Map<string, number>();
    localRows.forEach((r, idx) => {
      const rid = String(r.id ?? r.itemId ?? r.key ?? '');
      if (rid) indexById.set(rid, idx);
    });

    for (const peerRow of peerRows) {
      const rid = String(peerRow.id ?? peerRow.itemId ?? peerRow.key ?? '');
      if (!rid) continue;
      const existingIdx = indexById.get(rid);
      if (existingIdx === undefined) {
        localRows.unshift(peerRow);
        mergedCount += 1;
      } else {
        const localRow = localRows[existingIdx];
        const localTs = String(localRow.updatedAt ?? localRow.createdAt ?? '');
        const peerTs = String(peerRow.updatedAt ?? peerRow.createdAt ?? '');
        const same = JSON.stringify(localRow) === JSON.stringify(peerRow);
        if (!same) {
          if (localTs && localTs > floor && peerTs !== localTs) {
            newConflicts.push({
              id: Ids.next('cnf'),
              table: tableName,
              recordId: rid,
              localSnapshot: localRow,
              peerSnapshot: peerRow,
              peerName: payload.header.sourceDeviceId,
              detectedAt: new Date().toISOString(),
              resolved: false,
            });
          }
          // Last-writer / peer wins in table, with localSnapshot preserved in sync_conflicts for recovery
          localRows[existingIdx] = peerRow;
          mergedCount += 1;
        }
      }
    }

    (next as unknown as Record<string, unknown>)[tableName] = localRows;
  }

  // Apply SyncMarks DELETE tombstones from peer
  if (Array.isArray(payload.tombstones) && payload.tombstones.length > 0) {
    for (const tomb of payload.tombstones) {
      if (tomb.op !== 'DELETE') continue;
      const tableName = tomb.tableName as CollectionKey;
      if (SYNC_EXCLUDED_COLLECTIONS.has(tableName)) continue;
      const localRows = [...((next[tableName] as unknown as Array<Record<string, unknown>>) ?? [])];
      const idx = localRows.findIndex(
        (r) => String(r.id ?? r.itemId ?? r.key ?? '') === tomb.rowKey
      );
      if (idx >= 0) {
        const existingRow = localRows[idx];
        const localTs = String(existingRow.updatedAt ?? existingRow.createdAt ?? '');
        if (localTs && localTs > tomb.updatedAt) {
          newConflicts.push({
            id: Ids.next('cnf'),
            table: tableName,
            recordId: tomb.rowKey,
            localSnapshot: existingRow,
            peerSnapshot: null,
            peerName: payload.header.sourceDeviceId,
            detectedAt: new Date().toISOString(),
            resolved: false,
          });
        } else {
          localRows.splice(idx, 1);
          (next as unknown as Record<string, unknown>)[tableName] = localRows;
          mergedCount += 1;
        }
      }
    }
  }

  next.sync_conflicts = [...newConflicts, ...prev.sync_conflicts];
  setDeliveredFloor(new Date().toISOString());

  return {
    nextState: next,
    mergedCount,
    conflictsAdded: newConflicts.length,
    sourceDeviceId: payload.header.sourceDeviceId,
  };
}

export function applyConflictResolution(
  prev: EmdadDbState,
  conflictIds: string[],
  mode: 'restore_local' | 'accept_peer'
): EmdadDbState {
  const idSet = new Set(conflictIds);
  const next: EmdadDbState = { ...prev };

  for (const c of prev.sync_conflicts) {
    if (!idSet.has(c.id) || c.resolved) continue;
    const tableKey = c.table as CollectionKey;
    const rows = [...((next[tableKey] as unknown as Array<Record<string, unknown>>) ?? [])];
    const snapshot = (mode === 'restore_local' ? c.localSnapshot : c.peerSnapshot) as Record<
      string,
      unknown
    > | null;
    if (snapshot) {
      const idx = rows.findIndex(
        (r) => String(r.id ?? r.itemId ?? r.key ?? '') === c.recordId
      );
      if (idx >= 0) rows[idx] = snapshot;
      else rows.unshift(snapshot);
      (next as unknown as Record<string, unknown>)[tableKey] = rows;
    }
  }

  next.sync_conflicts = prev.sync_conflicts.map((c) =>
    idSet.has(c.id) ? { ...c, resolved: true } : c
  );
  return next;
}
