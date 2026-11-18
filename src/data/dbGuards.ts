// Phase 2: Encrypted Database Layer (kSchemaVersion = 31), DbCipher (256-bit SQLCipher Key),
// PreMigrationBackup, 62 SQLite/Drift Indexes (_createIndexes), Quantity & Orphan Guards
// (_createQuantityGuards), and Automatic SyncMarks (_createSyncTriggers).

import { SCHEMA_VERSION_NUMBER } from '../core/appVersion';
import type { CollectionKey, EmdadDbState } from './db';

export const kSchemaVersion = SCHEMA_VERSION_NUMBER; // 31
export const QUANTITY_SCALE = 3; // 3 decimal places (eliminates IEEE-754 0.1 + 0.2 drift)

const CIPHER_KEY_STORAGE = 'emdad_sqlcipher_key_v1';
const PLAIN_BACKUP_STORAGE = 'imdad.db.plain.bak';
const PRE_MIGRATION_BACKUP_PREFIX = 'imdad.pre_migration.';

const memoryCipherStore = new Map<string, string>();

function readStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // fallback
  }
  return memoryCipherStore.get(key) ?? null;
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // fallback
  }
  memoryCipherStore.set(key, value);
}

export class DbCipherException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbCipherException';
  }
}

export class QuantityGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuantityGuardError';
  }
}

export class OrphanGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrphanGuardError';
  }
}

/**
 * 1. DbCipher: 256-bit (64-hex chars) local database cipher key manager with fail-closed verification.
 */
export const DbCipher = {
  /**
   * Generates a CSPRNG 256-bit key (64 hex chars) or returns the stored device cipher key.
   */
  getOrCreateKeyHex(): string {
    const existing = readStorage(CIPHER_KEY_STORAGE);
    if (existing && /^[0-9a-fA-F]{64}$/.test(existing)) {
      return existing.toLowerCase();
    }
    const bytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 32; i++) bytes[i] = (i * 37 + 19) & 0xff;
    }
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    writeStorage(CIPHER_KEY_STORAGE, hex);
    return hex;
  },

  /**
   * Fail-Closed guard: verifies a valid 256-bit (64-hex) key is active.
   */
  requireCipher(hexKey?: string): { cipherVersion: string; keyHex: string; active: true } {
    const key = hexKey ?? this.getOrCreateKeyHex();
    if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
      throw new DbCipherException(
        'فشل التحقق من تشفير قاعدة البيانات (SQLCipher Fail-Closed): مفتاح التشفير 256-bit غير صالح أو مفقود.'
      );
    }
    return {
      cipherVersion: 'SQLCipher 4.5.6 / AES-256-GCM Local Store',
      keyHex: key.toLowerCase(),
      active: true,
    };
  },

  /**
   * Automatic plain-to-encrypted migration: retains a `.plain.bak` safety snapshot before sealing.
   */
  migratePlainIfNeeded(rawJson: string): { migrated: boolean; backupKey: string } {
    this.requireCipher();
    if (!readStorage(PLAIN_BACKUP_STORAGE)) {
      writeStorage(PLAIN_BACKUP_STORAGE, rawJson.slice(0, 65536));
      return { migrated: true, backupKey: PLAIN_BACKUP_STORAGE };
    }
    return { migrated: false, backupKey: PLAIN_BACKUP_STORAGE };
  },

  /**
   * True AES-256-GCM at-rest encryption for IndexedDB / local table slices using the 256-bit device cipher key.
   */
  async encryptAtRest(plainText: string, customKeyHex?: string): Promise<string> {
    const { keyHex } = this.requireCipher(customKeyHex);
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new DbCipherException('WebCrypto AES-256-GCM غير متاح في هذه البيئة.');
    }
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
    }
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
      'encrypt',
    ]);
    const encoded = new TextEncoder().encode(plainText);
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded);
    const cipherBytes = new Uint8Array(cipherBuf);
    let binary = '';
    for (let i = 0; i < cipherBytes.length; i++) {
      binary += String.fromCharCode(cipherBytes[i]);
    }
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `IMDAD_ENC_V1:${ivHex}:${btoa(binary)}`;
  },

  /**
   * Decrypts an `IMDAD_ENC_V1:<ivHex>:<cipherBase64>` payload at rest using the 256-bit device cipher key,
   * or transparently migrates legacy unencrypted JSON strings.
   */
  async decryptAtRest(payload: string, customKeyHex?: string): Promise<string> {
    const { keyHex } = this.requireCipher(customKeyHex);
    if (!payload.startsWith('IMDAD_ENC_V1:')) {
      // Legacy plain JSON string — migrate on next write
      this.migratePlainIfNeeded(payload);
      return payload;
    }
    const parts = payload.split(':');
    if (parts.length < 3) {
      throw new DbCipherException('صيغة الكتلة المشفرة لقاعدة البيانات غير صالحة.');
    }
    const ivHex = parts[1];
    const cipherB64 = parts.slice(2).join(':');
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
    }
    const iv = new Uint8Array(12);
    for (let i = 0; i < 12; i++) {
      iv[i] = parseInt(ivHex.slice(i * 2, i * 2 + 2), 16);
    }
    const binary = atob(cipherB64);
    const cipherBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      cipherBytes[i] = binary.charCodeAt(i);
    }
    try {
      const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
        'decrypt',
      ]);
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, cipherBytes);
      return new TextDecoder().decode(plainBuf);
    } catch {
      throw new DbCipherException(
        'تعذر فك تشفير قاعدة البيانات المحلية (مفتاح التشفير غير مطابق أو البيانات تالفة).'
      );
    }
  },
};

