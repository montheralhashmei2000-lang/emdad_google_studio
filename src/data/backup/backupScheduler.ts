// Backup Scheduler, .imdbk Encrypted Backup Rotation & Attachment Crypto Engine

import { decryptBackupJson, encryptBackupJson, Ids, sha256Hex } from '../../core/security/crypto';
import type { EmdadDbState } from '../db';

export type BackupIntervalHours = 0 | 24 | 72 | 168 | 720;

export interface BackupScheduleSettings {
  intervalHours: BackupIntervalHours;
  retentionCount: number;
  lastRunAt: string;
}

export interface RotatedBackupSnapshot {
  id: string;
  createdAt: string;
  sizeBytes: number;
  sha256: string;
  fileName: string;
  encryptedEnvelope: string;
}

const SCHEDULER_KEY = 'emdad_backup_scheduler_v1';
const SNAPSHOTS_KEY = 'emdad_backup_snapshots_v1';

export function loadBackupSchedule(): BackupScheduleSettings {
  try {
    const raw = localStorage.getItem(SCHEDULER_KEY);
    if (raw) return JSON.parse(raw) as BackupScheduleSettings;
  } catch {
    // ignore
  }
  return { intervalHours: 24, retentionCount: 5, lastRunAt: '' };
}

export function saveBackupSchedule(settings: BackupScheduleSettings): void {
  localStorage.setItem(SCHEDULER_KEY, JSON.stringify(settings));
}

export function listRotatedSnapshots(): RotatedBackupSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    return raw ? (JSON.parse(raw) as RotatedBackupSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function deleteRotatedSnapshot(id: string): RotatedBackupSnapshot[] {
  const next = listRotatedSnapshots().filter((s) => s.id !== id);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next));
  return next;
}

export function isBackupDue(schedule: BackupScheduleSettings, now = new Date()): boolean {
  if (schedule.intervalHours <= 0) return false;
  if (!schedule.lastRunAt) return true;
  const lastMs = new Date(schedule.lastRunAt).getTime();
  if (!Number.isFinite(lastMs)) return true;
  return now.getTime() - lastMs >= schedule.intervalHours * 3600 * 1000;
}

/**
 * BackupCrypto (.imdbk): encrypts entire EmdadDbState using PBKDF2 100k + AES-256-GCM
 */
export async function exportImdbkBackup(
  db: EmdadDbState,
  passphrase: string
): Promise<{ encrypted: string; fileName: string; sha256: string }> {
  const payload = JSON.stringify(db);
  const encrypted = await encryptBackupJson(payload, passphrase);
  const sha256 = await sha256Hex(encrypted);
  const dateStamp = new Date().toISOString().slice(0, 10);
  return {
    encrypted,
    fileName: `imdad_backup_${db.config.deviceId}_${dateStamp}.imdbk`,
    sha256,
  };
}

export async function importImdbkBackup(
  envelopeStr: string,
  passphrase: string
): Promise<EmdadDbState> {
  const plain = await decryptBackupJson(envelopeStr, passphrase);
  const parsed = JSON.parse(plain) as EmdadDbState;
  if (!parsed || !Array.isArray(parsed.items) || !parsed.config) {
    throw new Error('محتوى النسخة الاحتياطية غير مكتمل أو تالف');
  }
  return parsed;
}

/**
 * Creates a rotated encrypted backup snapshot locally and retains only last N copies
 */
export async function runScheduledBackupRotation(
  db: EmdadDbState,
  passphrase: string
): Promise<{ snapshot: RotatedBackupSnapshot; all: RotatedBackupSnapshot[]; schedule: BackupScheduleSettings }> {
  const schedule = loadBackupSchedule();
  const { encrypted, fileName, sha256 } = await exportImdbkBackup(db, passphrase);
  const nowIso = new Date().toISOString();
  const snap: RotatedBackupSnapshot = {
    id: Ids.next('bk'),
    createdAt: nowIso,
    sizeBytes: new TextEncoder().encode(encrypted).byteLength,
    sha256,
    fileName,
    encryptedEnvelope: encrypted,
  };

  const keepN = Math.max(1, Math.min(20, schedule.retentionCount || 5));
  const nextList = [snap, ...listRotatedSnapshots()].slice(0, keepN);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(nextList));

  const nextSchedule: BackupScheduleSettings = { ...schedule, lastRunAt: nowIso };
  saveBackupSchedule(nextSchedule);

  return { snapshot: snap, all: nextList, schedule: nextSchedule };
}

/**
 * AttachmentCrypto: Encrypt sensitive binary/text attachments with AES-256-GCM & verify SHA-256
 */
export async function encryptAttachmentText(
  base64OrText: string,
  passphrase: string
): Promise<{ encrypted: string; plainSha256: string }> {
  const plainSha256 = await sha256Hex(base64OrText);
  const encrypted = await encryptBackupJson(
    JSON.stringify({ kind: 'IMDAD_ATTACHMENT_V1', plainSha256, content: base64OrText }),
    passphrase
  );
  return { encrypted, plainSha256 };
}

export async function decryptAttachmentText(
  envelope: string,
  passphrase: string
): Promise<{ content: string; plainSha256: string }> {
  const raw = await decryptBackupJson(envelope, passphrase);
  const parsed = JSON.parse(raw) as { kind?: string; plainSha256?: string; content?: string };
  if (parsed.kind !== 'IMDAD_ATTACHMENT_V1' || typeof parsed.content !== 'string') {
    throw new Error('مرفق مشفّر غير صالح');
  }
  const actualHash = await sha256Hex(parsed.content);
  if (parsed.plainSha256 && actualHash !== parsed.plainSha256) {
    throw new Error('فشل التحقق من سلامة المرفق (SHA-256 mismatch)');
  }
  return { content: parsed.content, plainSha256: actualHash };
}
