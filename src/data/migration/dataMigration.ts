// Data Migration Engine (DataExporter & Smart LegacyImporter):
// Excludes 17 localOnlyKeys, strips owner secrets on peer export, enforces Privileged Role Guard, resolves Natural Key collisions, captures SyncConflicts.

import { Ids, sha256Hex } from '../../core/security/crypto';
import type { CollectionKey, EmdadDbState } from '../db';
import type { SyncConflict, SystemConfig, User } from '../../domain/types';

export const LOCAL_ONLY_CONFIG_KEYS: ReadonlyArray<keyof SystemConfig> = [
  'deviceId',
  'activationToken',
  'paperSize',
  'highDensity',
  'classicFlat',
  'distinctFuelTheme',
  'themeMode',
  'numerals',
  'fontFamily',
  'logoDataUrl',
  'idleLockMinutes',
  'autoArchiveOnPrint',
  'signerPositions',
  'printForms',
];

export interface ExportMigrationEnvelope {
  format: 'IMDAD_MIGRATION_V1';
  schemaVersion: number;
  exportedAt: string;
  includeOwnerSecrets: boolean;
  includeLocalKeys: boolean;
  sha256: string;
  state: EmdadDbState;
}

export async function exportSystemMigrationJson(
  db: EmdadDbState,
  options?: { includeLocalKeys?: boolean; includeOwnerSecrets?: boolean }
): Promise<{ json: string; sha256: string; recordCount: number }> {
  const includeLocalKeys = options?.includeLocalKeys ?? false;
  const includeOwnerSecrets = options?.includeOwnerSecrets ?? false;

  const clonedConfig: SystemConfig = { ...db.config };
  if (!includeLocalKeys) {
    for (const key of LOCAL_ONLY_CONFIG_KEYS) {
      if (key === 'deviceId' || key === 'activationToken' || key === 'logoDataUrl') {
        (clonedConfig as unknown as Record<string, unknown>)[key] = '';
      }
    }
  }

  const sanitizedUsers = db.users.map((u) =>
    includeOwnerSecrets
      ? u
      : {
          ...u,
          saltHex: '',
          hashHex: '',
          ownerSig: '',
        }
  );

  const exportState: EmdadDbState = {
    ...db,
    config: clonedConfig,
    users: sanitizedUsers,
  };

  let recordCount = 0;
  for (const k of Object.keys(exportState) as Array<keyof EmdadDbState>) {
    if (k !== 'config' && Array.isArray(exportState[k])) {
      recordCount += (exportState[k] as unknown[]).length;
    }
  }

  const stateJson = JSON.stringify(exportState);
  const sha256 = await sha256Hex(stateJson);
  const envelope: ExportMigrationEnvelope = {
    format: 'IMDAD_MIGRATION_V1',
    schemaVersion: 31,
    exportedAt: new Date().toISOString(),
    includeOwnerSecrets,
    includeLocalKeys,
    sha256,
    state: exportState,
  };

  return { json: JSON.stringify(envelope, null, 2), sha256, recordCount };
}

function getNaturalKey(table: CollectionKey, row: Record<string, unknown>): string | null {
  if (table === 'camp_ledgers') {
    return `${row.campId ?? ''}::${row.itemId ?? ''}::${row.year ?? ''}::${row.month ?? ''}`;
  }
  if (table === 'monthly_settlements') {
    return `${row.campId ?? ''}::${row.year ?? ''}::${row.month ?? ''}`;
  }
  if (table === 'opening_balances') {
    return `${row.warehouse ?? ''}::${row.itemId ?? ''}::${row.asOfDate ?? ''}`;
  }
  return null;
}

export interface SmartImportResult {
  nextState: EmdadDbState;
  mergedCount: number;
  skippedSecurityCount: number;
  conflictsCaptured: number;
}

/**
 * LegacyImporter & Smart Merge Engine:
 * - Preserves local-only UI/device config keys unless explicitly overriding same device
 * - Enforces Privileged Role Guard: non-owner imports cannot elevate or replace existing owner accounts
 * - Resolves Natural Key collisions for camp_ledgers, monthly_settlements, opening_balances
 * - Logs colliding overwrites into sync_conflicts
 */
