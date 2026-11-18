// Enterprise RTL Data Table with Sticky Header, 3-State Sorting, Column Filtering,
// Right-Click Context Menu, 100/page Pagination (>300 rows), and Automatic Responsive
// Switch between Table View (>900px) and Card View (<=900px).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutList,
  MoreVertical,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { useEmdad } from '../../../data/EmdadProvider';
import { ImdBp, ImdDensity } from '../imdTokens';
import { useImdPlatform } from '../imdPlatform';

export const IMD_TABLE_BREAKPOINT_PX = ImdBp.mobileMax; // 900
export const IMD_TABLE_PAGINATION_THRESHOLD = 300;
export const IMD_TABLE_PAGE_SIZE = 100;

export interface ImdColumn<T> {
  key: string;
  header: string;
  render: (row: T, idx: number) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  filterValue?: (row: T) => string;
  align?: 'right' | 'center' | 'left';
  width?: string;
  numeric?: boolean;
  hideOnCard?: boolean;
  isCardTitle?: boolean;
  isCardSubtitle?: boolean;
}

export interface ImdRowMenuItem<T> {
  label: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger' | 'accent';
  onClick: (row: T) => void;
}

export interface ImdTableProps<T> {
  columns: ImdColumn<T>[];
  rows: T[];
  rowKey: (row: T, idx: number) => string;
  emptyText?: string;
  emptyTitle?: string;
  emptyHint?: string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  toolbarRight?: React.ReactNode;
  toolbarLeft?: React.ReactNode;
  maxHeightClass?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, idx: number) => string;
  rowMenu?: (row: T) => ImdRowMenuItem<T>[];
  forceLayout?: 'auto' | 'table' | 'cards';
  enableColumnFilters?: boolean;
  enableColumnFilter?: boolean;
  reportCountToStatusBar?: boolean;
}

/**
 * Pure helper to determine whether the layout should switch to card view (< 900px or <= 900px per ImdBp.mobileMax).
 */
export function isCompactTableWidth(widthPx: number): boolean {
  return widthPx <= IMD_TABLE_BREAKPOINT_PX;
}

/**
 * Pure helper to sort rows by a column's `sortValue` or primitive property.
 */
export function sortTableRows<T>(
  rows: T[],
  col: ImdColumn<T> | undefined,
  sortDir: 'asc' | 'desc'
): T[] {
  if (!col) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const va = col.sortValue
      ? col.sortValue(a)
      : ((a as Record<string, unknown>)[col.key] as string | number | undefined);
    const vb = col.sortValue
      ? col.sortValue(b)
      : ((b as Record<string, unknown>)[col.key] as string | number | undefined);
    if (typeof va === 'number' && typeof vb === 'number') {
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    const sa = String(va ?? '');
    const sb = String(vb ?? '');
    return sortDir === 'asc' ? sa.localeCompare(sb, 'ar') : sb.localeCompare(sa, 'ar');
  });
  return copy;
}

export const ImdColumnFilter: React.FC<{
  columns: Array<{ key: string; header: string }>;
  filters: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}> = ({ columns, filters, onChange, onClear }) => {
  const activeCount = Object.values(filters).filter((v) => v.trim().length > 0).length;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-2.5 border-b border-[var(--imd-line)] bg-[var(--imd-panel-fill)]">
      {columns.map((c) => (
        <div key={c.key} className="relative">
          <input
            type="text"
            value={filters[c.key] ?? ''}
            onChange={(e) => onChange(c.key, e.target.value)}
            placeholder={`تصفية ${c.header}...`}
            className="w-full h-7 px-2 text-[11px] border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] text-[var(--imd-text)] outline-none focus:border-[var(--imd-accent)]"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
          />
        </div>
      ))}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="h-7 px-2.5 text-[11px] font-semibold text-[var(--imd-danger)] hover:underline cursor-pointer flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          <span>مسح الفلاتر ({activeCount})</span>
        </button>
      )}
    </div>
  );
};

