// Basic Data & Assets Hub (7 Tabs: الأصناف، المستودعات، الوحدات المستفيدة، الموردون، المطابخ والأفران، الأصول الثابتة + Code-128، أسطوانات الغاز CylindersView)

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Barcode,
  CheckCircle2,
  Download,
  Edit3,
  FolderKanban,
  LayoutGrid,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdBarcodeSvg,
  ImdButton,
  ImdFld,
  ImdModal,
  ImdPage,
  ImdPanel,
  ImdSelect,
  ImdStatusText,
  ImdTabs,
} from '../../components/imd/primitives';
import { ImdTable } from '../../components/imd/ImdTable';
import { Ids } from '../../core/security/crypto';
import { todayIso } from '../../core/ui/imdTokens';
import { buildBarcodeSheetHtml, formatLabelSize, loadLabelSize } from '../../core/print/printEngine';
import { downloadExcelTemplate, importXlsxFile } from '../../core/export/excelEngine';
import { computeCylinderSummaries } from '../../domain/stockLedger';
import type { Asset, AssetAssignment, BeneficiaryUnit, Facility, Item, Supplier, Warehouse } from '../../domain/types';

type DataTab = 'items' | 'warehouses' | 'units' | 'suppliers' | 'facilities' | 'assets' | 'cylinders';