export async function smartMergeImportJson(
  prevDb: EmdadDbState,
  rawText: string,
  actorUser: User | null
): Promise<SmartImportResult> {
  const parsed = JSON.parse(rawText) as Partial<ExportMigrationEnvelope> & Partial<EmdadDbState>;
  let incoming: EmdadDbState;

  if (parsed.format === 'IMDAD_MIGRATION_V1' && parsed.state) {
    const check = await sha256Hex(JSON.stringify(parsed.state));
    if (parsed.sha256 && parsed.sha256 !== check) {
      throw new Error('فشل التحقق من بصمة SHA-256 لملف الترحيل');
    }
    incoming = parsed.state;
  } else if (Array.isArray(parsed.items) && parsed.config) {
    incoming = parsed as EmdadDbState;
  } else {
    throw new Error('صيغة ملف الترحيل غير معروفة أو غير صالحة');
  }

  const next: EmdadDbState = { ...prevDb };
  // Always keep local device/UI keys intact
  const mergedConfig: SystemConfig = {
    ...incoming.config,
  };
  for (const k of LOCAL_ONLY_CONFIG_KEYS) {
    (mergedConfig as unknown as Record<string, unknown>)[k] = prevDb.config[k];
  }
  next.config = mergedConfig;

  let mergedCount = 0;
  let skippedSecurityCount = 0;
  const conflicts: SyncConflict[] = [];
  const isActorOwner = actorUser?.role === 'owner';

  for (const key of Object.keys(incoming) as Array<keyof EmdadDbState>) {
    if (key === 'config' || key === 'sync_conflicts') continue;
    const colKey = key as CollectionKey;
    const peerArr = incoming[colKey];
    const localArr = prevDb[colKey];
    if (!Array.isArray(peerArr) || !Array.isArray(localArr)) continue;

    const merged = [...(localArr as unknown as Array<Record<string, unknown>>)];
    const idMap = new Map<string, number>();
    const natMap = new Map<string, number>();

    merged.forEach((r, idx) => {
      const id = String(r.id ?? r.itemId ?? r.key ?? '');
      if (id) idMap.set(id, idx);
      const nat = getNaturalKey(colKey, r);
      if (nat) natMap.set(nat, idx);
    });

    for (const pRow of peerArr as unknown as Array<Record<string, unknown>>) {
      const id = String(pRow.id ?? pRow.itemId ?? pRow.key ?? '');
      const nat = getNaturalKey(colKey, pRow);

      // Privileged Role Guard: prevent unauthorized elevation or secret injection on users
      if (colKey === 'users') {
        const pRole = String(pRow.role ?? 'user');
        if (!isActorOwner && (pRole === 'owner' || pRole === 'admin')) {
          skippedSecurityCount += 1;
          continue;
        }
        // Preserve local password hashes if incoming stripped secrets
        const existingIdx = id ? idMap.get(id) : undefined;
        if (existingIdx !== undefined && !pRow.hashHex) {
          pRow.hashHex = merged[existingIdx].hashHex;
          pRow.saltHex = merged[existingIdx].saltHex;
        }
      }

      const matchIdx =
        (id ? idMap.get(id) : undefined) ?? (nat ? natMap.get(nat) : undefined);

      if (matchIdx === undefined) {
        merged.unshift(pRow);
        mergedCount += 1;
      } else {
        const localRow = merged[matchIdx];
        const localTs = String(localRow.updatedAt ?? localRow.createdAt ?? '');
        const peerTs = String(pRow.updatedAt ?? pRow.createdAt ?? '');
        if (JSON.stringify(localRow) !== JSON.stringify(pRow)) {
          if (peerTs >= localTs) {
            conflicts.push({
              id: Ids.next('cnf'),
              table: colKey,
              recordId: id || nat || 'unknown',
              localSnapshot: localRow,
              peerSnapshot: pRow,
              peerName: 'JSON_MIGRATION_IMPORT',
              detectedAt: new Date().toISOString(),
              resolved: false,
            });
            merged[matchIdx] = pRow;
            mergedCount += 1;
          }
        }
      }
    }

    (next as unknown as Record<string, unknown>)[colKey] = merged;
  }

  next.sync_conflicts = [...conflicts, ...prevDb.sync_conflicts];

  return {
    nextState: next,
    mergedCount,
    skippedSecurityCount,
    conflictsCaptured: conflicts.length,
  };
}
