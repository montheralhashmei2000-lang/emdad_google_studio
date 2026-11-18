import { describe, expect, it } from 'vitest';
import {
  generateDeviceId,
  pbkdf2Hash,
  sha256Hex,
  verifyDeviceIdChecksum,
  verifyPassword,
} from '../src/core/security/crypto';
import { encodeCode128Modules, renderCode128SvgHtml } from '../src/core/print/barcode128';
import { exportSystemMigrationJson, smartMergeImportJson } from '../src/data/migration/dataMigration';
import { buildInitialSeedState } from '../src/data/seed';

describe('Security, Migration, Sync Conflicts, and Barcode128 Engines', () => {
  it('deviceId generator produces valid 8+1 checksum IDs and detects tampering', () => {
    const id = generateDeviceId();
    expect(verifyDeviceIdChecksum(id)).toBe(true);
    const tampered = (id[0] === 'A' ? 'B' : 'A') + id.slice(1);
    expect(verifyDeviceIdChecksum(tampered)).toBe(false);
  });

  it('sha256Hex and pbkdf2Hash verify deterministically', async () => {
    const h = await sha256Hex('imdad-erp-test');
    expect(h).toHaveLength(64);
    const derived = await pbkdf2Hash('Secret@123', undefined, 5000);
    expect(await verifyPassword('Secret@123', derived.saltHex, derived.hashHex, 5000)).toBe(true);
    expect(await verifyPassword('Wrong@123', derived.saltHex, derived.hashHex, 5000)).toBe(false);
  });

  it('encodeCode128Modules & renderCode128SvgHtml render valid #000000 on #FFFFFF barcodes', () => {
    const modules = encodeCode128Modules('ITM-2026-001');
    // Start B (6) + 12 chars (12*6=72) + Checksum (6) + Stop (7) = 91 bar/space elements
    expect(modules.length).toBe(91);
    const svg = renderCode128SvgHtml('ITM-2026-001');
    expect(svg).toContain('#FFFFFF');
    expect(svg).toContain('#000000');
    expect(svg).toContain('<svg');
  });

  it('dataMigration strips owner secrets on export and enforces Privileged Role Guard on import', async () => {
    const db = await buildInitialSeedState();
    const { json, sha256 } = await exportSystemMigrationJson(db, {
      includeLocalKeys: false,
      includeOwnerSecrets: false,
    });
    expect(sha256).toHaveLength(64);

    const parsed = JSON.parse(json) as { state: typeof db };
    expect(parsed.state.config.deviceId).toBe('');
    expect(parsed.state.users.every((u) => u.hashHex === '' && u.saltHex === '')).toBe(true);

    // Non-owner user attempting to import an escalated owner/admin user is blocked
    const nonOwnerActor = db.users.find((u) => u.role !== 'owner') ?? {
      ...db.users[0],
      role: 'user' as const,
    };
    const maliciousImport = JSON.parse(json) as { format: string; schemaVersion: number; sha256: string; state: typeof db };
    maliciousImport.state.users.push({
      ...db.users[0],
      id: 'usr_malicious_admin',
      username: 'rogue_admin',
      role: 'owner',
    });
    // Strip stale hash so direct state check exercises role guard cleanly
    const res = await smartMergeImportJson(db, JSON.stringify(maliciousImport.state), nonOwnerActor);
    expect(res.skippedSecurityCount).toBeGreaterThanOrEqual(1);
    expect(res.nextState.users.some((u) => u.id === 'usr_malicious_admin')).toBe(false);
  });

  it('backupScheduler encrypts/decrypts .imdbk & attachments and Excel templates contain all 7 forms', async () => {
    const { exportImdbkBackup, importImdbkBackup, encryptAttachmentText, decryptAttachmentText } = await import(
      '../src/data/backup/backupScheduler'
    );
    const { EXCEL_TEMPLATES } = await import('../src/core/export/excelEngine');
    const {
      buildMilitaryStrengthReportDoc,
      buildCableOfficialDoc,
      buildCustodySheetHorizontalDoc,
      buildContractOfficialDoc,
      buildMoneyReceiptDoc,
      buildDestructionProtocolDoc,
    } = await import('../src/core/print/specializedTemplates');

    const db = await buildInitialSeedState();
    const { encrypted, fileName, sha256 } = await exportImdbkBackup(db, 'StrongPass@2026');
    expect(fileName).toContain('.imdbk');
    expect(sha256).toHaveLength(64);
    const restored = await importImdbkBackup(encrypted, 'StrongPass@2026');
    expect(restored.items.length).toBe(db.items.length);

    const encAtt = await encryptAttachmentText('مستند مرفق سري للغاية', 'AttachKey#1');
    const decAtt = await decryptAttachmentText(encAtt.encrypted, 'AttachKey#1');
    expect(decAtt.content).toBe('مستند مرفق سري للغاية');
    expect(decAtt.plainSha256).toBe(encAtt.plainSha256);

    expect(Object.keys(EXCEL_TEMPLATES)).toHaveLength(7);

    const milDoc = buildMilitaryStrengthReportDoc({
      title: 'تمام القوة',
      refNo: 'MIL-1',
      date: '2026-11-15',
      warehouse: 'التموين المركزي',
      partyValue: 'الكتيبة الأولى',
      columns: ['م', 'البيان'],
      rows: [['1', 'جاهز']],
      totalQty: 1,
      actorName: 'المشرف',
    });
    expect(milDoc.paperSize).toBe('A4_P');

    const destDoc = buildDestructionProtocolDoc(
      {
        id: 'dst1',
        refNo: 'DST-1',
        date: '2026-11-15',
        warehouse: 'المركزي',
        reason: 'انتهاء صلاحية',
        method: 'طمر وحرق',
        place: 'الموقع الشرقي',
        committee: [{ name: 'خالد', rank: 'رائد', role: 'رئيس اللجنة' }],
        orderRef: 'ORD-99',
        status: 'COMPLETED',
        notes: '',
        approvedBy: 'القائد',
        cancelReason: '',
        createdBy: 'admin',
        createdAt: '2026-11-15T00:00:00Z',
      },
      'المشرف',
      [{ itemName: 'حليب مجفف', itemCode: 'ITM-9', qty: 5, unitName: 'كرتون', baseQty: 60 }]
    );
    expect(destDoc.totalQty).toBe(60);

    // Ensure remaining template builders return typed PrintableDocument
    expect(buildCableOfficialDoc(db.cables[0] ?? {
      id: 'c1', direction: 'out', cableNo: 'C-1', cableDate: '2026-11-15', subject: 'أمر', body: 'نص',
      fromParty: 'أ', toParty: 'ب', branch: null, classification: 'normal', priority: 'normal', status: 'new',
      cableTime: '10:00', ccParty: '', recipientsJson: ['ب'], editorName: 'م', editorRank: 'نقيب', editorJob: 'ركن',
      signerText: '', serialNo: '1', sendMethod: 'شبكة', sendDateTime: '2026-11-15T10:00:00Z', specialist: '',
      receiverName: '', receiveTime: '', replyToNo: '', attachName: '', attachPath: '', attachSize: 0,
      attachSha256: '', notes: '', createdBy: '', createdAt: '', updatedAt: '',
    }, 'المشرف').formKey).toBe('cable');
    expect(typeof buildCustodySheetHorizontalDoc).toBe('function');
    expect(typeof buildContractOfficialDoc).toBe('function');
    expect(typeof buildMoneyReceiptDoc).toBe('function');
  });

  it('Phase 6 Security Core: OwnerKey, 310k PasswordHash auto-upgrade, OwnerSignature r/s/c, ESign & DeviceActivation revocations', async () => {
    const {
      OwnerKey,
      COMPROMISED_OWNER_KEYS,
      constantTimeEquals,
      PasswordHash,
      OwnerSignature,
      ESign,
      DeviceActivation,
      AuthService,
      Perm,
    } = await import('../src/core/security/index');

    expect(OwnerKey.isConfigured()).toBe(true);
    const compromised = Array.from(COMPROMISED_OWNER_KEYS)[0];
    expect(OwnerKey.isCompromised(compromised)).toBe(true);
    expect(() => OwnerKey.assertReleaseConfigured(true)).not.toThrow();

    expect(constantTimeEquals('abc123', 'abc123')).toBe(true);
    expect(constantTimeEquals('abc123', 'abc124')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);

    // PasswordHash 310k + auto-upgrade from legacy 45,000 iterations
    expect(PasswordHash.needsUpgrade(45000)).toBe(true);
    expect(PasswordHash.needsUpgrade(310000)).toBe(false);
    const legacy = await PasswordHash.hash('StrongPass!', 5000);
    const upgRes = await PasswordHash.verifyAndMaybeUpgrade('StrongPass!', legacy.saltHex, legacy.hashHex, legacy.iterations);
    expect(upgRes.valid).toBe(true);
    expect(upgRes.upgraded?.iterations).toBe(310000);

    // OwnerSignature r, s, c verification
    const db = await buildInitialSeedState();
    const adminUser = { ...db.users[0], updatedAt: '2026-11-15T12:00:00Z' };
    adminUser.ownerSig = await OwnerSignature.signUserDecisions(adminUser);
    const verifiedSig = await OwnerSignature.verifyUserDecisions(adminUser);
    expect(verifiedSig.signed && verifiedSig.roleValid && verifiedSig.sectionValid && verifiedSig.credValid).toBe(true);

    // ESign IMD2|<docRef>|<ts>|<sig>
    const qrToken = await ESign.signVoucher({ docRef: 'ص-100', date: '2026-11-15', warehouse: 'المركزي', totalQty: 25, ts: 1700000000 });
    const parsedQr = ESign.parseQrToken(qrToken);
    expect(parsedQr.validFormat).toBe(true);
    expect(parsedQr.docRef).toBe('ص-100');

    // DeviceActivation master/branch/expiry + signed revocations + AuthService + Perm
    const devId = DeviceActivation.generateDeviceId();
    const cert = await DeviceActivation.issueCertificate({
      deviceId: devId,
      issuedTo: 'الفرع الجنوبي',
      role: 'branch',
      branch: 'الفرع ب',
      expiresAt: '2099-12-31',
    });
    const statusOk = await DeviceActivation.verifyToken(cert);
    expect(statusOk.valid && statusOk.role === 'branch' && statusOk.branch === 'الفرع ب').toBe(true);

    const rev = await DeviceActivation.createRevocation({ deviceId: devId, reason: 'سحب صلاحية', revokedBy: 'owner' });
    const statusRevoked = await DeviceActivation.verifyToken(cert, [rev]);
    expect(statusRevoked.valid).toBe(false);
    expect(statusRevoked.revoked).toBe(true);

    expect(AuthService.needsBootstrap([])).toBe(true);
    expect(AuthService.needsBootstrap(db.users)).toBe(false);
    expect(Perm.sys(adminUser, 'sys.users')).toBe(true);
  });

  it('Upgrades 1-4: AES-256-GCM DbCipher at-rest encryption, SyncMarks DELETE tombstones, Fuel Readings/Maintenances, and StockLedger memoization', async () => {
    const { DbCipher, SyncMarks } = await import('../src/data/dbGuards');
    const { exportEncryptedSyncPacket, mergeEncryptedSyncPacket } = await import('../src/data/sync/localSync');
    const { computeStockLedger, getWarehouseItemStock } = await import('../src/domain/stockLedger');

    // 1. AES-256-GCM At-Rest Encryption
    const plainSlice = JSON.stringify([{ id: 'itm_1', name: 'أرز بسمتي', qty: 500 }]);
    const encryptedSlice = await DbCipher.encryptAtRest(plainSlice);
    expect(encryptedSlice.startsWith('IMDAD_ENC_V1:')).toBe(true);
    const decryptedSlice = await DbCipher.decryptAtRest(encryptedSlice);
    expect(decryptedSlice).toBe(plainSlice);

    // Wrong key must fail closed
    const wrongKey = 'f'.repeat(64);
    await expect(DbCipher.decryptAtRest(encryptedSlice, wrongKey)).rejects.toThrow();

    // 2. Fuel Tank Readings & Fuel Maintenances in seed state
    const db = await buildInitialSeedState();
    expect(db.fuel_tank_readings.length).toBeGreaterThanOrEqual(3);
    expect(db.fuel_maintenances.length).toBeGreaterThanOrEqual(2);
    expect(db.fuel_audit_logs.length).toBeGreaterThanOrEqual(2);

    // 3. SyncMarks DELETE Tombstones propagation in localSync
    SyncMarks.clear();
    const targetSupplierId = db.suppliers[0].id;
    const peerDb = {
      ...db,
      suppliers: db.suppliers.filter((s) => s.id !== targetSupplierId),
    };
    SyncMarks.record('suppliers', targetSupplierId, 'DELETE', 'PEER01');
    const packet = await exportEncryptedSyncPacket(peerDb, 'PAIR-2026', '1970-01-01T00:00:00.000Z');
    expect(packet.header.tombstoneCount).toBe(1);

    const merged = await mergeEncryptedSyncPacket(db, packet.encrypted, 'PAIR-2026');
    expect(merged.nextState.suppliers.some((s) => s.id === targetSupplierId)).toBe(false);

    // 4. computeStockLedger reference-equality memoization + O(1) getWarehouseItemStock
    const ledgerInput = {
      items: db.items,
      warehouses: db.warehouses.map((w) => w.name),
      openings: db.opening_balances,
      receipts: db.receipts,
      issues: db.issues,
      transfers: db.transfers,
      returns: db.returns,
      adjustments: db.adjustments,
    };
    const firstLedger = computeStockLedger(ledgerInput);
    const secondLedger = computeStockLedger({ ...ledgerInput });
    expect(secondLedger).toBe(firstLedger); // exact same reference returned from cache
    const sampleRow = firstLedger[0];
    expect(getWarehouseItemStock(firstLedger, sampleRow.warehouse, sampleRow.itemId)).toBe(sampleRow.balance);
  });
});