export const BasicDataHub: React.FC = () => {
  const { db, currentUser, ledger, navIntent, clearNavIntent, upsertRow, deleteRow, mutateDb, logAudit, notify, fmt } = useEmdad();
  const [tab, setTab] = useState<DataTab>('items');
  const [labelPreview, setLabelPreview] = useState<{ code: string; label: string } | null>(null);
  const [labelCopies, setLabelCopies] = useState('1');
  const [sheetHtml, setSheetHtml] = useState<string | null>(null);
  const sheetFrameRef = useRef<HTMLIFrameElement>(null);
  const [assignModalAsset, setAssignModalAsset] = useState<Asset | null>(null);
  const [assignHolder, setAssignHolder] = useState('');
  const [assignUnitId, setAssignUnitId] = useState(db.beneficiary_units[0]?.id ?? '');
  const [assignCond, setAssignCond] = useState('جيدة');

  // Search & Edit Modals
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'supplyData') return;
    if (navIntent.subTab) {
      setTab(navIntent.subTab as DataTab);
    }
    if (navIntent.searchQuery !== undefined) {
      setItemSearch(navIntent.searchQuery);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingWh, setEditingWh] = useState<{ orig: Warehouse; name: string; location: string; manager: string; isMain: boolean } | null>(null);
  const [whDashName, setWhDashName] = useState<string | null>(null);
  const [editingUnit, setEditingUnit] = useState<BeneficiaryUnit | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  // Add Item State
  const [itemName, setItemName] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemCatId, setItemCatId] = useState(db.categories[0]?.id ?? 'cat_grains');
  const [itemBaseUnit, setItemBaseUnit] = useState('كجم');
  const [itemPackName, setItemPackName] = useState('كيس');
  const [itemPackFactor, setItemPackFactor] = useState('50');
  const [itemMinQty, setItemMinQty] = useState('100');
  const [itemRefill, setItemRefill] = useState('false');

  // Add Warehouse State
  const [whName, setWhName] = useState('');
  const [whLoc, setWhLoc] = useState('');
  const [whMain, setWhMain] = useState('false');

  // Add Unit State
  const [unitName, setUnitName] = useState('');
  const [unitType, setUnitType] = useState<'camp' | 'unit'>('unit');
  const [unitParent, setUnitParent] = useState(db.beneficiary_units.find((u) => u.isCamp)?.id ?? '');

  // Add Supplier State
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supCity, setSupCity] = useState('');

  // Add Facility State
  const [facName, setFacName] = useState('');
  const [facType, setFacType] = useState<'kitchen' | 'bakery'>('kitchen');
  const [facCap, setFacCap] = useState('500');
  const [facWh, setFacWh] = useState(db.warehouses[0]?.name ?? '');

  // Add Asset State
  const [astName, setAstName] = useState('');
  const [astSerial, setAstSerial] = useState('');
  const [astFac, setAstFac] = useState(db.facilities[0]?.id ?? '');
  const [astVal, setAstVal] = useState('5000');

  const cylinderRows = useMemo(
    () =>
      computeCylinderSummaries({
        ledger,
        transfers: db.transfers,
        issues: db.issues,
        returns: db.returns,
      }),
    [ledger, db.transfers, db.issues, db.returns]
  );

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return db.items;
    return db.items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.barcode.toLowerCase().includes(q) ||
        i.categoryName.toLowerCase().includes(q)
    );
  }, [db.items, itemSearch]);

  const whDashSummary = useMemo(() => {
    if (!whDashName) return null;
    const balances = ledger.filter((r) => r.warehouse === whDashName && r.balance !== 0);
    const openStocktakes = db.stocktakes.filter((s) => s.warehouse === whDashName && s.status === 'COUNTING');
    const pendingTransfers = db.transfers.filter(
      (t) => t.status === 'PENDING' && (t.warehouse === whDashName || t.destWarehouse === whDashName)
    );
    return { balances, openStocktakes, pendingTransfers };
  }, [whDashName, ledger, db.stocktakes, db.transfers]);

  const handleAddItem = () => {
    if (!itemName.trim()) return;
    const factorNum = Math.max(1, Number(itemPackFactor) || 1);
    const units = [{ name: itemBaseUnit, factor: 1, isBase: true }];
    if (itemPackName.trim() && factorNum > 1) {
      units.push({ name: `${itemPackName.trim()} (${factorNum} ${itemBaseUnit})`, factor: factorNum, isBase: false });
    }
    const cat = db.categories.find((c) => c.id === itemCatId) ?? db.categories[0];
    const code = itemCode.trim() || String(1011 + db.items.length);
    const newItem: Item = {
      id: Ids.next('itm'),
      code,
      name: itemName.trim(),
      categoryId: cat?.id ?? 'cat_grains',
      categoryName: cat?.name ?? 'عام',
      baseUnit: itemBaseUnit,
      units,
      qty: 0,
      minQty: Math.max(0, Number(itemMinQty) || 100),
      barcode: `6281${code.padStart(8, '0')}`,
      isRefillable: itemRefill === 'true',
      reportUnit: units[units.length - 1].name,
      isAsset: false,
      assetType: '',
      lifespanMonths: 0,
      unitValue: 0,
      createdAt: new Date().toISOString(),
    };
    upsertRow('items', newItem);
    setItemName('');
    setItemCode('');
    notify(`تمت إضافة الصنف "${newItem.name}"`, 'success');
  };

  const handleDeleteItem = (item: Item) => {
    const used =
      db.receipts.some((x) => x.itemId === item.id) ||
      db.issues.some((x) => x.itemId === item.id) ||
      db.transfers.some((x) => x.itemId === item.id) ||
      db.returns.some((x) => x.itemId === item.id) ||
      db.opening_balances.some((x) => x.itemId === item.id);
    if (used) {
      notify(`لا يمكن حذف «${item.name}» لوجود حركات أو أرصدة مسجلة عليه`, 'danger');
      return;
    }
    deleteRow('items', item.id);
    logAudit({ action: 'DELETE_ITEM', entityType: 'items', summary: `حذف الصنف ${item.name} (${item.code})` });
    notify(`تم حذف الصنف «${item.name}»`, 'warn');
  };

  const handleSaveEditedWarehouse = () => {
    if (!editingWh || !editingWh.name.trim()) return;
    const oldName = editingWh.orig.name;
    const nextName = editingWh.name.trim();
    const renamed = oldName !== nextName;

    mutateDb((prev) => ({
      ...prev,
      warehouses: prev.warehouses.map((w) =>
        w.id === editingWh.orig.id
          ? {
              ...w,
              name: nextName,
              location: editingWh.location,
              manager: editingWh.manager,
              isMain: editingWh.isMain,
              feedsAllCamps: editingWh.isMain,
            }
          : w
      ),
      ...(renamed
        ? {
            opening_balances: prev.opening_balances.map((o) => (o.warehouse === oldName ? { ...o, warehouse: nextName } : o)),
            receipts: prev.receipts.map((r) => (r.warehouse === oldName ? { ...r, warehouse: nextName } : r)),
            issues: prev.issues.map((i) => (i.warehouse === oldName ? { ...i, warehouse: nextName } : i)),
            transfers: prev.transfers.map((t) => ({
              ...t,
              warehouse: t.warehouse === oldName ? nextName : t.warehouse,
              destWarehouse: t.destWarehouse === oldName ? nextName : t.destWarehouse,
            })),
            returns: prev.returns.map((r) => (r.warehouse === oldName ? { ...r, warehouse: nextName } : r)),
            adjustments: prev.adjustments.map((a) => (a.warehouse === oldName ? { ...a, warehouse: nextName } : a)),
            stocktakes: prev.stocktakes.map((s) => (s.warehouse === oldName ? { ...s, warehouse: nextName } : s)),
            facilities: prev.facilities.map((f) => (f.warehouse === oldName ? { ...f, warehouse: nextName } : f)),
            warehouse_stock_limits: prev.warehouse_stock_limits.map((l) =>
              l.warehouseName === oldName ? { ...l, warehouseName: nextName } : l
            ),
            users: prev.users.map((u) =>
              u.warehouseScope === 'ALL'
                ? u
                : { ...u, warehouseScope: u.warehouseScope.map((w) => (w === oldName ? nextName : w)) }
            ),
          }
        : {}),
    }));
    logAudit({
      action: renamed ? 'RENAME_WAREHOUSE' : 'EDIT_WAREHOUSE',
      entityType: 'warehouses',
      summary: renamed ? `تغيير اسم المستودع «${oldName}» إلى «${nextName}» مع الترحيل الشامل` : `تحديث بيانات المستودع ${nextName}`,
      risk: renamed ? 'sensitive' : 'normal',
    });
    setEditingWh(null);
    notify(renamed ? `تم تحديث وتمرير الاسم الجديد «${nextName}» عبر كافة السجلات` : 'تم تحديث بيانات المستودع', 'success');
  };

  const handleDeleteWarehouse = (w: Warehouse) => {
    const used =
      db.receipts.some((x) => x.warehouse === w.name) ||
      db.issues.some((x) => x.warehouse === w.name) ||
      db.transfers.some((x) => x.warehouse === w.name || x.destWarehouse === w.name) ||
      db.opening_balances.some((x) => x.warehouse === w.name);
    if (used) {
      notify(`لا يمكن حذف المستودع «${w.name}» لارتباطه بحركات أو أرصدة`, 'danger');
      return;
    }
    deleteRow('warehouses', w.id);
    notify(`تم حذف المستودع «${w.name}»`, 'warn');
  };

  const handleImportItemsExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rows = await importXlsxFile(file);
    let count = 0;
    for (const r of rows) {
      const name = r['اسم الصنف'] || r['name'];
      if (!name) continue;
      const base = r['الوحدة الأساسية'] || r['baseUnit'] || 'كجم';
      const code = r['الكود'] || r['code'] || String(2000 + count);
      upsertRow('items', {
        id: Ids.next('itm'),
        code,
        name,
        categoryId: 'cat_grains',
        categoryName: r['التصنيف'] || 'مستورد',
        baseUnit: base,
        units: [{ name: base, factor: 1, isBase: true }],
        qty: 0,
        minQty: Number(r['حد التنبيه']) || 50,
        barcode: `6281${code.padStart(8, '0')}`,
        isRefillable: false,
        reportUnit: base,
        isAsset: false,
        assetType: '',
        lifespanMonths: 0,
        unitValue: 0,
        createdAt: new Date().toISOString(),
      });
      count++;
    }
    notify(`تم استيراد ${count} صنف من ملف Excel`, 'success');
    e.target.value = '';
  };

  const handleAddWarehouse = () => {
    if (!whName.trim()) return;
    const wh: Warehouse = {
      id: Ids.next('wh'),
      code: `WH-${String(db.warehouses.length + 1).padStart(2, '0')}`,
      name: whName.trim(),
      manager: '',
      location: whLoc,
      feedsAllCamps: whMain === 'true',
      fuelCapacityLiters: 0,
      isMain: whMain === 'true',
      campIds: [],
      notes: '',
    };
    upsertRow('warehouses', wh);
    setWhName('');
    notify('تمت إضافة المستودع', 'success');
  };

  const handleAddUnit = () => {
    if (!unitName.trim()) return;
    const parent = db.beneficiary_units.find((u) => u.id === unitParent);
    const u: BeneficiaryUnit = {
      id: Ids.next(unitType === 'camp' ? 'camp' : 'unit'),
      code: `U-${db.beneficiary_units.length + 101}`,
      name: unitName.trim(),
      type: unitType,
      parentId: unitType === 'unit' ? unitParent : '',
      parentName: unitType === 'unit' ? parent?.name ?? '' : '',
      isCamp: unitType === 'camp',
      facilityId: db.facilities[0]?.id ?? '',
      facilityIds: [],
      category: unitType === 'camp' ? 'معسكر' : 'وحدة',
    };
    upsertRow('beneficiary_units', u);
    setUnitName('');
    notify('تمت إضافة الجهة المستفيدة', 'success');
  };

  const handleAddSupplier = () => {
    if (!supName.trim()) return;
    const s: Supplier = {
      id: Ids.next('sup'),
      name: supName.trim(),
      phone: supPhone,
      contact: '',
      city: supCity,
      notes: '',
    };
    upsertRow('suppliers', s);
    setSupName('');
    notify('تمت إضافة المورد', 'success');
  };

  const handleAddFacility = () => {
    if (!facName.trim()) return;
    const f: Facility = {
      id: Ids.next('fac'),
      name: facName.trim(),
      fType: facType,
      capacity: Number(facCap) || 500,
      warehouse: facWh,
      notes: '',
    };
    upsertRow('facilities', f);
    setFacName('');
    notify('تمت إضافة المنشأة', 'success');
  };

  const handleAddAsset = () => {
    if (!astName.trim()) return;
    const fac = db.facilities.find((f) => f.id === astFac);
    const a: Asset = {
      id: Ids.next('ast'),
      name: astName.trim(),
      quantity: 1,
      assetType: 'معدات',
      serialNumber: astSerial || `SN-${Date.now().toString().slice(-5)}`,
      facilityId: fac?.id ?? '',
      facilityName: fac?.name ?? '',
      beneficiaryUnitId: '',
      beneficiaryUnitName: '',
      warehouse: fac?.warehouse ?? '',
      status: 'GOOD',
      acquisitionDate: todayIso(),
      value: Number(astVal) || 0,
      lifespanMonths: 60,
      supplierId: '',
      supplierName: '',
      invoiceNumber: '',
      itemId: '',
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsertRow('assets', a);
    setAstName('');
    setAstSerial('');
    notify('تم تسجيل الأصل الثابت', 'success');
  };

  const handleAssignAsset = () => {
    if (!assignModalAsset || !assignHolder.trim()) {
      notify('أدخل اسم المستلم للعهدة', 'danger');
      return;
    }
    const unit = db.beneficiary_units.find((u) => u.id === assignUnitId);
    const now = new Date().toISOString();
    const rec: AssetAssignment = {
      id: Ids.next('aas'),
      assetId: assignModalAsset.id,
      assetName: assignModalAsset.name,
      beneficiaryUnitId: unit?.id ?? '',
      beneficiaryUnitName: unit?.name ?? '',
      facilityId: assignModalAsset.facilityId,
      facilityName: assignModalAsset.facilityName,
      assignedDate: todayIso(),
      returnedDate: '',
      assignedTo: assignHolder.trim(),
      notes: assignCond,
      createdBy: currentUser?.name ?? '',
      createdAt: now,
    };
    mutateDb((prev) => ({
      ...prev,
      asset_assignments: [rec, ...prev.asset_assignments],
      assets: prev.assets.map((x) =>
        x.id === assignModalAsset.id
          ? {
              ...x,
              beneficiaryUnitId: unit?.id ?? x.beneficiaryUnitId,
              beneficiaryUnitName: unit?.name ?? x.beneficiaryUnitName,
              updatedAt: now,
            }
          : x
      ),
    }));
    setAssignHolder('');
    setAssignModalAsset(null);
    notify(`تم تسليم عهدة الأصل "${assignModalAsset.name}" إلى ${rec.assignedTo}`, 'success');
  };

  return (
    <ImdPage
      title="البيانات الأساسية والأصول والأسطوانات"
      subtitle="الأصناف ووحداتها والباركود · المستودعات · الوحدات · الموردون · المطابخ والأفران · الأصول الثابتة · أسطوانات الغاز"
    >
      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as DataTab)}
        tabs={[
          { id: 'items', label: 'الأصناف', count: db.items.length },
          { id: 'warehouses', label: 'المستودعات', count: db.warehouses.length },
          { id: 'units', label: 'الوحدات المستفيدة', count: db.beneficiary_units.length },
          { id: 'suppliers', label: 'الموردون', count: db.suppliers.length },
          { id: 'facilities', label: 'المطابخ والأفران', count: db.facilities.length },
          { id: 'assets', label: 'الأصول الثابتة', count: db.assets.length },
          { id: 'cylinders', label: 'أسطوانات الغاز (CylindersView)', count: cylinderRows.length },
        ]}
      />

      {tab === 'items' && (
        <div className="space-y-4">
          <ImdPanel
            title="إضافة صنف جديد أو استيراد قالب Excel"
            headerRight={
              <div className="flex flex-wrap items-center gap-2">
                <ImdButton size="sm" variant="secondary" onClick={() => setCatModalOpen(true)}>
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>التصنيفات ({db.categories.length})</span>
                </ImdButton>
                <ImdButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    downloadExcelTemplate(
                      'items_template.xlsx',
                      ['الكود', 'اسم الصنف', 'التصنيف', 'الوحدة الأساسية', 'حد التنبيه'],
                      ['2001', 'عدس أحمر مجروش', 'حبوب ودقيق', 'كجم', '200']
                    )
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>قالب Excel</span>
                </ImdButton>
                <ImdButton
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const size = loadLabelSize();
                    const html = buildBarcodeSheetHtml(
                      filteredItems.map((i) => ({ name: i.name, code: i.code, barcode: i.barcode })),
                      size,
                      db.config.orgName
                    );
                    setSheetHtml(html);
                  }}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>ورقة ملصقات ({formatLabelSize(loadLabelSize())})</span>
                </ImdButton>
                <label className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] cursor-pointer hover:bg-[var(--imd-hover)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                  <Upload className="w-3.5 h-3.5" />
                  <span>استيراد XLSX</span>
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportItemsExcel} />
                </label>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
              <ImdFld label="الكود" value={itemCode} onChange={setItemCode} placeholder="1011" />
              <ImdFld label="اسم الصنف" value={itemName} onChange={setItemName} className="md:col-span-2" />
              <ImdSelect
                label="التصنيف"
                value={itemCatId}
                onChange={setItemCatId}
                options={db.categories.map((c) => ({ value: c.id, label: c.name }))}
              />
              <ImdFld label="الوحدة الأساسية" value={itemBaseUnit} onChange={setItemBaseUnit} />
              <ImdFld label="العبوة + المعامل" value={itemPackName} onChange={setItemPackName} />
              <div className="grid grid-cols-2 gap-2">
                <ImdFld label="المعامل" type="number" value={itemPackFactor} onChange={setItemPackFactor} />
                <ImdSelect
                  label="أسطوانة؟"
                  value={itemRefill}
                  onChange={setItemRefill}
                  options={[
                    { value: 'false', label: 'لا' },
                    { value: 'true', label: 'نعم' },
                  ]}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div className="w-40">
                <ImdFld label="حد التنبيه (الأساس)" type="number" value={itemMinQty} onChange={setItemMinQty} />
              </div>
              <ImdButton variant="primary" onClick={handleAddItem}>
                <Plus className="w-4 h-4" />
                <span>إضافة الصنف</span>
              </ImdButton>
            </div>
          </ImdPanel>

          <ImdPanel
            title="دليل الأصناف المسجلة"
            headerRight={
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-[var(--imd-muted)]" />
                <input
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="بحث بالكود أو الاسم أو الباركود..."
                  className="w-full h-8 pr-8 pl-2.5 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)]"
                  style={{ borderRadius: 'var(--imd-radius-sm)' }}
                />
              </div>
            }
          >
            <ImdTable
              columns={[
                { key: 'code', header: 'الكود', render: (r) => <span className="font-mono-num">{r.code}</span> },
                { key: 'name', header: 'اسم الصنف', render: (r) => <strong>{r.name}</strong> },
                { key: 'cat', header: 'التصنيف', render: (r) => r.categoryName },
                { key: 'units', header: 'الوحدات', render: (r) => r.units.map((u) => `${u.name} (×${u.factor})`).join(' · ') },
                { key: 'refill', header: 'نوع المادة', render: (r) => <ImdStatusText label={r.isRefillable ? 'أسطوانة قابلة للتعبئة' : 'صنف قياسي'} tone={r.isRefillable ? 'info' : 'muted'} /> },
                {
                  key: 'bc',
                  header: 'الباركود',
                  render: (r) => (
                    <ImdButton
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setLabelCopies('1');
                        setLabelPreview({ code: r.barcode, label: `${r.name} (${r.code})` });
                      }}
                    >
                      <Barcode className="w-3.5 h-3.5" />
                      <span className="font-mono-num text-[11px]">{r.barcode}</span>
                    </ImdButton>
                  ),
                },
                {
                  key: 'act',
                  header: 'إدارة',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <ImdButton size="sm" variant="ghost" title="تعديل الصنف" onClick={() => setEditingItem({ ...r })}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </ImdButton>
                      <ImdButton size="sm" variant="ghost" title="حذف الصنف" onClick={() => handleDeleteItem(r)}>
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    </div>
                  ),
                },
              ]}
              rows={filteredItems}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'warehouses' && (
        <div className="space-y-4">
          <ImdPanel title="إضافة مستودع">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <ImdFld label="اسم المستودع" value={whName} onChange={setWhName} />
              <ImdFld label="الموقع" value={whLoc} onChange={setWhLoc} />
              <ImdSelect
                label="النوع"
                value={whMain}
                onChange={setWhMain}
                options={[
                  { value: 'false', label: 'مستودع فرعي / معسكر' },
                  { value: 'true', label: 'مستودع رئيسي (يموّن المعسكرات)' },
                ]}
              />
              <ImdButton variant="primary" onClick={handleAddWarehouse}>
                <Plus className="w-4 h-4" />
                <span>إضافة</span>
              </ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'code', header: 'الرمز', render: (r) => <span className="font-mono-num">{r.code}</span> },
                { key: 'name', header: 'الاسم', render: (r) => <strong>{r.name}</strong> },
                { key: 'mgr', header: 'المسؤول', render: (r) => r.manager || '—' },
                { key: 'loc', header: 'الموقع', render: (r) => r.location || '—' },
                { key: 'main', header: 'التصنيف', render: (r) => <ImdStatusText label={r.isMain ? 'مستودع رئيسي' : 'مستودع فرعي'} tone={r.isMain ? 'success' : 'muted'} /> },
                {
                  key: 'act',
                  header: 'إدارة ولوحة المستودع',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <ImdButton size="sm" variant="secondary" onClick={() => setWhDashName(r.name)}>
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>لوحة المستودع</span>
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        title="تعديل / إعادة تسمية"
                        onClick={() =>
                          setEditingWh({ orig: r, name: r.name, location: r.location, manager: r.manager, isMain: r.isMain })
                        }
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </ImdButton>
                      <ImdButton size="sm" variant="ghost" title="حذف المستودع" onClick={() => handleDeleteWarehouse(r)}>
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    </div>
                  ),
                },
              ]}
              rows={db.warehouses}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'units' && (
        <div className="space-y-4">
          <ImdPanel title="إضافة معسكر أو وحدة مستفيدة">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <ImdFld label="الاسم" value={unitName} onChange={setUnitName} />
              <ImdSelect
                label="النوع"
                value={unitType}
                onChange={(v) => setUnitType(v as 'camp' | 'unit')}
                options={[
                  { value: 'camp', label: 'معسكر مستقل' },
                  { value: 'unit', label: 'وحدة / كتيبة تابعة' },
                ]}
              />
              {unitType === 'unit' && (
                <ImdSelect
                  label="المعسكر التابع له"
                  value={unitParent}
                  onChange={setUnitParent}
                  options={db.beneficiary_units.filter((u) => u.isCamp).map((c) => ({ value: c.id, label: c.name }))}
                />
              )}
              <ImdButton variant="primary" onClick={handleAddUnit}>
                <Plus className="w-4 h-4" />
                <span>حفظ</span>
              </ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'c', header: 'الرمز', render: (r) => <span className="font-mono-num">{r.code}</span> },
                { key: 'n', header: 'الاسم', render: (r) => <strong>{r.name}</strong> },
                { key: 't', header: 'النوع', render: (r) => (r.isCamp ? 'معسكر' : 'وحدة تابعة') },
                { key: 'p', header: 'المعسكر الأب', render: (r) => r.parentName || '—' },
                { key: 'cat', header: 'الفئة', render: (r) => r.category },
                {
                  key: 'act',
                  header: 'إدارة',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <ImdButton size="sm" variant="ghost" onClick={() => setEditingUnit({ ...r })}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          deleteRow('beneficiary_units', r.id);
                          notify(`تم حذف «${r.name}»`, 'warn');
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    </div>
                  ),
                },
              ]}
              rows={db.beneficiary_units}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="space-y-4">
          <ImdPanel title="إضافة مورد">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <ImdFld label="اسم المورد" value={supName} onChange={setSupName} />
              <ImdFld label="الهاتف" value={supPhone} onChange={setSupPhone} />
              <ImdFld label="المدينة" value={supCity} onChange={setSupCity} />
              <ImdButton variant="primary" onClick={handleAddSupplier}>إضافة مورد</ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'n', header: 'اسم المورد', render: (r) => <strong>{r.name}</strong> },
                { key: 'p', header: 'الهاتف', numeric: true, render: (r) => r.phone },
                { key: 'c', header: 'جهة التواصل', render: (r) => r.contact || '—' },
                { key: 'ct', header: 'المدينة', render: (r) => r.city },
                {
                  key: 'act',
                  header: 'إدارة',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <ImdButton size="sm" variant="ghost" onClick={() => setEditingSupplier({ ...r })}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          deleteRow('suppliers', r.id);
                          notify(`تم حذف المورد «${r.name}»`, 'warn');
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    </div>
                  ),
                },
              ]}
              rows={db.suppliers}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'facilities' && (
        <div className="space-y-4">
          <ImdPanel title="إضافة مطبخ أو فرن">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <ImdFld label="اسم المنشأة" value={facName} onChange={setFacName} />
              <ImdSelect
                label="النوع"
                value={facType}
                onChange={(v) => setFacType(v as 'kitchen' | 'bakery')}
                options={[
                  { value: 'kitchen', label: 'مطبخ' },
                  { value: 'bakery', label: 'فرن آلي' },
                ]}
              />
              <ImdFld label="الطاقة الاستيعابية" type="number" value={facCap} onChange={setFacCap} />
              <ImdSelect
                label="المستودع المغذي"
                value={facWh}
                onChange={setFacWh}
                options={db.warehouses.map((w) => ({ value: w.name, label: w.name }))}
              />
              <ImdButton variant="primary" onClick={handleAddFacility}>إضافة</ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'n', header: 'الاسم', render: (r) => <strong>{r.name}</strong> },
                { key: 't', header: 'النوع', render: (r) => (r.fType === 'kitchen' ? 'مطبخ' : 'فرن') },
                { key: 'c', header: 'السعة (فرد)', numeric: true, render: (r) => fmt(r.capacity, 0) },
                { key: 'w', header: 'المستودع المغذي', render: (r) => r.warehouse },
                {
                  key: 'act',
                  header: 'إدارة',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <ImdButton size="sm" variant="ghost" onClick={() => setEditingFacility({ ...r })}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          deleteRow('facilities', r.id);
                          notify(`تم حذف المنشأة «${r.name}»`, 'warn');
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    </div>
                  ),
                },
              ]}
              rows={db.facilities}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'assets' && (
        <div className="space-y-4">
          <ImdPanel
            title="تسجيل أصل ثابت جديد"
            headerRight={
              <ImdButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  const size = loadLabelSize();
                  setSheetHtml(
                    buildBarcodeSheetHtml(
                      db.assets.map((a) => ({
                        name: a.name,
                        code: a.serialNumber,
                        barcode: a.serialNumber || a.id,
                      })),
                      size,
                      db.config.orgName
                    )
                  );
                }}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>ورقة ملصقات الأصول ({formatLabelSize(loadLabelSize())})</span>
              </ImdButton>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <ImdFld label="اسم الأصل" value={astName} onChange={setAstName} />
              <ImdFld label="الرقم التسلسلي" value={astSerial} onChange={setAstSerial} />
              <ImdSelect
                label="المنشأة"
                value={astFac}
                onChange={setAstFac}
                options={db.facilities.map((f) => ({ value: f.id, label: f.name }))}
              />
              <ImdFld label="القيمة التقديرية" type="number" value={astVal} onChange={setAstVal} />
              <ImdButton variant="primary" onClick={handleAddAsset}>تسجيل الأصل</ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'n', header: 'اسم الأصل', render: (r) => <strong>{r.name}</strong> },
                { key: 'sn', header: 'الرقم التسلسلي', render: (r) => <span className="font-mono-num">{r.serialNumber}</span> },
                { key: 'fac', header: 'الموقع / المنشأة', render: (r) => r.facilityName || r.warehouse },
                { key: 'val', header: 'القيمة', numeric: true, render: (r) => fmt(r.value) },
                {
                  key: 'st',
                  header: 'الحالة الفنية',
                  render: (r) => (
                    <select
                      value={r.status}
                      onChange={(e) =>
                        upsertRow('assets', {
                          ...r,
                          status: e.target.value as Asset['status'],
                          updatedAt: new Date().toISOString(),
                        })
                      }
                      className="h-7 px-1.5 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)]"
                    >
                      <option value="NEW">جديد</option>
                      <option value="GOOD">جيدة</option>
                      <option value="NEEDS_MAINTENANCE">تحتاج صيانة</option>
                      <option value="DAMAGED">تالفة</option>
                      <option value="RETIRED">مكهنة / مشطوبة</option>
                    </select>
                  ),
                },
                {
                  key: 'bc',
                  header: 'العهدة والباركود والإدارة',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <ImdButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setAssignHolder('');
                          setAssignModalAsset(r);
                        }}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>تسليم عهدة</span>
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setLabelCopies('1');
                          setLabelPreview({ code: r.serialNumber, label: `${r.name} — ${r.facilityName || r.warehouse}` });
                        }}
                      >
                        <Barcode className="w-3.5 h-3.5" />
                      </ImdButton>
                      <ImdButton size="sm" variant="ghost" onClick={() => setEditingAsset({ ...r })}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          deleteRow('assets', r.id);
                          notify(`تم حذف الأصل «${r.name}»`, 'warn');
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    </div>
                  ),
                },
              ]}
              rows={db.assets}
              rowKey={(r) => r.id}
            />
          </ImdPanel>

          <ImdPanel title="سجل عهد وتداول الأصول الثابتة (asset_assignments)">
            <ImdTable
              columns={[
                { key: 'an', header: 'الأصل', render: (r) => <strong>{r.assetName}</strong> },
                { key: 'hn', header: 'حامل العهدة', render: (r) => r.assignedTo },
                { key: 'un', header: 'الوحدة', render: (r) => r.beneficiaryUnitName || r.facilityName || '—' },
                { key: 'dt', header: 'تاريخ التسليم', numeric: true, render: (r) => r.assignedDate },
                {
                  key: 'st',
                  header: 'الحالة',
                  render: (r) => (
                    <ImdStatusText
                      label={r.returnedDate ? `مسترد (${r.returnedDate})` : `في العهدة (${r.notes || 'جيدة'})`}
                      tone={r.returnedDate ? 'muted' : 'success'}
                    />
                  ),
                },
                {
                  key: 'ret',
                  header: 'إجراء',
                  render: (r) =>
                    !r.returnedDate ? (
                      <ImdButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          upsertRow('asset_assignments', {
                            ...r,
                            returnedDate: todayIso(),
                          });
                          notify(`تم تسجيل استرداد الأصل "${r.assetName}"`, 'success');
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>إرجاع العهدة</span>
                      </ImdButton>
                    ) : null,
                },
              ]}
              rows={db.asset_assignments}
              rowKey={(r) => r.id}
              emptyTitle="لا توجد تسليمات عهد أصول مسجلة بعد"
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'cylinders' && (
        <ImdPanel
          title="تتبع أسطوانات الغاز والأوعية القابلة لإعادة التعبئة (CylindersView)"
          subtitle="الممتلئة · الفارغة · قيد التعبئة عند المورد · في الطريق (تحويلات PENDING) · في عهدة المطابخ والوحدات"
        >
          <ImdTable
            columns={[
              { key: 'wh', header: 'المستودع', render: (r) => <strong>{r.warehouse}</strong> },
              { key: 'itm', header: 'الصنف', render: (r) => r.itemName },
              {
                key: 'full',
                header: 'ممتلئة',
                numeric: true,
                render: (r) => <span className="font-bold text-[var(--imd-success)]">{fmt(r.cylFull, 0)}</span>,
              },
              {
                key: 'empty',
                header: 'فارغة',
                numeric: true,
                render: (r) => <span className="font-bold text-[var(--imd-warn)]">{fmt(r.cylEmpty, 0)}</span>,
              },
              {
                key: 'refill',
                header: 'قيد التعبئة (المورد)',
                numeric: true,
                render: (r) => <span className="font-bold text-[var(--imd-info)]">{fmt(r.cylInRefill, 0)}</span>,
              },
              {
                key: 'transit',
                header: 'في الطريق (تحويل معلق)',
                numeric: true,
                render: (r) => fmt(r.inTransit, 0),
              },
              {
                key: 'custody',
                header: 'عهدة المطابخ/الوحدات',
                numeric: true,
                render: (r) => fmt(r.inCustody, 0),
              },
            ]}
            rows={cylinderRows}
            rowKey={(r) => `${r.warehouse}-${r.itemId}`}
          />
        </ImdPanel>
      )}

      <ImdModal
        open={Boolean(labelPreview)}
        onClose={() => setLabelPreview(null)}
        title={`ملصق باركود Code-128 — ${labelPreview?.label ?? ''}`}
        widthClass="max-w-sm"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setLabelPreview(null)}>إغلاق</ImdButton>
            <ImdButton
              variant="primary"
              onClick={() => {
                if (!labelPreview) return;
                const size = loadLabelSize();
                const copies = Math.max(1, Math.min(60, Math.round(Number(labelCopies) || 1)));
                const entries = Array.from({ length: copies }, () => ({
                  name: labelPreview.label,
                  code: labelPreview.code,
                  barcode: labelPreview.code,
                }));
                setSheetHtml(buildBarcodeSheetHtml(entries, size, db.config.orgName));
                setLabelPreview(null);
              }}
            >
              طباعة ({Math.max(1, Math.round(Number(labelCopies) || 1))} نسخة · {formatLabelSize(loadLabelSize())})
            </ImdButton>
          </>
        }
      >
        {labelPreview && (
          <div className="space-y-3 py-2">
            <div className="flex justify-center">
              <ImdBarcodeSvg code={labelPreview.code} label={labelPreview.label} />
            </div>
            <ImdFld label="عدد نسخ الملصق للطباعة" type="number" value={labelCopies} onChange={setLabelCopies} />
          </div>
        )}
      </ImdModal>
      <ImdModal
        open={Boolean(sheetHtml)}
        onClose={() => setSheetHtml(null)}
        title={`ورقة ملصقات الباركود (${formatLabelSize(loadLabelSize())})`}
        widthClass="max-w-4xl"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setSheetHtml(null)}>إغلاق</ImdButton>
            <ImdButton
              variant="primary"
              onClick={() => {
                const win = sheetFrameRef.current?.contentWindow;
                if (win) {
                  win.focus();
                  win.print();
                }
              }}
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الملصقات</span>
            </ImdButton>
          </>
        }
      >
        {sheetHtml && (
          <iframe
            ref={sheetFrameRef}
            title="معاينة ملصقات الباركود"
            srcDoc={sheetHtml}
            className="w-full h-[55vh] border border-[var(--imd-line-strong)] bg-white"
          />
        )}
      </ImdModal>
      <ImdModal
        open={Boolean(assignModalAsset)}
        onClose={() => setAssignModalAsset(null)}
        title={`تسليم عهدة أصل — ${assignModalAsset?.name ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setAssignModalAsset(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleAssignAsset}>توثيق تسليم العهدة</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          <ImdFld label="اسم المستلم (حامل العهدة)" value={assignHolder} onChange={setAssignHolder} placeholder="مثال: عريف / علي أحمد" />
          <ImdSelect
            label="الوحدة المستفيدة"
            value={assignUnitId}
            onChange={setAssignUnitId}
            options={db.beneficiary_units.map((u) => ({ value: u.id, label: u.name }))}
          />
          <ImdFld label="الحالة عند التسليم" value={assignCond} onChange={setAssignCond} />
        </div>
      </ImdModal>

      {/* Categories Modal */}
      <ImdModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title="إدارة تصنيفات الأصناف"
        widthClass="max-w-md"
        footer={<ImdButton variant="primary" onClick={() => setCatModalOpen(false)}>إغلاق</ImdButton>}
      >
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <ImdFld label="اسم التصنيف الجديد" value={newCatName} onChange={setNewCatName} className="flex-1" />
            <ImdButton
              variant="primary"
              onClick={() => {
                if (!newCatName.trim()) return;
                upsertRow('categories', {
                  id: Ids.next('cat'),
                  name: newCatName.trim(),
                  description: '',
                });
                setNewCatName('');
                notify('تمت إضافة التصنيف', 'success');
              }}
            >
              إضافة
            </ImdButton>
          </div>
          <div className="divide-y divide-[var(--imd-line)] border border-[var(--imd-line)]">
            {db.categories.map((c) => (
              <div key={c.id} className="px-3 py-2 flex items-center justify-between text-xs">
                <span className="font-medium">{c.name}</span>
                <ImdButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    deleteRow('categories', c.id);
                    notify(`تم حذف التصنيف «${c.name}»`, 'warn');
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                </ImdButton>
              </div>
            ))}
          </div>
        </div>
      </ImdModal>

      {/* Edit Item Modal */}
      <ImdModal
        open={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        title={`تعديل الصنف — ${editingItem?.name ?? ''}`}
        widthClass="max-w-lg"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditingItem(null)}>إلغاء</ImdButton>
            <ImdButton
              variant="primary"
              onClick={() => {
                if (!editingItem || !editingItem.name.trim()) return;
                upsertRow('items', editingItem);
                setEditingItem(null);
                notify('تم حفظ تعديلات الصنف', 'success');
              }}
            >
              حفظ التعديلات
            </ImdButton>
          </>
        }
      >
        {editingItem && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ImdFld label="الكود" value={editingItem.code} onChange={(v) => setEditingItem({ ...editingItem, code: v })} />
            <ImdFld label="الباركود" value={editingItem.barcode} onChange={(v) => setEditingItem({ ...editingItem, barcode: v })} />
            <ImdFld label="اسم الصنف" value={editingItem.name} onChange={(v) => setEditingItem({ ...editingItem, name: v })} className="md:col-span-2" />
            <ImdSelect
              label="التصنيف"
              value={editingItem.categoryId}
              onChange={(v) => {
                const c = db.categories.find((x) => x.id === v);
                setEditingItem({ ...editingItem, categoryId: v, categoryName: c?.name ?? editingItem.categoryName });
              }}
              options={db.categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <ImdFld
              label="حد التنبيه (بالوحدة الأساسية)"
              type="number"
              value={editingItem.minQty}
              onChange={(v) => setEditingItem({ ...editingItem, minQty: Math.max(0, Number(v) || 0) })}
            />
          </div>
        )}
      </ImdModal>

      {/* Warehouse Dashboard Modal */}
      <ImdModal
        open={Boolean(whDashName)}
        onClose={() => setWhDashName(null)}
        title={`لوحة المستودع — ${whDashName ?? ''}`}
        widthClass="max-w-3xl"
        footer={<ImdButton variant="primary" onClick={() => setWhDashName(null)}>إغلاق</ImdButton>}
      >
        {whDashSummary && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]">
                <div className="text-[var(--imd-muted)]">أصناف بها أرصدة</div>
                <div className="text-lg font-bold tabular-nums mt-0.5">{fmt(whDashSummary.balances.length, 0)}</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]">
                <div className="text-[var(--imd-muted)]">أوامر جرد مفتوحة</div>
                <div className="text-lg font-bold tabular-nums mt-0.5">{fmt(whDashSummary.openStocktakes.length, 0)}</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]">
                <div className="text-[var(--imd-muted)]">تحويلات معلّقة</div>
                <div className="text-lg font-bold tabular-nums mt-0.5">{fmt(whDashSummary.pendingTransfers.length, 0)}</div>
              </div>
            </div>
            <ImdTable
              columns={[
                { key: 'c', header: 'الكود', render: (r) => <span className="font-mono-num">{r.itemCode}</span> },
                { key: 'n', header: 'الصنف', render: (r) => r.itemName },
                { key: 'b', header: 'الرصيد', numeric: true, render: (r) => <strong>{fmt(r.balance)} {r.baseUnit}</strong> },
              ]}
              rows={whDashSummary.balances}
              rowKey={(r) => `${r.warehouse}-${r.itemId}`}
              reportCountToStatusBar={false}
              emptyTitle="لا توجد أرصدة في هذا المستودع حالياً"
            />
          </div>
        )}
      </ImdModal>

      {/* Edit / Rename Warehouse Modal */}
      <ImdModal
        open={Boolean(editingWh)}
        onClose={() => setEditingWh(null)}
        title={`تعديل المستودع — ${editingWh?.orig.name ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditingWh(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleSaveEditedWarehouse}>حفظ التعديل</ImdButton>
          </>
        }
      >
        {editingWh && (
          <div className="space-y-3">
            <ImdFld label="اسم المستودع (يمرّر تلقائياً لكافة السندات عند تغييره)" value={editingWh.name} onChange={(v) => setEditingWh({ ...editingWh, name: v })} />
            <ImdFld label="المسؤول" value={editingWh.manager} onChange={(v) => setEditingWh({ ...editingWh, manager: v })} />
            <ImdFld label="الموقع" value={editingWh.location} onChange={(v) => setEditingWh({ ...editingWh, location: v })} />
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={editingWh.isMain}
                onChange={(e) => setEditingWh({ ...editingWh, isMain: e.target.checked })}
              />
              <span>مستودع رئيسي (يموّن المعسكرات والفروع)</span>
            </label>
          </div>
        )}
      </ImdModal>

      {/* Edit Unit Modal */}
      <ImdModal
        open={Boolean(editingUnit)}
        onClose={() => setEditingUnit(null)}
        title={`تعديل الجهة — ${editingUnit?.name ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditingUnit(null)}>إلغاء</ImdButton>
            <ImdButton
              variant="primary"
              onClick={() => {
                if (!editingUnit || !editingUnit.name.trim()) return;
                upsertRow('beneficiary_units', editingUnit);
                setEditingUnit(null);
                notify('تم تحديث الجهة المستفيدة', 'success');
              }}
            >
              حفظ
            </ImdButton>
          </>
        }
      >
        {editingUnit && (
          <div className="space-y-3">
            <ImdFld label="الاسم" value={editingUnit.name} onChange={(v) => setEditingUnit({ ...editingUnit, name: v })} />
            <ImdFld label="الرمز" value={editingUnit.code} onChange={(v) => setEditingUnit({ ...editingUnit, code: v })} />
            <ImdFld label="الفئة" value={editingUnit.category} onChange={(v) => setEditingUnit({ ...editingUnit, category: v })} />
          </div>
        )}
      </ImdModal>

      {/* Edit Supplier Modal */}
      <ImdModal
        open={Boolean(editingSupplier)}
        onClose={() => setEditingSupplier(null)}
        title={`تعديل المورد — ${editingSupplier?.name ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditingSupplier(null)}>إلغاء</ImdButton>
            <ImdButton
              variant="primary"
              onClick={() => {
                if (!editingSupplier || !editingSupplier.name.trim()) return;
                upsertRow('suppliers', editingSupplier);
                setEditingSupplier(null);
                notify('تم تحديث بيانات المورد', 'success');
              }}
            >
              حفظ
            </ImdButton>
          </>
        }
      >
        {editingSupplier && (
          <div className="space-y-3">
            <ImdFld label="اسم المورد" value={editingSupplier.name} onChange={(v) => setEditingSupplier({ ...editingSupplier, name: v })} />
            <ImdFld label="الهاتف" value={editingSupplier.phone} onChange={(v) => setEditingSupplier({ ...editingSupplier, phone: v })} />
            <ImdFld label="جهة التواصل" value={editingSupplier.contact} onChange={(v) => setEditingSupplier({ ...editingSupplier, contact: v })} />
            <ImdFld label="المدينة" value={editingSupplier.city} onChange={(v) => setEditingSupplier({ ...editingSupplier, city: v })} />
          </div>
        )}
      </ImdModal>

      {/* Edit Facility Modal */}
      <ImdModal
        open={Boolean(editingFacility)}
        onClose={() => setEditingFacility(null)}
        title={`تعديل المنشأة — ${editingFacility?.name ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditingFacility(null)}>إلغاء</ImdButton>
            <ImdButton
              variant="primary"
              onClick={() => {
                if (!editingFacility || !editingFacility.name.trim()) return;
                upsertRow('facilities', editingFacility);
                setEditingFacility(null);
                notify('تم تحديث بيانات المنشأة', 'success');
              }}
            >
              حفظ
            </ImdButton>
          </>
        }
      >
        {editingFacility && (
          <div className="space-y-3">
            <ImdFld label="اسم المنشأة" value={editingFacility.name} onChange={(v) => setEditingFacility({ ...editingFacility, name: v })} />
            <ImdFld
              label="الطاقة الاستيعابية"
              type="number"
              value={editingFacility.capacity}
              onChange={(v) => setEditingFacility({ ...editingFacility, capacity: Math.max(0, Number(v) || 0) })}
            />
            <ImdSelect
              label="المستودع المغذي"
              value={editingFacility.warehouse}
              onChange={(v) => setEditingFacility({ ...editingFacility, warehouse: v })}
              options={db.warehouses.map((w) => ({ value: w.name, label: w.name }))}
            />
          </div>
        )}
      </ImdModal>

      {/* Edit Asset Modal */}
      <ImdModal
        open={Boolean(editingAsset)}
        onClose={() => setEditingAsset(null)}
        title={`تعديل الأصل الثابت — ${editingAsset?.name ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditingAsset(null)}>إلغاء</ImdButton>
            <ImdButton
              variant="primary"
              onClick={() => {
                if (!editingAsset || !editingAsset.name.trim()) return;
                upsertRow('assets', { ...editingAsset, updatedAt: new Date().toISOString() });
                setEditingAsset(null);
                notify('تم تحديث بيانات الأصل الثابت', 'success');
              }}
            >
              حفظ
            </ImdButton>
          </>
        }
      >
        {editingAsset && (
          <div className="space-y-3">
            <ImdFld label="اسم الأصل" value={editingAsset.name} onChange={(v) => setEditingAsset({ ...editingAsset, name: v })} />
            <ImdFld label="الرقم التسلسلي" value={editingAsset.serialNumber} onChange={(v) => setEditingAsset({ ...editingAsset, serialNumber: v })} />
            <ImdFld
              label="القيمة التقديرية"
              type="number"
              value={editingAsset.value}
              onChange={(v) => setEditingAsset({ ...editingAsset, value: Math.max(0, Number(v) || 0) })}
            />
            <ImdFld label="ملاحظات" value={editingAsset.notes} onChange={(v) => setEditingAsset({ ...editingAsset, notes: v })} />
          </div>
        )}
      </ImdModal>
    </ImdPage>
  );
};