export function ImdTable<T>({
  columns,
  rows,
  rowKey,
  emptyText,
  emptyTitle,
  searchPlaceholder = 'بحث سريع في الجدول...',
  searchFilter,
  toolbarRight,
  toolbarLeft,
  maxHeightClass = 'max-h-[540px]',
  onRowClick,
  rowClassName,
  rowMenu,
  forceLayout = 'auto',
  enableColumnFilters,
  enableColumnFilter,
  reportCountToStatusBar = true,
}: ImdTableProps<T>) {
  const resolvedEmptyText = emptyText ?? emptyTitle ?? 'لا توجد سجلات مطابقة للعرض';
  const hasColumnFilters = Boolean(enableColumnFilters ?? enableColumnFilter);
  const { db, fmt, setActiveRecordCount } = useEmdad();
  const dense = db.config.highDensity;
  const densityMetrics = ImdDensity.resolve(dense);
  const { metrics: platformMetrics } = useImdPlatform(dense);

  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [manualViewOverride, setManualViewOverride] = useState<'table' | 'cards' | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: T;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? isCompactTableWidth(window.innerWidth) : false
  );

  // Automatic responsive observer switching between Android Tablet Table (>900px) and Android Phone Cards (<=900px)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateResponsiveMode = () => {
      const viewportW = window.innerWidth;
      const containerW = containerRef.current?.clientWidth ?? viewportW;
      setIsCompactViewport(
        isCompactTableWidth(viewportW) || isCompactTableWidth(containerW)
      );
    };

    updateResponsiveMode();
    window.addEventListener('resize', updateResponsiveMode);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        updateResponsiveMode();
      });
      ro.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateResponsiveMode);
      if (ro) ro.disconnect();
    };
  }, []);

  // Reset manual view override when platform mode or compact state changes
  useEffect(() => {
    setManualViewOverride(null);
  }, [platformMetrics.mode, platformMetrics.isCompactScreen, isCompactViewport]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        if (searchFilter) {
          if (!searchFilter(row, q)) return false;
        } else {
          const text = JSON.stringify(row).toLowerCase();
          if (!text.includes(q)) return false;
        }
      }
      for (const [k, fv] of Object.entries(colFilters)) {
        const needle = fv.trim().toLowerCase();
        if (!needle) continue;
        const col = columns.find((c) => c.key === k);
        const raw = col?.filterValue
          ? col.filterValue(row)
          : String((row as Record<string, unknown>)[k] ?? '');
        if (!raw.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [rows, query, searchFilter, colFilters, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    return sortTableRows(filtered, col, sortDir);
  }, [filtered, sortKey, sortDir, columns]);

  useEffect(() => {
    if (reportCountToStatusBar) {
      setActiveRecordCount(sorted.length);
    }
  }, [reportCountToStatusBar, sorted.length, setActiveRecordCount]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [query, colFilters]);

  const handleHeaderSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey(null);
        setSortDir('asc');
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const usePagination = sorted.length > IMD_TABLE_PAGINATION_THRESHOLD;
  const totalPages = usePagination ? Math.max(1, Math.ceil(sorted.length / IMD_TABLE_PAGE_SIZE)) : 1;
  const visibleRows = useMemo(() => {
    if (!usePagination) return sorted;
    const start = (page - 1) * IMD_TABLE_PAGE_SIZE;
    return sorted.slice(start, start + IMD_TABLE_PAGE_SIZE);
  }, [sorted, usePagination, page]);

  const autoCards = isCompactViewport || platformMetrics.isCompactScreen;
  const renderAsCards =
    forceLayout === 'cards'
      ? true
      : forceLayout === 'table'
      ? false
      : manualViewOverride
      ? manualViewOverride === 'cards'
      : autoCards;

  const cellPadStyle: React.CSSProperties = {
    paddingTop: `${platformMetrics.cellPadVPx || densityMetrics.cellPadV}px`,
    paddingBottom: `${platformMetrics.cellPadVPx || densityMetrics.cellPadV}px`,
    paddingRight: `${densityMetrics.cellPadH}px`,
    paddingLeft: `${densityMetrics.cellPadH}px`,
  };
  const textCls = dense ? 'text-xs' : 'text-xs md:text-[13px]';

  // Identify primary title/subtitle columns for Card layout
  const primaryCol =
    columns.find((c) => c.isCardTitle) ??
    columns.find((c) => !c.hideOnCard) ??
    columns[0];
  const secondaryCol =
    columns.find((c) => c.isCardSubtitle && c.key !== primaryCol?.key) ??
    columns.find((c) => c.key !== primaryCol?.key && !c.hideOnCard);

  return (
    <div
      ref={containerRef}
      data-testid="imd-table-root"
      data-layout={renderAsCards ? 'cards' : 'table'}
      className="border border-[var(--imd-line)] bg-[var(--imd-surface)] overflow-hidden relative"
      style={{ borderRadius: 'var(--imd-radius)', boxShadow: 'var(--imd-shadow)' }}
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--imd-line)] bg-[var(--imd-toolbar-fill)]">
        <div className="flex items-center gap-2 flex-1 min-w-[210px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-[var(--imd-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                backgroundColor: 'var(--imd-field-fill)',
                borderColor: 'var(--imd-line-strong)',
                color: 'var(--imd-text)',
                borderRadius: 'var(--imd-radius-sm)',
              }}
              className="w-full h-8 pr-8 pl-2.5 text-xs border outline-none focus:border-[var(--imd-accent)] focus:ring-2 focus:ring-[var(--imd-ring)]"
            />
          </div>
          {hasColumnFilters && (
            <button
              type="button"
              onClick={() => setShowColFilters((v) => !v)}
              title="فلاتر الأعمدة"
              className={`h-8 px-2.5 text-xs border flex items-center gap-1 cursor-pointer transition-colors ${
                showColFilters
                  ? 'border-[var(--imd-accent)] bg-[var(--imd-accent-soft)] text-[var(--imd-accent)] font-bold'
                  : 'border-[var(--imd-line-strong)] bg-[var(--imd-surface)] text-[var(--imd-text2)]'
              }`}
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تصفية</span>
            </button>
          )}
          {toolbarRight}
        </div>
        <div className="flex items-center gap-2">
          {toolbarLeft}
          <button
            type="button"
            onClick={() => setManualViewOverride(renderAsCards ? 'table' : 'cards')}
            title={renderAsCards ? 'التبديل إلى عرض الجدول (تابلت أندرويد)' : 'التبديل إلى عرض البطاقات (هاتف أندرويد)'}
            className="h-7 px-2 text-[11px] border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] text-[var(--imd-text2)] hover:border-[var(--imd-accent)] hover:text-[var(--imd-accent)] inline-flex items-center gap-1 cursor-pointer transition-colors"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
          >
            {renderAsCards ? (
              <>
                <Table2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">جدول</span>
              </>
            ) : (
              <>
                <LayoutList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">بطاقات</span>
              </>
            )}
          </button>
          <span className="text-[11px] font-medium text-[var(--imd-muted)] tabular-nums">
            العدد: {fmt(sorted.length, 0)}
          </span>
        </div>
      </div>

      {/* Optional Column Filters Bar */}
      {hasColumnFilters && showColFilters && (
        <ImdColumnFilter
          columns={columns.map((c) => ({ key: c.key, header: c.header }))}
          filters={colFilters}
          onChange={(k, v) => setColFilters((prev) => ({ ...prev, [k]: v }))}
          onClear={() => setColFilters({})}
        />
      )}

      {/* Sort Selector Bar when in Responsive Card View (<= 900px) */}
      {renderAsCards && columns.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--imd-line)] bg-[var(--imd-panel-fill)] text-xs">
          <span className="text-[11px] font-semibold text-[var(--imd-muted)]">
            عرض البطاقات التلقائي (&le; {IMD_TABLE_BREAKPOINT_PX}px)
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--imd-muted)]">فرز حسب:</span>
            <select
              value={sortKey ?? ''}
              onChange={(e) => {
                const k = e.target.value;
                if (!k) {
                  setSortKey(null);
                } else {
                  setSortKey(k);
                }
              }}
              className="h-7 px-2 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] text-[var(--imd-text)] outline-none"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            >
              <option value="">الافتراضي</option>
              {columns.map((col) => (
                <option key={col.key} value={col.key}>
                  {col.header}
                </option>
              ))}
            </select>
            {sortKey && (
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="h-7 px-2 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] text-[var(--imd-accent)] flex items-center gap-1 cursor-pointer"
                style={{ borderRadius: 'var(--imd-radius-sm)' }}
                title={sortDir === 'asc' ? 'تصاعدي' : 'تنازلي'}
              >
                {sortDir === 'asc' ? (
                  <ArrowUp className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area: Responsive Switch between Table (>900px) and Cards (<=900px) */}
      {!renderAsCards ? (
        <div className={`overflow-auto ${maxHeightClass}`}>
          <table className="w-full border-collapse text-right">
            <thead className="sticky top-0 z-10 bg-[var(--imd-table-head)] border-b border-[var(--imd-line-strong)] shadow-[0_1px_0_var(--imd-line-strong)]">
              <tr>
                {columns.map((col) => {
                  const alignCls =
                    col.align === 'center'
                      ? 'text-center'
                      : col.align === 'left'
                      ? 'text-left'
                      : 'text-right';
                  const isSorted = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      style={{ width: col.width, ...cellPadStyle }}
                      onClick={() => handleHeaderSort(col.key)}
                      aria-sort={
                        isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                      }
                      className={`${alignCls} text-[11px] font-bold text-[var(--imd-text2)] select-none cursor-pointer hover:bg-[var(--imd-hover)] transition-colors whitespace-nowrap`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>{col.header}</span>
                        {isSorted ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-[var(--imd-accent)]" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-[var(--imd-accent)]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-35" />
                        )}
                      </span>
                    </th>
                  );
                })}
                {rowMenu && (
                  <th style={{ width: '40px', ...cellPadStyle }} className="text-center text-[11px]" />
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (rowMenu ? 1 : 0)}
                    className="py-10 text-center text-xs text-[var(--imd-muted)]"
                  >
                    {resolvedEmptyText}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, idx) => (
                  <tr
                    key={rowKey(row, idx)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onContextMenu={
                      rowMenu
                        ? (e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, row });
                          }
                        : undefined
                    }
                    className={`border-b border-[var(--imd-table-row-line)] hover:bg-[var(--imd-hover)] transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${rowClassName ? rowClassName(row, idx) : ''}`}
                  >
                    {columns.map((col) => {
                      const alignCls =
                        col.align === 'center'
                          ? 'text-center'
                          : col.align === 'left'
                          ? 'text-left'
                          : 'text-right';
                      const numCls = col.numeric ? 'tabular-nums font-mono-num' : '';
                      return (
                        <td
                          key={col.key}
                          style={cellPadStyle}
                          className={`${textCls} ${alignCls} ${numCls} text-[var(--imd-text)] align-middle`}
                        >
                          {col.render(row, idx)}
                        </td>
                      );
                    })}
                    {rowMenu && (
                      <td style={cellPadStyle} className="text-center align-middle">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu({
                              x: e.currentTarget.getBoundingClientRect().left,
                              y: e.currentTarget.getBoundingClientRect().bottom,
                              row,
                            });
                          }}
                          className="p-1 text-[var(--imd-muted)] hover:text-[var(--imd-text)] cursor-pointer"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`overflow-y-auto p-3 space-y-2.5 ${maxHeightClass}`}>
          {visibleRows.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--imd-muted)]">{resolvedEmptyText}</div>
          ) : (
            visibleRows.map((row, idx) => {
              const detailCols = columns.filter(
                (c) =>
                  !c.hideOnCard &&
                  c.key !== primaryCol?.key &&
                  c.key !== secondaryCol?.key
              );
              return (
                <div
                  key={rowKey(row, idx)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border border-[var(--imd-line-strong)] bg-[var(--imd-panel-fill)] p-3 space-y-2 transition-colors ${
                    onRowClick ? 'cursor-pointer hover:border-[var(--imd-accent)]' : ''
                  } ${rowClassName ? rowClassName(row, idx) : ''}`}
                  style={{ borderRadius: 'var(--imd-radius-sm)' }}
                >
                  {/* Card Header: Primary + Secondary Column */}
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-[var(--imd-table-row-line)]">
                    <div className="min-w-0 flex-1">
                      {primaryCol && (
                        <div className="text-xs font-bold text-[var(--imd-text)]">
                          {primaryCol.render(row, idx)}
                        </div>
                      )}
                      {secondaryCol && (
                        <div className="text-[11px] text-[var(--imd-muted)] mt-0.5">
                          <span className="font-medium">{secondaryCol.header}: </span>
                          <span>{secondaryCol.render(row, idx)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Body Grid for Remaining Columns */}
                  {detailCols.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      {detailCols.map((col) => (
                        <div
                          key={col.key}
                          className="flex flex-col gap-0.5 min-w-0"
                        >
                          <span className="text-[10px] font-medium text-[var(--imd-muted)]">
                            {col.header}
                          </span>
                          <div
                            className={`text-xs text-[var(--imd-text)] ${
                              col.numeric ? 'tabular-nums font-mono-num' : ''
                            }`}
                          >
                            {col.render(row, idx)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Automatic Pagination Footer (> 300 rows, 100 rows per page) */}
      {usePagination && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[var(--imd-line)] bg-[var(--imd-toolbar-fill)] text-xs">
          <span className="text-[11px] text-[var(--imd-muted)] tabular-nums">
            صفحة {fmt(page, 0)} من {fmt(totalPages, 0)} (إجمالي {fmt(sorted.length, 0)} سجل)
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] disabled:opacity-40 cursor-pointer flex items-center gap-1"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            >
              <ChevronRight className="w-3.5 h-3.5" />
              <span>السابق</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 px-2 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] disabled:opacity-40 cursor-pointer flex items-center gap-1"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            >
              <span>التالي</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Right-click / Action Menu */}
      {contextMenu && rowMenu && (
        <div
          className="fixed z-50 min-w-[160px] py-1 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] shadow-lg"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 160),
            left: Math.max(12, Math.min(contextMenu.x, window.innerWidth - 180)),
            borderRadius: 'var(--imd-radius-sm)',
          }}
        >
          {rowMenu(contextMenu.row).map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                item.onClick(contextMenu.row);
                setContextMenu(null);
              }}
              className={`w-full px-3 py-1.5 text-right text-xs flex items-center gap-2 hover:bg-[var(--imd-hover)] cursor-pointer ${
                item.tone === 'danger'
                  ? 'text-[var(--imd-danger)] font-semibold'
                  : item.tone === 'accent'
                  ? 'text-[var(--imd-accent)] font-semibold'
                  : 'text-[var(--imd-text)]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
