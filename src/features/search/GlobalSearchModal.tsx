// Global Search Modal (Ctrl+K) with deep-linked tab & filter navigation across Supply, Fuel, Documents, Catalog, Cables, Personnel & Archive

import React, { useMemo, useState } from 'react';
import { ArrowUpLeft, Search } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import { ImdModal } from '../../components/imd/primitives';
import { hasPerm, filterAllowedWarehouses } from '../../domain/accessControl';
import type { AppSpace } from '../../domain/types';

interface SearchResult {
  id: string;
  title: string;
  meta: string;
  space: AppSpace;
  door: string;
  subTab?: string;
  searchQuery?: string;
  focusId?: string;
}

export const GlobalSearchModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { db, currentUser, navigateTo } = useEmdad();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const canSupply = hasPerm(currentUser, 'space.supply');
  const canFuel = hasPerm(currentUser, 'space.fuel');
  const allowedWhNames = useMemo(
    () => new Set(filterAllowedWarehouses(currentUser, db.warehouses).map((w) => w.name)),
    [currentUser, db.warehouses]
  );

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const list: SearchResult[] = [];

    if (canSupply) {
      for (const it of db.items) {
        if (it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q) || it.barcode.toLowerCase().includes(q)) {
          list.push({ id: `itm-${it.id}`, title: it.name, meta: `صنف · ${it.code} · ${it.categoryName}`, space: 'supply', door: 'supplyData', subTab: 'items', searchQuery: it.code });
        }
      }
      for (const r of db.receipts) {
        if (!allowedWhNames.has(r.warehouse)) continue;
        if (r.refNo.toLowerCase().includes(q) || r.itemName.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q)) {
          list.push({ id: `rec-${r.id}`, title: `${r.refNo} — ${r.itemName}`, meta: `سند استلام · ${r.warehouse} · ${r.date}`, space: 'supply', door: 'documents', searchQuery: r.refNo });
        }
      }
      for (const i of db.issues) {
        if (!allowedWhNames.has(i.warehouse)) continue;
        if (i.refNo.toLowerCase().includes(q) || i.itemName.toLowerCase().includes(q) || i.recipientDisplay.toLowerCase().includes(q)) {
          list.push({ id: `iss-${i.id}`, title: `${i.refNo} — ${i.itemName}`, meta: `سند صرف · ${i.recipientDisplay} · ${i.date}`, space: 'supply', door: 'documents', searchQuery: i.refNo });
        }
      }
      for (const t of db.transfers) {
        if (!allowedWhNames.has(t.warehouse) && !allowedWhNames.has(t.destWarehouse)) continue;
        if (t.refNo.toLowerCase().includes(q) || t.itemName.toLowerCase().includes(q) || t.destWarehouse.toLowerCase().includes(q)) {
          list.push({ id: `tr-${t.id}`, title: `${t.refNo} — ${t.itemName}`, meta: `تحويل · ${t.warehouse} ← ${t.destWarehouse}`, space: 'supply', door: 'documents', searchQuery: t.refNo });
        }
      }
      for (const o of db.ration_orders) {
        if (o.refNo.toLowerCase().includes(q) || o.requestingWarehouse.toLowerCase().includes(q) || o.notes.toLowerCase().includes(q)) {
          list.push({ id: `ord-${o.id}`, title: `${o.refNo} — طلبية إمداد`, meta: `طلبية · ${o.requestingWarehouse} · ${o.status}`, space: 'supply', door: 'supplyOrders', subTab: 'orders', focusId: o.id });
        }
      }
      for (const a of db.assets) {
        if (a.name.toLowerCase().includes(q) || a.serialNumber.toLowerCase().includes(q) || a.facilityName.toLowerCase().includes(q)) {
          list.push({ id: `ast-${a.id}`, title: `${a.name} (${a.serialNumber})`, meta: `أصل ثابت · ${a.facilityName || a.warehouse}`, space: 'supply', door: 'supplyData', subTab: 'assets' });
        }
      }
      for (const u of db.beneficiary_units) {
        if (u.name.toLowerCase().includes(q) || u.code.toLowerCase().includes(q)) {
          list.push({ id: `bu-${u.id}`, title: u.name, meta: `${u.isCamp ? 'معسكر' : 'وحدة مستفيدة'} · ${u.code}`, space: 'supply', door: 'supplyData', subTab: 'units' });
        }
      }
      for (const s of db.stocktakes) {
        if (!allowedWhNames.has(s.warehouse)) continue;
        if (s.orderNo.toLowerCase().includes(q) || s.warehouse.toLowerCase().includes(q) || s.committee.toLowerCase().includes(q)) {
          list.push({ id: `stk-${s.id}`, title: `${s.orderNo} — جرد ${s.warehouse}`, meta: `جرد مخزني · ${s.status} · ${s.date}`, space: 'supply', door: 'stocktake', focusId: s.id });
        }
      }
      for (const p of db.link_persons) {
        if (p.fullName.toLowerCase().includes(q) || p.militaryNo.toLowerCase().includes(q)) {
          list.push({ id: `per-${p.id}`, title: `${p.rank} / ${p.fullName}`, meta: `قوة بشرية · ${p.militaryNo} · ${p.section}`, space: 'supply', door: 'personnel', searchQuery: p.fullName });
        }
      }
      for (const fc of db.link_fin_custodies) {
        if (fc.custodyNo.toLowerCase().includes(q) || fc.holder.toLowerCase().includes(q) || fc.title.toLowerCase().includes(q)) {
          list.push({ id: `fc-${fc.id}`, title: `${fc.custodyNo} — ${fc.holder}`, meta: `عهدة مالية · ${fc.amount} ${fc.currency.toUpperCase()}`, space: 'supply', door: 'linkages', subTab: 'custodies' });
        }
      }
      for (const con of db.link_purchase_contracts) {
        if (con.contractNo.toLowerCase().includes(q) || con.title.toLowerCase().includes(q) || con.supplier.toLowerCase().includes(q)) {
          list.push({ id: `con-${con.id}`, title: `${con.contractNo} — ${con.title}`, meta: `عقد توريد · ${con.supplier}`, space: 'supply', door: 'linkages', subTab: 'contracts' });
        }
      }
      for (const c of db.cables) {
        if (c.subject.toLowerCase().includes(q) || c.cableNo.toLowerCase().includes(q) || c.fromParty.toLowerCase().includes(q)) {
          list.push({ id: `cab-${c.id}`, title: `${c.cableNo} — ${c.subject}`, meta: `برقية · ${c.fromParty}`, space: 'supply', door: 'cables', searchQuery: c.cableNo });
        }
      }
      for (const ar of db.archive_files) {
        if (ar.title.toLowerCase().includes(q) || ar.docRef.toLowerCase().includes(q)) {
          list.push({ id: `arc-${ar.id}`, title: ar.title, meta: `أرشيف إلكتروني · ${ar.docRef} · ${ar.docDate}`, space: 'supply', door: 'archive', searchQuery: ar.docRef });
        }
      }
    }

    if (canFuel) {
      for (const f of db.fuel_issues) {
        if (f.refNo.toLowerCase().includes(q) || f.chassisNo.toLowerCase().includes(q) || f.beneficiaryName.toLowerCase().includes(q) || f.vehicleType.toLowerCase().includes(q)) {
          list.push({ id: `fiss-${f.id}`, title: `${f.refNo} — ${f.vehicleType || f.beneficiaryName}`, meta: `صرف محروقات · شاصي: ${f.chassisNo || '—'} · ${f.quantityLiters} لتر`, space: 'fuel', door: 'fuelReports', subTab: 'vehicles' });
        }
      }
      for (const fs of db.fuel_supplies) {
        if (fs.refNo.toLowerCase().includes(q) || fs.supplierName.toLowerCase().includes(q)) {
          list.push({ id: `fsup-${fs.id}`, title: `${fs.refNo} — توريد ${fs.supplierName}`, meta: `محروقات · ${fs.warehouse} · ${fs.quantityLiters} لتر`, space: 'fuel', door: 'fuelMoves', subTab: 'log' });
        }
      }
      for (const fa of db.fuel_allocations) {
        if (fa.refNo.toLowerCase().includes(q) || fa.unitName.toLowerCase().includes(q)) {
          list.push({ id: `fal-${fa.id}`, title: `${fa.refNo} — تفريدة ${fa.unitName}`, meta: `محروقات · ${fa.quantityPerPeriod} لتر / ${fa.periodType}`, space: 'fuel', door: 'fuelAllocations' });
        }
      }
      for (const fst of db.fuel_stocktakes) {
        if (fst.refNo.toLowerCase().includes(q) || fst.warehouse.toLowerCase().includes(q)) {
          list.push({ id: `fst-${fst.id}`, title: `${fst.refNo} — جرد ${fst.warehouse}`, meta: `جرد محروقات · ${fst.status} · ${fst.date}`, space: 'fuel', door: 'fuelStocktake', focusId: fst.id });
        }
      }
    }

    return list.slice(0, 25);
  }, [db, query, canSupply, canFuel, allowedWhNames]);

  const openResult = (hit: SearchResult) => {
    navigateTo({
      space: hit.space,
      door: hit.door,
      subTab: hit.subTab,
      searchQuery: hit.searchQuery,
      focusId: hit.focusId,
    });
    onClose();
  };

  return (
    <ImdModal open={open} onClose={onClose} title="البحث الشامل في النظام (Ctrl+K)" widthClass="max-w-xl">
      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-2.5 text-[var(--imd-muted)]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && results.length > 0) {
              e.preventDefault();
              setSelectedIdx((i) => (i + 1) % results.length);
            } else if (e.key === 'ArrowUp' && results.length > 0) {
              e.preventDefault();
              setSelectedIdx((i) => (i - 1 + results.length) % results.length);
            } else if (e.key === 'Enter' && results[selectedIdx]) {
              e.preventDefault();
              openResult(results[selectedIdx]);
            }
          }}
          placeholder="ابحث برقم السند، اسم الصنف، الباركود، الطلبية، الأصل، الرقم العسكري، الشاصي، أو الأرشيف..."
          className="w-full h-9 pr-9 pl-3 text-sm border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] text-[var(--imd-text)] outline-none focus:border-[var(--imd-accent)] focus:ring-2 focus:ring-[var(--imd-ring)]"
          style={{ borderRadius: 'var(--imd-radius-sm)' }}
        />
      </div>

      <div className="divide-y divide-[var(--imd-table-row-line)] max-h-80 overflow-y-auto">
        {!query.trim() && (
          <div className="py-8 text-center space-y-2">
            <div className="text-xs text-[var(--imd-muted)]">
              اكتب عبارة للبحث الفوري عبر كافة بيانات الإمداد والمحروقات والوثائق المصرح بها لحسابك
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 text-[11px]">
              {['أرز', 'و-K7QX2A', 'ديزل', 'ط-K7QX2A', 'WDB963'].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setQuery(sample)}
                  className="px-2 py-0.5 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] hover:border-[var(--imd-accent)] text-[var(--imd-text2)] cursor-pointer font-mono-num"
                  style={{ borderRadius: 'var(--imd-radius-sm)' }}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        )}
        {query.trim() && results.length === 0 && (
          <div className="py-8 text-center text-xs text-[var(--imd-muted)]">
            لا توجد نتائج مطابقة لـ "{query}"
          </div>
        )}
        {results.map((r, idx) => (
          <button
            key={r.id}
            type="button"
            onMouseEnter={() => setSelectedIdx(idx)}
            onClick={() => openResult(r)}
            className={`w-full text-right px-3 py-2.5 transition-colors cursor-pointer flex items-center justify-between gap-2 ${
              idx === selectedIdx ? 'bg-[var(--imd-hover)]' : 'hover:bg-[var(--imd-hover)]'
            }`}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--imd-text)] truncate">{r.title}</div>
              <div className="text-xs text-[var(--imd-muted)] mt-0.5 truncate">{r.meta}</div>
            </div>
            <ArrowUpLeft className="w-3.5 h-3.5 text-[var(--imd-muted)] shrink-0" />
          </button>
        ))}
      </div>

      <div className="pt-2 border-t border-[var(--imd-line)] flex items-center justify-between text-[11px] text-[var(--imd-muted)]">
        <span>↑↓ للتنقل · Enter للفتح المباشر في الشاشة الهدف · Esc للإغلاق</span>
        {results.length > 0 && <span className="tabular-nums">{results.length} نتيجة</span>}
      </div>
    </ImdModal>
  );
};