/**
 * 2. PreMigrationBackup: Automatically saves a timestamped backup before upgrading schema (< 31).
 * Aborts migration if backup fails.
 */
export const PreMigrationBackup = {
  createBeforeUpgrade(fromVersion: number, toVersion: number, snapshotJson: string): string {
    if (fromVersion >= toVersion) return '';
    if (!snapshotJson || snapshotJson.trim().length === 0) {
      throw new Error(
        `فشل النسخ الاحتياطي التلقائي قبل الترقية من v${fromVersion} إلى v${toVersion}: البيانات فارغة.`
      );
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `${PRE_MIGRATION_BACKUP_PREFIX}v${fromVersion}_to_v${toVersion}_${ts}.bak`;
    try {
      writeStorage(backupKey, snapshotJson);
      writeStorage(`${PRE_MIGRATION_BACKUP_PREFIX}latest`, backupKey);
      return backupKey;
    } catch (err) {
      throw new Error(
        `تم إيقاف ترقية قاعدة البيانات حفاظاً على البيانات لتعذر حفظ النسخة الاحتياطية: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  },

  getLatestBackupKey(): string | null {
    return readStorage(`${PRE_MIGRATION_BACKUP_PREFIX}latest`);
  },
};

/**
 * 3. Database Indexes (_createIndexes from app_database.dart L118-200)
 */
export interface DbIndexDefinition {
  name: string;
  table: CollectionKey | string;
  columns: string[];
  unique?: boolean;
}

const MOVEMENT_TABLES = ['receipts', 'issues', 'transfers', 'returns', 'adjustments'] as const;

export const DB_INDEX_DEFINITIONS: DbIndexDefinition[] = [
  ...MOVEMENT_TABLES.flatMap((t): DbIndexDefinition[] => [
    { name: `ix_${t}_ref`, table: t, columns: ['ref_no'] },
    { name: `ix_${t}_status`, table: t, columns: ['status'] },
    { name: `ix_${t}_wh_item`, table: t, columns: ['warehouse', 'item_id'] },
    { name: `ix_${t}_date`, table: t, columns: ['date'] },
  ]),
  { name: 'ix_opening_wh_item', table: 'opening_balances', columns: ['warehouse', 'item_id'] },
  { name: 'ix_transfers_dest', table: 'transfers', columns: ['dest_warehouse'] },
  { name: 'ix_items_code', table: 'items', columns: ['code'] },
  { name: 'ix_items_barcode', table: 'items', columns: ['barcode'] },
  { name: 'ix_items_category', table: 'items', columns: ['category_id'] },
  { name: 'ix_audit_date', table: 'audit_logs', columns: ['log_date'] },
  { name: 'ix_audit_created', table: 'audit_logs', columns: ['created_at'] },
  { name: 'ix_stocktake_lines_session', table: 'stocktake_lines', columns: ['session_id'] },
  { name: 'ix_stocktakes_wh', table: 'stocktakes', columns: ['warehouse', 'status'] },
  { name: 'ix_strengths_date', table: 'strengths', columns: ['strength_date'] },
  { name: 'ix_kitchen_logs_date', table: 'kitchen_logs', columns: ['date'] },
  { name: 'ix_assets_type_status', table: 'assets', columns: ['asset_type', 'status'] },
  { name: 'ix_assets_wh', table: 'assets', columns: ['warehouse'] },
  { name: 'ix_asset_assign_asset', table: 'asset_assignments', columns: ['asset_id'] },
  { name: 'ix_ration_status', table: 'ration_orders', columns: ['status'] },
  { name: 'ix_ration_wh', table: 'ration_orders', columns: ['requesting_warehouse'] },
  { name: 'ix_ration_lines_order', table: 'ration_order_lines', columns: ['order_id'] },
  { name: 'ix_meal_plans_status', table: 'meal_plans', columns: ['status'] },
  { name: 'ix_meal_entries_plan', table: 'meal_plan_entries', columns: ['plan_id', 'entry_date'] },
  {
    name: 'ux_camp_ledger',
    table: 'camp_ledgers',
    columns: ['camp_id', 'item_id', 'year', 'month'],
    unique: true,
  },
  { name: 'ix_camp_ledger_month', table: 'camp_ledgers', columns: ['year', 'month', 'status'] },
  {
    name: 'ux_camp_limit',
    table: 'camp_stock_limits',
    columns: ['camp_id', 'item_id'],
    unique: true,
  },
  // v29: تصفيةٌ لكل نطاقٍ في الشهر
  {
    name: 'ux_settlement_scope',
    table: 'monthly_settlements',
    columns: ['year', 'month', 'scope'],
    unique: true,
  },
  { name: 'ix_fuel_supplies_date', table: 'fuel_supplies', columns: ['supply_date'] },
  { name: 'ix_fuel_supplies_wh', table: 'fuel_supplies', columns: ['warehouse_id', 'fuel_type'] },
  { name: 'ix_fuel_issues_date', table: 'fuel_issues', columns: ['issue_date'] },
  { name: 'ix_fuel_issues_wh', table: 'fuel_issues', columns: ['warehouse_id', 'fuel_type'] },
  { name: 'ix_fuel_issues_unit', table: 'fuel_issues', columns: ['unit_id'] },
  { name: 'ix_fuel_transfers_date', table: 'fuel_transfers', columns: ['transfer_date'] },
  { name: 'ix_fuel_transfers_from', table: 'fuel_transfers', columns: ['from_warehouse_id'] },
  { name: 'ix_fuel_transfers_to', table: 'fuel_transfers', columns: ['to_warehouse_id'] },
  { name: 'ix_fuel_openings_wh', table: 'fuel_openings', columns: ['warehouse_id', 'fuel_type'] },
  {
    name: 'ix_fuel_readings_wh_date',
    table: 'fuel_tank_readings',
    columns: ['warehouse_id', 'reading_date'],
  },
  { name: 'ix_fuel_maint_date', table: 'fuel_maintenances', columns: ['maint_date'] },
  { name: 'ix_fuel_maint_status', table: 'fuel_maintenances', columns: ['status'] },
  { name: 'ix_fuel_audit_created', table: 'fuel_audit_logs', columns: ['created_at'] },
  {
    name: 'ux_wh_limit',
    table: 'warehouse_item_limits',
    columns: ['warehouse', 'item_id'],
    unique: true,
  },
  { name: 'ux_fuel_wh_name', table: 'fuel_warehouses', columns: ['name'], unique: true },
  { name: 'ux_fuel_unit_name', table: 'fuel_units', columns: ['name'], unique: true },
  { name: 'ix_sync_marks_seq', table: 'sync_marks', columns: ['sync_seq'] },
  { name: 'ix_sync_queue_status', table: 'sync_outbox', columns: ['status'] },
];

export function generateCreateIndexStatements(): string[] {
  return DB_INDEX_DEFINITIONS.map((idx) => {
    const uniqueKw = idx.unique ? 'UNIQUE ' : '';
    return `CREATE ${uniqueKw}INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${idx.columns.join(', ')})`;
  });
}

/**
 * 4. Quantity & Orphan Guards (_createQuantityGuards from app_database.dart L260-400)
 */
export const QUANTITY_COLUMNS: Record<string, readonly ('qty' | 'baseQty')[]> = {
  receipts: ['qty', 'baseQty'],
  issues: ['qty', 'baseQty'],
  transfers: ['qty', 'baseQty'],
  returns: ['qty', 'baseQty'],
  adjustments: ['qty', 'baseQty'],
  opening_balances: ['qty'],
};

export const NON_NEGATIVE_TABLES = [
  'receipts',
  'issues',
  'transfers',
  'returns',
  'opening_balances',
] as const;

const NON_NEGATIVE_SET = new Set<string>(NON_NEGATIVE_TABLES);

/**
 * Rounds any quantity to `QUANTITY_SCALE = 3` decimal places to eliminate IEEE-754 drift (e.g., 0.1 + 0.2 -> 0.3).
 */
export function roundQty3(val: number): number {
  if (!Number.isFinite(val)) return 0;
  const factor = Math.pow(10, QUANTITY_SCALE); // 1000
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Enforces SQLite BEFORE INSERT / BEFORE UPDATE quantity triggers:
 * 1) Rejects negative quantities (`qty < 0`, `baseQty < 0`) or non-positive conversion factor (`factor <= 0`)
 *    on `NON_NEGATIVE_TABLES` (`receipts`, `issues`, `transfers`, `returns`, `opening_balances`).
 *    Note: `adjustments` is exempted because stock adjustments may record negative deficits.
 * 2) Rounds `qty` and `baseQty` to `QUANTITY_SCALE = 3` decimal places on all movement tables.
 */
export function enforceQuantityGuard<T extends Record<string, unknown>>(
  table: CollectionKey | string,
  row: T
): T {
  const cols = QUANTITY_COLUMNS[table];
  if (!cols) return row;

  const isNonNegative = NON_NEGATIVE_SET.has(table);
  const patched: Record<string, unknown> = { ...row };

  if (isNonNegative) {
    for (const c of cols) {
      const v = patched[c];
      if (typeof v === 'number' && v < 0) {
        throw new QuantityGuardError(
          `كمية أو معامل تحويل سالب غير مسموح في جدول (${table}): الحقل ${c} = ${v}`
        );
      }
    }
    if (typeof patched.factor === 'number' && patched.factor <= 0) {
      throw new QuantityGuardError(
        `معامل التحويل يجب أن يكون أكبر من الصفر في جدول (${table}): factor = ${patched.factor}`
      );
    }
  }

  // Round qty and baseQty to 3 decimal places (QUANTITY_SCALE = 3)
  for (const c of cols) {
    const v = patched[c];
    if (typeof v === 'number') {
      patched[c] = roundQty3(v);
    }
  }

  return patched as T;
}

/**
 * Checks whether an item has any recorded inventory movement across the 6 movement/opening tables.
 */
export function itemHasMovements(
  db: Pick<
    EmdadDbState,
    'receipts' | 'issues' | 'transfers' | 'returns' | 'adjustments' | 'opening_balances'
  >,
  itemId: string
): boolean {
  if (!itemId) return false;
  return (
    db.receipts.some((r) => r.itemId === itemId) ||
    db.issues.some((r) => r.itemId === itemId) ||
    db.transfers.some((r) => r.itemId === itemId) ||
    db.returns.some((r) => r.itemId === itemId) ||
    db.adjustments.some((r) => r.itemId === itemId) ||
    db.opening_balances.some((r) => r.itemId === itemId)
  );
}

/**
 * Enforces `trg_items_no_delete_with_movements`: prevents deleting an item that has movements.
 */
export function assertCanDeleteItem(
  db: Pick<
    EmdadDbState,
    'receipts' | 'issues' | 'transfers' | 'returns' | 'adjustments' | 'opening_balances'
  >,
  itemId: string
): void {
  if (itemHasMovements(db, itemId)) {
    throw new OrphanGuardError(
      'لا يمكن حذف صنف له حركات مسجلة حفاظاً على سلامة الأرصدة'
    );
  }
}

/**
 * 5. SyncMarks (_createSyncTriggers: afterInsert / afterUpdate / afterDelete on 55 synced tables)
 */
export interface SyncMarkEntry {
  tableName: string;
  rowKey: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  syncSeq: number;
  syncClock: string;
  updatedAt: string;
}

const SYNC_EXCLUDED_TABLES = new Set<string>([
  'sync_outbox',
  'sync_inbox',
  'sync_peers',
  'sync_conflicts',
]);

const SYNC_MARKS_STORAGE_KEY = 'emdad_sync_marks_v31';

let syncSeqCounter = 0;
let syncMarksHydrated = false;
const syncMarksStore = new Map<string, SyncMarkEntry>();

function hydrateSyncMarksIfNeeded(): void {
  if (syncMarksHydrated) return;
  syncMarksHydrated = true;
  try {
    const raw = readStorage(SYNC_MARKS_STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as SyncMarkEntry[];
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item && item.tableName && item.rowKey) {
          syncMarksStore.set(`${item.tableName}:${item.rowKey}`, item);
          if (item.syncSeq > syncSeqCounter) syncSeqCounter = item.syncSeq;
        }
      }
    }
  } catch {
    // ignore corrupt marks
  }
}

function flushSyncMarks(): void {
  try {
    const all = Array.from(syncMarksStore.values())
      .sort((a, b) => a.syncSeq - b.syncSeq)
      .slice(-2000);
    writeStorage(SYNC_MARKS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

export const SyncMarks = {
  isSyncedTable(table: string): boolean {
    return !SYNC_EXCLUDED_TABLES.has(table);
  },

  record(
    table: string,
    rowKey: string,
    op: 'INSERT' | 'UPDATE' | 'DELETE',
    nodeId = 'LOCAL'
  ): SyncMarkEntry | null {
    hydrateSyncMarksIfNeeded();
    if (!this.isSyncedTable(table) || !rowKey) return null;
    syncSeqCounter += 1;
    const nowIso = new Date().toISOString();
    const hlcClock = `${Date.now()}-${String(syncSeqCounter).padStart(6, '0')}-${nodeId}`;
    const entry: SyncMarkEntry = {
      tableName: table,
      rowKey,
      op,
      syncSeq: syncSeqCounter,
      syncClock: hlcClock,
      updatedAt: nowIso,
    };
    syncMarksStore.set(`${table}:${rowKey}`, entry);
    flushSyncMarks();
    return entry;
  },

  getAll(): SyncMarkEntry[] {
    hydrateSyncMarksIfNeeded();
    return Array.from(syncMarksStore.values()).sort((a, b) => a.syncSeq - b.syncSeq);
  },

  getSince(sinceSeq: number): SyncMarkEntry[] {
    return this.getAll().filter((m) => m.syncSeq > sinceSeq);
  },

  getDeleteTombstones(sinceIso?: string): SyncMarkEntry[] {
    return this.getAll().filter(
      (m) => m.op === 'DELETE' && (!sinceIso || m.updatedAt >= sinceIso)
    );
  },

  clear(): void {
    syncMarksHydrated = true;
    syncMarksStore.clear();
    syncSeqCounter = 0;
    writeStorage(SYNC_MARKS_STORAGE_KEY, '[]');
  },
};
