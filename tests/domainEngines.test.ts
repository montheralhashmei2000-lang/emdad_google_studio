import { describe, expect, it } from 'vitest';
import {
  COMPACT_27_ITEMS,
  computeMealRationWithTemplate,
  DETAILED_32_ITEMS,
  getStandardBaseDays,
} from '../src/domain/officialStandards';
import { normalizeUnitLines, settleCarryPack } from '../src/domain/unitCarry';
import { isCountNeutralCylAction, toCylinderPositions } from '../src/domain/cylinders';
import { computeAllocationBalance, computeFuelTankBalances } from '../src/domain/fuelEngine';
import { runSmartRationDispenser } from '../src/domain/smartDispenser';
import { computeStockLedger, getWarehouseItemStock } from '../src/domain/stockLedger';
import type { FuelAllocation, FuelIssue, FuelSettingsRow, Item } from '../src/domain/types';

const SAMPLE_ITEMS: Item[] = [
  {
    id: 'itm_rice',
    code: 'ITM-101',
    name: 'أرز بسمتي',
    categoryId: 'cat_1',
    categoryName: 'حبوب',
    baseUnit: 'كجم',
    reportUnit: 'كجم',
    units: [
      { name: 'كجم', factor: 1, isBase: true },
      { name: 'كيس 40 كجم', factor: 40, isBase: false },
    ],
    qty: 0,
    minQty: 100,
    barcode: '628100101',
    isRefillable: false,
    isAsset: false,
    assetType: '',
    lifespanMonths: 0,
    unitValue: 8,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

describe('Domain Supply, Ration, Cylinder, and Fuel Engines', () => {
  it('officialStandards: detailed32 has 32 items (31d base) & compact27 has 27 items (30d base)', () => {
    expect(DETAILED_32_ITEMS.length).toBe(32);
    expect(COMPACT_27_ITEMS.length).toBe(27);
    expect(getStandardBaseDays('detailed32')).toBe(31);
    expect(getStandardBaseDays('compact27')).toBe(30);

    const water = DETAILED_32_ITEMS.find((i) => i.stdKey === 'water')!;
    const stdLunch = computeMealRationWithTemplate(water, 'detailed32', 'standard', 'LUNCH');
    const summerLunch = computeMealRationWithTemplate(water, 'detailed32', 'summer', 'LUNCH');
    expect(summerLunch).toBeGreaterThan(stdLunch);
  });

  it('unitCarry: merges duplicate item lines and rolls small units into largest pack', () => {
    const out = normalizeUnitLines(
      [
        { itemId: 'itm_rice', unitName: 'كيس 40 كجم', factor: 40, qty: 4 },
        { itemId: 'itm_rice', unitName: 'كجم', factor: 1, qty: 50 },
      ],
      SAMPLE_ITEMS
    );
    expect(out).toHaveLength(1);
    expect(out[0].baseQty).toBe(210);
    expect(out[0].majorCount).toBe(5);
    expect(out[0].remainderQty).toBe(10);
  });

  it('unitCarry settleCarryPack raises CarryAlert when carry reaches full pack', () => {
    const settled = settleCarryPack({
      itemId: 'itm_rice',
      itemName: 'أرز بسمتي',
      requiredBase: 25,
      carryInBase: 20,
      packFactor: 40,
      wholePacks: true,
    });
    expect(settled.issuedPacks).toBe(1);
    expect(settled.issuedBase).toBe(40);
    expect(settled.carryOutBase).toBe(5);
  });

  it('cylinders: tracks count-neutral actions and conservation of totalOwned', () => {
    expect(isCountNeutralCylAction('REFILL')).toBe(true);
    expect(isCountNeutralCylAction('EXCHANGE')).toBe(true);
    expect(isCountNeutralCylAction('RECEIVE_FULL')).toBe(false);

    const positions = toCylinderPositions([
      {
        warehouse: 'المركزي',
        itemId: 'itm_gas',
        itemName: 'غاز',
        cylFull: 12,
        cylEmpty: 4,
        cylInRefill: 3,
        inTransit: 1,
        inCustody: 5,
      },
    ]);
    expect(positions[0].totalOwned).toBe(25);
  });

  it('fuelEngine: enforces carryCapPeriods and accurate tank occupancy', () => {
    const tanks = computeFuelTankBalances({
      warehouses: [
        {
          id: 'fw1',
          code: 'FW-1',
          name: 'محطة 1',
          manager: 'مسؤول المحطة',
          location: 'القطاع الشمالي',
          capacityLiters: 10000,
          active: true,
          notes: '',
          createdAt: '2026-11-01T00:00:00Z',
        },
      ],
      openings: [{ id: 'fo1', warehouse: 'محطة 1', fuelType: 'diesel', liters: 3000, asOfDate: '2026-11-01', note: '', createdAt: '' }],
      supplies: [{ id: 'fs1', refNo: 'FS-1', date: '2026-11-02', fuelType: 'diesel', quantityLiters: 2000, supplierName: 'مصافي', warehouse: 'محطة 1', transportVehicleType: '', driverName: '', notes: '', createdBy: '', createdAt: '' }],
      issues: [{ id: 'fi1', refNo: 'FI-1', date: '2026-11-03', fuelType: 'diesel', warehouse: 'محطة 1', source: 'allocation', quantityLiters: 1000, driverName: '', vehicleType: '', chassisNo: '', allocationId: 'al1', beneficiaryUnitId: 'u1', beneficiaryName: 'وحدة 1', entitledLiters: 500, periodType: 'daily', customFrom: '', customTo: '', justification: '', orderAuthority: '', purpose: '', notes: '', createdBy: '', createdAt: '' }],
      transfers: [],
      lowStockPercent: 50,
    });
    expect(tanks[0].diesel).toBe(4000);
    expect(tanks[0].occupancyPct).toBe(40);
    expect(tanks[0].isLowStock).toBe(true);

    const alloc: FuelAllocation = {
      id: 'al1',
      refNo: 'FAL-1',
      unitId: 'u1',
      unitName: 'وحدة 1',
      fuelType: 'diesel',
      periodType: 'daily',
      quantityPerPeriod: 500,
      totalQuantity: 0,
      weeklyLiters: 0,
      monthlyLiters: 0,
      issueLocation: 'محطة 1',
      startDate: '2026-11-01',
      endDate: '',
      active: true,
      disbursable: true,
      writtenOffLiters: 0,
      notes: '',
      createdBy: '',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };
    const settings: FuelSettingsRow = {
      id: 'fset',
      lowStockPercent: 20,
      defaultDailyLiters: 500,
      defaultWeeklyLiters: 3000,
      defaultMonthlyLiters: 12000,
      parentOrg: '',
      agencyTitle: '',
      commandTitle: '',
      branchTitle: '',
      orgName: '',
      sealLines: '',
      roleOfficer: '',
      roleSupply: '',
      roleChief: '',
      signOfficer: '',
      signSupply: '',
      signChief: '',
      requireChassis: true,
      allowExceptional: true,
      carryCapPeriods: 4,
      notes: '',
      updatedAt: '2026-11-01T00:00:00Z',
    };
    const status = computeAllocationBalance(alloc, [], settings, '2026-11-20');
    expect(status.cappedPeriods).toBe(4);
    expect(status.grossEntitled).toBe(2000);
    expect(status.remainingBalance).toBe(2000);
  });

  it('smartDispenser & stockLedger: deducts warehouse balances and carries fractional packs', () => {
    const ledger = computeStockLedger({
      warehouses: ['المركزي'],
      items: SAMPLE_ITEMS,
      openings: [
        {
          id: 'ob1',
          itemId: 'itm_rice',
          itemCode: 'ITM-101',
          itemName: 'أرز بسمتي',
          warehouse: 'المركزي',
          qty: 200,
          date: '2026-11-01',
          setBy: 'system',
          breakdown: {},
          createdAt: '2026-11-01T00:00:00Z',
        },
      ],
      receipts: [],
      issues: [],
      transfers: [],
      returns: [],
      adjustments: [],
    });
    expect(getWarehouseItemStock(ledger, 'المركزي', 'itm_rice')).toBe(200);

    const disp = runSmartRationDispenser({
      entries: [
        {
          id: 'e1',
          planId: 'p1',
          entryDate: '2026-11-01',
          mealType: 'LUNCH',
          itemId: 'itm_rice',
          itemCode: 'ITM-101',
          itemName: 'أرز بسمتي',
          unitName: 'كيس 40 كجم',
          factor: 40,
          qtyPerPerson: 0.25,
          isCritical: true,
          substituteItemId: '',
          substituteItemName: '',
          substituteUnitName: '',
          substituteFactor: 1,
          substituteQtyPerPerson: 0,
          stdKey: '',
          notes: '',
        },
      ],
      headcount: 10, // needs 0.25 * 40 * 10 = 100kg = 2 packs (80kg) + 20kg carryOut
      wastePct: 0,
      wholePacks: true,
      warehouse: 'المركزي',
      ledger,
      items: SAMPLE_ITEMS,
      previousCarryByItem: {},
    });
    expect(disp.lines[0].issuedBase).toBe(80);
    expect(disp.lines[0].carryOut).toBe(20);
  });

  it('Phase 2 DbGuards: enforces non-negative quantities, 3-decimal rounding, item orphan protection, DbCipher 256-bit key, and SyncMarks', async () => {
    const {
      assertCanDeleteItem,
      DB_INDEX_DEFINITIONS,
      DbCipher,
      enforceQuantityGuard,
      generateCreateIndexStatements,
      itemHasMovements,
      kSchemaVersion,
      PreMigrationBackup,
      roundQty3,
      SyncMarks,
    } = await import('../src/data/dbGuards');

    expect(kSchemaVersion).toBe(31);

    // 1. DbCipher 256-bit (64-hex) key & fail-closed verification
    const cipher = DbCipher.requireCipher();
    expect(cipher.active).toBe(true);
    expect(cipher.keyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(() => DbCipher.requireCipher('invalid_short_key')).toThrow();

    // 2. PreMigrationBackup before schema upgrade (< 31)
    const bakKey = PreMigrationBackup.createBeforeUpgrade(30, 31, '{"config":{"schemaVersion":30}}');
    expect(bakKey).toContain('v30_to_v31');
    expect(() => PreMigrationBackup.createBeforeUpgrade(30, 31, '')).toThrow();

    // 3. Indexes (_createIndexes)
    const sqlIndexes = generateCreateIndexStatements();
    expect(DB_INDEX_DEFINITIONS.length).toBeGreaterThanOrEqual(50);
    expect(sqlIndexes.some((s) => s.includes('CREATE UNIQUE INDEX IF NOT EXISTS ux_camp_ledger'))).toBe(true);
    expect(sqlIndexes.some((s) => s.includes('CREATE UNIQUE INDEX IF NOT EXISTS ux_settlement_scope'))).toBe(true);

    // 4. QuantityGuards: 3-decimal rounding (0.1 + 0.2 -> 0.3) & non-negative enforcement
    expect(roundQty3(0.1 + 0.2)).toBe(0.3);
    const roundedReceipt = enforceQuantityGuard('receipts', {
      id: 'r1',
      qty: 0.1 + 0.2,
      baseQty: 10.123456,
      factor: 1,
    });
    expect(roundedReceipt.qty).toBe(0.3);
    expect(roundedReceipt.baseQty).toBe(10.123);

    // Reject negative qty on receipts, issues, transfers, returns, opening_balances
    expect(() =>
      enforceQuantityGuard('receipts', { id: 'r_neg', qty: -5, baseQty: -5 })
    ).toThrow(/سالب/);
    expect(() =>
      enforceQuantityGuard('issues', { id: 'i_neg', qty: 5, baseQty: -5 })
    ).toThrow(/سالب/);
    expect(() =>
      enforceQuantityGuard('opening_balances', { id: 'ob_neg', qty: -1 })
    ).toThrow(/سالب/);

    // Allow negative qty on adjustments (exempted for inventory deficits) while still rounding to 3 decimals
    const negAdj = enforceQuantityGuard('adjustments', {
      id: 'adj1',
      qty: -3.4567,
      baseQty: -3.4567,
    });
    expect(negAdj.qty).toBe(-3.457);

    // 5. OrphanGuard: prevent deleting item that has movements
    const mockDb = {
      receipts: [{ itemId: 'itm_used' } as never],
      issues: [],
      transfers: [],
      returns: [],
      adjustments: [],
      opening_balances: [],
    };
    expect(itemHasMovements(mockDb, 'itm_used')).toBe(true);
    expect(itemHasMovements(mockDb, 'itm_unused')).toBe(false);
    expect(() => assertCanDeleteItem(mockDb, 'itm_used')).toThrow(/لا يمكن حذف صنف له حركات مسجلة/);
    expect(() => assertCanDeleteItem(mockDb, 'itm_unused')).not.toThrow();

    // 6. SyncMarks: automatic seq & HLC clock tracking
    SyncMarks.clear();
    const m1 = SyncMarks.record('items', 'itm_101', 'INSERT', 'NODE_A');
    const m2 = SyncMarks.record('receipts', 'rcp_1', 'UPDATE', 'NODE_A');
    expect(m1?.syncSeq).toBe(1);
    expect(m2?.syncSeq).toBe(2);
    expect(SyncMarks.getSince(1)).toHaveLength(1);
    expect(SyncMarks.record('sync_outbox', 'out_1', 'INSERT')).toBeNull();
  });
});

