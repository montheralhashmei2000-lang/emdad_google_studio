// HomeShell: Pure Android APK Touch Shell — 56px Android AppBar, 58px Bottom Navigation Bar (4 Primary Doors + All Doors Drawer), Slide-Over Navigation Drawer with Live Badges, Quick Actions & Notifications Deep-Linker

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  CalendarClock,
  Calculator,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  Database,
  FileText,
  Flame,
  Fuel,
  Info,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  LogOut,
  Mail,
  Menu,
  Moon,
  Package,
  PlusCircle,
  Search,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import { todayIso } from '../../core/ui/imdTokens';
import { useImdPlatform } from '../../core/ui/imdPlatform';
import { hasPerm } from '../../domain/accessControl';
import { scanSystemNotifications, type AppNotification } from '../../domain/notificationEngine';
import { GlobalSearchModal } from '../search/GlobalSearchModal';
import { DashboardScreen } from './DashboardScreen';
import { SupplyMovesHub } from '../inventory/SupplyMovesHub';
import { SupplyOrdersHub } from '../orders/SupplyOrdersHub';
import { DocumentsScreen } from '../documents/DocumentsScreen';
import { DailyHub } from '../daily/DailyHub';
import { StocktakeScreen } from '../stocktake/StocktakeScreen';
import { CampAccountsHub } from '../camp/CampAccountsHub';
import { ReportsHub } from '../reports/ReportsHub';
import { BasicDataHub } from '../catalog/BasicDataHub';
import { CablesScreen } from '../cables/CablesScreen';
import { ElectronicArchiveScreen } from '../archive/ElectronicArchiveScreen';
import { LinkagesScreen, PersonnelStrengthScreen } from '../linkages/LinkagesScreens';
import { AuditHub } from '../audit/AuditHub';
import { SettingsScreen } from '../settings/SettingsScreen';
import {
  FuelAllocationsScreen,
  FuelDashboardScreen,
  FuelMovesScreen,
  FuelStocktakeScreen,
} from '../fuel/FuelWorkspace';
import {
  FuelDataScreen,
  FuelReportsScreen,
  FuelSettingsScreen,
} from '../fuel/FuelReportsAndData';
import { PrintModalHost } from '../../components/imd/PrintModal';
import { ImdButton, ImdFld, ImdModal, ImdNote } from '../../components/imd/primitives';
import { OfflineIndicator, PWAInstallButton } from '../../components/imd/PwaControls';
import { pbkdf2Hash, verifyPassword } from '../../core/security/crypto';
import { IdleLockModal } from '../auth/AuthScreens';

interface DoorDef {
  id: string;
  label: string;
  perm: string;
  group: string;
  icon: React.FC<{ className?: string }>;
}

const SUPPLY_DOORS: DoorDef[] = [
  { id: 'dashboard', label: 'الرئيسية', perm: 'supply.dashboard', group: 'العمليات والمخزون', icon: LayoutDashboard },
  { id: 'supplyMoves', label: 'حركة المخزون', perm: 'supply.moves.read', group: 'العمليات والمخزون', icon: Package },
  { id: 'supplyOrders', label: 'الطلبيات', perm: 'supply.orders', group: 'العمليات والمخزون', icon: ShoppingCart },
  { id: 'documents', label: 'سجل المستندات', perm: 'supply.documents', group: 'العمليات والمخزون', icon: FileText },
  { id: 'stocktake', label: 'الجرد المخزني', perm: 'supply.stocktake', group: 'العمليات والمخزون', icon: ClipboardCheck },

  { id: 'supplyDaily', label: 'التشغيل اليومي', perm: 'supply.daily', group: 'الإعاشة والمعسكرات', icon: CalendarClock },
  { id: 'campAccounts', label: 'حساب المعسكر', perm: 'supply.campAccounts', group: 'الإعاشة والمعسكرات', icon: Calculator },
  { id: 'supplyReports', label: 'التقارير والأرصدة', perm: 'supply.reports', group: 'الإعاشة والمعسكرات', icon: BarChart3 },

  { id: 'supplyData', label: 'البيانات الأساسية', perm: 'supply.data', group: 'الإدارة والارتباطات', icon: Database },
  { id: 'cables', label: 'البرقيات', perm: 'supply.cables', group: 'الإدارة والارتباطات', icon: Mail },
  { id: 'archive', label: 'الأرشيف الإلكتروني', perm: 'supply.archive', group: 'الإدارة والارتباطات', icon: Archive },
  { id: 'personnel', label: 'القوة البشرية', perm: 'supply.personnel', group: 'الإدارة والارتباطات', icon: Users },
  { id: 'linkages', label: 'المالية والتسليح', perm: 'supply.linkages', group: 'الإدارة والارتباطات', icon: Wallet },

  { id: 'supplyAudit', label: 'الرقابة والتدقيق', perm: 'supply.audit', group: 'الحوكمة والنظام', icon: ShieldAlert },
  { id: 'settings', label: 'الإعدادات', perm: 'supply.settings', group: 'الحوكمة والنظام', icon: Settings },
];

const FUEL_DOORS: DoorDef[] = [
  { id: 'fuelDashboard', label: 'لوحة المحروقات', perm: 'fuel.dashboard', group: 'عمليات المحروقات', icon: LayoutDashboard },
  { id: 'fuelMoves', label: 'حركة المحروقات', perm: 'fuel.moves', group: 'عمليات المحروقات', icon: Flame },
  { id: 'fuelAllocations', label: 'تفريدة المحروقات', perm: 'fuel.allocations', group: 'عمليات المحروقات', icon: Fuel },
  { id: 'fuelStocktake', label: 'جرد المحروقات', perm: 'fuel.stocktake', group: 'عمليات المحروقات', icon: ClipboardCheck },

  { id: 'fuelReports', label: 'التقارير والمركبات', perm: 'fuel.reports', group: 'التقارير والبيانات', icon: BarChart3 },
  { id: 'fuelData', label: 'المحطات والوحدات', perm: 'fuel.data', group: 'التقارير والبيانات', icon: Truck },
  { id: 'fuelSettings', label: 'إعدادات المحروقات', perm: 'fuel.settings', group: 'التقارير والبيانات', icon: Settings },
];

function notificationSubTab(n: AppNotification): string | undefined {
  switch (n.kind) {
    case 'stockCritical':
    case 'expiryAlert':
    case 'warehouseNegative':
      return 'alerts';
    case 'transferPending':
      return 'transfer';
    case 'rationPending':
      return 'orders';
    case 'issueOrderPending':
      return 'pending';
    case 'mealPlanEnding':
      return 'ops';
    case 'settlementDue':
      return 'settlement';
    case 'fuelLow':
      return 'supply';
    case 'fuelDrained':
      return undefined;
    default:
      return undefined;
  }
}

export const HomeShell: React.FC = () => {
  const {
    db,
    currentUser,
    activeSpace,
    setActiveSpace,
    activeDoor,
    setActiveDoor,
    navigateTo,
    updateConfig,
    lockSession,
    logout,
    ledger,
    fuelTanks,
    mutateDb,
    logAudit,
    notify,
    fmt,
  } = useEmdad();

  const { metrics: platformMetrics } = useImdPlatform(
    db.config.highDensity
  );

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsOnlyUnread, setAlertsOnlyUnread] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [curPwd, setCurPwd] = useState('');
  const [nextPwd, setNextPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  const space = activeSpace ?? 'supply';
  const canSupply = hasPerm(currentUser, 'space.supply') || currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const canFuel = hasPerm(currentUser, 'space.fuel') || currentUser?.role === 'owner' || currentUser?.role === 'admin';

  const visibleDoors = useMemo(() => {
    const list = space === 'fuel' ? FUEL_DOORS : SUPPLY_DOORS;
    return list.filter((d) => hasPerm(currentUser, d.perm));
  }, [space, currentUser]);

  const groupedDoors = useMemo(() => {
    const map = new Map<string, DoorDef[]>();
    for (const d of visibleDoors) {
      const arr = map.get(d.group) ?? [];
      arr.push(d);
      map.set(d.group, arr);
    }
    return Array.from(map.entries());
  }, [visibleDoors]);

  // Live drawer & bottom-nav counters
  const doorBadges = useMemo<Record<string, number>>(() => {
    const pendingTransfers = db.transfers.filter((t) => t.status === 'PENDING').length;
    const pendingOrders = db.ration_orders.filter((o) => o.status === 'PENDING').length;
    const openStocktakes = db.stocktakes.filter((s) => s.status === 'COUNTING').length;
    const activeCables = db.cables.filter((c) => c.status === 'new' || c.status === 'processing').length;
    const reviewedIds = new Set(db.sensitive_reviews.map((r) => r.logId));
    const unreviewedSensitive = db.audit_logs.filter(
      (a) => (a.risk === 'sensitive' || a.risk === 'high' || a.risk === 'critical') && !reviewedIds.has(a.id)
    ).length;
    const openFuelStocktakes = db.fuel_stocktakes.filter((s) => s.status !== 'posted').length;
    const lowTanks = fuelTanks.filter((t) => t.isLowStock).length;

    return {
      supplyMoves: pendingTransfers,
      supplyOrders: pendingOrders,
      stocktake: openStocktakes,
      cables: activeCables,
      supplyAudit: unreviewedSensitive,
      fuelStocktake: openFuelStocktakes,
      fuelDashboard: lowTanks,
    };
  }, [db.transfers, db.ration_orders, db.stocktakes, db.cables, db.sensitive_reviews, db.audit_logs, db.fuel_stocktakes, fuelTanks]);

  // Close popovers on outside click
  useEffect(() => {
    if (!alertsOpen && !quickOpen) return;
    const onDown = () => {
      setAlertsOpen(false);
      setQuickOpen(false);
    };
    const timer = window.setTimeout(() => window.addEventListener('click', onDown), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('click', onDown);
    };
  }, [alertsOpen, quickOpen]);

  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem('imdad.notify.read');
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  });

  const persistReadNotifs = (next: Set<string>) => {
    setReadNotifIds(next);
    try {
      window.localStorage.setItem('imdad.notify.read', JSON.stringify(Array.from(next)));
    } catch {
      // ignore storage errors
    }
  };

  // Live alerts derived cleanly per Space + Role + WarehouseScope
  const notifications = useMemo(
    () =>
      scanSystemNotifications({
        space,
        user: currentUser,
        today: todayIso(),
        items: db.items,
        entitlements: db.entitlements,
        strengths: db.strengths,
        beneficiaryUnits: db.beneficiary_units,
        receipts: db.receipts,
        issues: db.issues,
        transfers: db.transfers,
        rationOrders: db.ration_orders,
        mealPlans: db.meal_plans,
        assets: db.assets,
        campLedgers: db.camp_ledgers,
        monthlySettlements: db.monthly_settlements,
        campStockLimits: db.camp_stock_limits,
        warehouseStockLimits: db.warehouse_stock_limits,
        ledger,
        fuelTanks,
        fuelAllocations: db.fuel_allocations,
        fuelIssues: db.fuel_issues,
        fuelSettings: db.fuel_settings_rows[0],
        persons: db.link_persons,
        finCustodies: db.link_fin_custodies,
        supplyDaysMin: db.config.supplyDaysMin,
        supplyDaysCritical: db.config.supplyDaysCritical,
        readIds: readNotifIds,
      }),
    [space, currentUser, db, ledger, fuelTanks, readNotifIds]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const displayedNotifs = useMemo(
    () => (alertsOnlyUnread ? notifications.filter((n) => !n.read) : notifications),
    [notifications, alertsOnlyUnread]
  );

  const handleOpenNotification = (n: AppNotification) => {
    const next = new Set(readNotifIds);
    next.add(n.id);
    persistReadNotifs(next);
    setAlertsOpen(false);
    navigateTo({
      door: n.routeDoor,
      subTab: notificationSubTab(n),
    });
  };

  const handleMarkAllRead = () => {
    const next = new Set(readNotifIds);
    notifications.forEach((n) => next.add(n.id));
    persistReadNotifs(next);
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setPwdErr('');
    if (nextPwd.length < 8 || !/[a-zA-Z\u0600-\u06FF]/.test(nextPwd) || !/[0-9]/.test(nextPwd)) {
      setPwdErr('كلمة المرور الجديدة يجب أن تكون 8 خانات فأكثر وتجمع بين الحروف والأرقام');
      return;
    }
    if (nextPwd.toLowerCase() === currentUser.username.toLowerCase()) {
      setPwdErr('لا يجوز أن تطابق كلمة المرور اسم المستخدم');
      return;
    }
    if (nextPwd !== confirmPwd) {
      setPwdErr('كلمتا المرور غير متطابقتين');
      return;
    }
    const ok = await verifyPassword(curPwd, currentUser.saltHex, currentUser.hashHex, currentUser.iterations);
    if (!ok) {
      setPwdErr('كلمة المرور الحالية غير صحيحة');
      return;
    }
    const hashed = await pbkdf2Hash(nextPwd, undefined, 10000);
    mutateDb((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === currentUser.id
          ? {
              ...u,
              saltHex: hashed.saltHex,
              hashHex: hashed.hashHex,
              iterations: hashed.iterations,
              pwdLastChangedAt: new Date().toISOString(),
            }
          : u
      ),
    }));
    logAudit({
      action: 'user.password_change',
      entityType: 'users',
      summary: `غيّر المستخدم ${currentUser.username} كلمة مروره بنفسه`,
      risk: 'sensitive',
    });
    setCurPwd('');
    setNextPwd('');
    setConfirmPwd('');
    setPwdModalOpen(false);
    notify('تم تحديث كلمة المرور بنجاح', 'success');
  };

  const quickActions = useMemo(
    () =>
      space === 'fuel'
        ? [
            { label: 'صرف محروقات لآلية', door: 'fuelMoves', subTab: 'issue' },
            { label: 'توريد خزان وقود', door: 'fuelMoves', subTab: 'supply' },
            { label: 'تحويل بين المحطات', door: 'fuelMoves', subTab: 'transfer' },
            { label: 'تفريدة مخصصات دورية', door: 'fuelAllocations' },
            { label: 'جرد قياس المسطرة', door: 'fuelStocktake' },
          ]
        : [
            { label: 'سند استلام وتوريد جديد', door: 'supplyMoves', subTab: 'receive' },
            { label: 'سند صرف للوحدات / المطابخ', door: 'supplyMoves', subTab: 'issue' },
            { label: 'تحويل بين المستودعات', door: 'supplyMoves', subTab: 'transfer' },
            { label: 'إنشاء طلبية إعاشة', door: 'supplyOrders', subTab: 'orders' },
            { label: 'تسجيل التفريدة اليومية', door: 'supplyDaily', subTab: 'strength' },
            { label: 'تحرير برقية جديدة', door: 'cables' },
          ],
    [space]
  );

  const renderDoorContent = () => {
    if (space === 'fuel') {
      switch (activeDoor) {
        case 'fuelMoves':
          return <FuelMovesScreen />;
        case 'fuelAllocations':
          return <FuelAllocationsScreen />;
        case 'fuelStocktake':
          return <FuelStocktakeScreen />;
        case 'fuelReports':
          return <FuelReportsScreen />;
        case 'fuelData':
          return <FuelDataScreen />;
        case 'fuelSettings':
          return <FuelSettingsScreen />;
        default:
          return <FuelDashboardScreen />;
      }
    }

    switch (activeDoor) {
      case 'supplyMoves':
        return <SupplyMovesHub />;
      case 'supplyOrders':
        return <SupplyOrdersHub />;
      case 'documents':
        return <DocumentsScreen />;
      case 'supplyDaily':
        return <DailyHub />;
      case 'stocktake':
        return <StocktakeScreen />;
      case 'campAccounts':
        return <CampAccountsHub />;
      case 'supplyReports':
        return <ReportsHub />;
      case 'supplyData':
        return <BasicDataHub />;
      case 'cables':
        return <CablesScreen />;
      case 'archive':
        return <ElectronicArchiveScreen />;
      case 'personnel':
        return <PersonnelStrengthScreen />;
      case 'linkages':
        return <LinkagesScreen />;
      case 'supplyAudit':
        return <AuditHub />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return <DashboardScreen />;
    }
  };

  const activeDoorDef = visibleDoors.find((d) => d.id === activeDoor);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[var(--imd-bg)] text-[var(--imd-text)]">
      {/* Android Top AppBar (56px, min 44px touch targets) */}
      <header
        style={{ height: `${platformMetrics.topbarHeightPx}px` }}
        className="no-print shrink-0 border-b border-[var(--imd-line)] bg-[var(--imd-surface)] px-2.5 flex items-center justify-between gap-1.5 z-30"
      >
        {/* Right Zone: Navigation Drawer Trigger + Active Door Title */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-[var(--imd-text2)] hover:text-[var(--imd-accent)] active:bg-[var(--imd-hover)] cursor-pointer"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
            aria-label="قائمة الأبواب"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-[var(--imd-text)] truncate">
              {activeDoorDef?.label ?? (space === 'fuel' ? 'نظام المحروقات' : 'الإمداد والتموين')}
            </div>
            <div className="text-[10px] text-[var(--imd-muted)] truncate">
              {space === 'fuel' ? 'مساحة المحروقات الميدانية' : 'مساحة الإمداد والتموين'}
            </div>
          </div>
        </div>

        {/* Center/Left Touch Action Bar */}
        <div className="flex items-center gap-1 shrink-0 relative" onClick={(e) => e.stopPropagation()}>
          {/* Space Switcher on Android Tablet (> 700px) */}
          {canSupply && canFuel && (
            <div className="hidden md:flex items-center p-0.5 border border-[var(--imd-line)] bg-[var(--imd-subtle)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
              <button
                type="button"
                onClick={() => setActiveSpace('supply')}
                className={`px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  space === 'supply'
                    ? 'bg-[var(--imd-surface)] text-[var(--imd-accent)] font-bold'
                    : 'text-[var(--imd-muted)] hover:text-[var(--imd-text)]'
                }`}
                style={{ borderRadius: '4px' }}
              >
                الإمداد
              </button>
              <button
                type="button"
                onClick={() => setActiveSpace('fuel')}
                className={`px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  space === 'fuel'
                    ? 'bg-[var(--imd-surface)] text-[var(--imd-accent)] font-bold'
                    : 'text-[var(--imd-muted)] hover:text-[var(--imd-text)]'
                }`}
                style={{ borderRadius: '4px' }}
              >
                المحروقات
              </button>
            </div>
          )}

          {/* Global Search Trigger */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="min-w-[40px] min-h-[40px] px-2.5 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] text-[var(--imd-text2)] hover:text-[var(--imd-accent)] hover:border-[var(--imd-accent)] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
            aria-label="بحث شامل"
            title="بحث شامل في الأصناف والسندات والآليات"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline font-medium">بحث</span>
          </button>

          {/* Quick Actions Touch Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setAlertsOpen(false);
                setQuickOpen((v) => !v);
              }}
              className="min-h-[40px] px-2.5 text-xs font-bold border border-[var(--imd-accent)] bg-[var(--imd-accent)] text-[var(--imd-on-accent)] inline-flex items-center gap-1 cursor-pointer active:brightness-95"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
              aria-label="إجراء سريع"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">سند سريع</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {quickOpen && (
              <div
                className="absolute left-0 top-11 w-60 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] py-1.5 z-50 shadow-xl"
                style={{ borderRadius: 'var(--imd-radius)' }}
              >
                <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--imd-muted)] border-b border-[var(--imd-line)]">
                  تنفيذ عملية ميدانية فورية
                </div>
                {quickActions.map((qa, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setQuickOpen(false);
                      navigateTo({ door: qa.door, subTab: qa.subTab });
                    }}
                    className="w-full text-right px-3 min-h-[44px] flex items-center text-xs font-medium text-[var(--imd-text)] hover:bg-[var(--imd-hover)] hover:text-[var(--imd-accent)] transition-colors cursor-pointer"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <PWAInstallButton compact />

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={() =>
              updateConfig({ themeMode: db.config.themeMode === 'light' ? 'dark' : 'light' })
            }
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-[var(--imd-muted)] hover:text-[var(--imd-text)] cursor-pointer"
            title="تبديل السمة الفاتحة/الداكنة"
          >
            {db.config.themeMode === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {/* Live Notifications Bell */}
          <button
            type="button"
            onClick={() => {
              setQuickOpen(false);
              setAlertsOpen((v) => !v);
            }}
            className="relative min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-[var(--imd-muted)] hover:text-[var(--imd-text)] cursor-pointer"
            title="التنبيهات والتذكيرات الحية"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 left-1 text-[9px] font-bold px-1 bg-[var(--imd-danger)] text-white rounded-sm tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          {alertsOpen && (
            <div
              className="absolute left-0 top-11 w-80 sm:w-96 max-w-[92vw] border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] p-3 z-50 space-y-2.5 shadow-xl"
              style={{ borderRadius: 'var(--imd-radius)' }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--imd-line)] pb-2">
                <span className="text-xs font-bold">
                  التنبيهات ({unreadCount} غير مقروء / {notifications.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAlertsOnlyUnread((v) => !v)}
                    className="text-[11px] font-medium text-[var(--imd-muted)] hover:text-[var(--imd-text)] cursor-pointer"
                  >
                    {alertsOnlyUnread ? 'عرض الكل' : 'غير المقروء فقط'}
                  </button>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--imd-accent)] hover:underline cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>تعليم الكل</span>
                    </button>
                  )}
                </div>
              </div>
              {displayedNotifs.length === 0 ? (
                <div className="text-xs text-[var(--imd-muted)] py-4 text-center">
                  لا توجد تنبيهات مطابقة في هذه المساحة حالياً
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                  {displayedNotifs.map((n) => {
                    const sevLabel = n.severity === 'danger' ? 'عاجل' : n.severity === 'warning' ? 'تحذير' : 'معلومة';
                    const sevColor =
                      n.severity === 'danger'
                        ? 'var(--imd-danger)'
                        : n.severity === 'warning'
                        ? 'var(--imd-warn)'
                        : 'var(--imd-info)';
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => handleOpenNotification(n)}
                          className={`w-full text-right p-2.5 border transition-colors cursor-pointer ${
                            n.read
                              ? 'border-[var(--imd-line)] bg-[var(--imd-bg)] opacity-75'
                              : 'border-[var(--imd-line-strong)] bg-[var(--imd-panel-fill)] hover:bg-[var(--imd-hover)] hover:border-[var(--imd-accent)]'
                          }`}
                          style={{ borderRadius: 'var(--imd-radius-sm)' }}
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] mb-0.5">
                            <span className="inline-flex items-center gap-1 font-bold" style={{ color: sevColor }}>
                              {n.severity === 'info' ? (
                                <Info className="w-3 h-3 shrink-0" />
                              ) : (
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                              )}
                              <span>{sevLabel}</span>
                            </span>
                            {!n.read && (
                              <span className="text-[10px] font-bold text-[var(--imd-accent)]">جديد</span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-[var(--imd-text)]">{n.title}</div>
                          <div className="text-[11px] text-[var(--imd-muted)] mt-0.5 leading-relaxed">
                            {n.body}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Lock Session */}
          <button
            type="button"
            onClick={lockSession}
            className="min-w-[38px] min-h-[40px] inline-flex items-center justify-center text-[var(--imd-muted)] hover:text-[var(--imd-text)] cursor-pointer"
            title="قفل الشاشة"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Android Touch Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Android Slide-Over Touch Navigation Drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div
              style={{ backgroundColor: 'var(--imd-side)' }}
              className="w-[84%] max-w-xs h-full flex flex-col border-l border-[var(--imd-side-border)] shadow-2xl"
            >
              {/* Drawer Header: Organization Identity + Space Switcher */}
              <div
                className="px-4 py-3.5 border-b space-y-3"
                style={{ borderColor: 'var(--imd-side-line)', color: 'var(--imd-side-text)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={db.config.logoDataUrl || '/logo-official.png'}
                      alt={db.config.orgName}
                      className="w-9 h-9 object-contain shrink-0 bg-white/95 p-0.5"
                      style={{ borderRadius: 'var(--imd-radius-sm)' }}
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{db.config.orgName}</div>
                      <div className="text-[11px] opacity-75 truncate">
                        {currentUser?.name} · {currentUser?.role}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="min-w-[38px] min-h-[38px] inline-flex items-center justify-center border border-white/20 rounded text-white/90 hover:bg-white/10 cursor-pointer"
                    aria-label="إغلاق القائمة"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {canSupply && canFuel && (
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSpace('supply');
                        setMobileDrawerOpen(false);
                      }}
                      className={`min-h-[40px] text-xs font-bold rounded cursor-pointer transition-colors ${
                        space === 'supply'
                          ? 'bg-white text-[#0B3D3A]'
                          : 'bg-white/10 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      الإمداد والتموين
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSpace('fuel');
                        setMobileDrawerOpen(false);
                      }}
                      className={`min-h-[40px] text-xs font-bold rounded cursor-pointer transition-colors ${
                        space === 'fuel'
                          ? 'bg-white text-[#3B1D0E]'
                          : 'bg-white/10 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      المحروقات
                    </button>
                  </div>
                )}
              </div>

              {/* Drawer Doors List (48px touch rows) */}
              <nav className="flex-1 overflow-y-auto py-2.5 px-2.5 space-y-3">
                {groupedDoors.map(([groupName, doors]) => (
                  <div key={groupName} className="space-y-1">
                    <div
                      className="px-2.5 pb-1 text-[10px] font-bold tracking-wide opacity-65"
                      style={{ color: 'var(--imd-side-muted)' }}
                    >
                      {groupName}
                    </div>
                    {doors.map((d) => {
                      const Icon = d.icon;
                      const active = d.id === activeDoor;
                      const badge = doorBadges[d.id] ?? 0;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setActiveDoor(d.id);
                            setMobileDrawerOpen(false);
                          }}
                          style={{
                            backgroundColor: active ? 'var(--imd-side-active)' : 'transparent',
                            color: active ? 'var(--imd-side-text)' : 'var(--imd-side-muted)',
                            borderRadius: 'var(--imd-radius-sm)',
                          }}
                          className="w-full min-h-[46px] flex items-center justify-between gap-2 px-3 text-[13px] font-medium transition-colors cursor-pointer hover:bg-[var(--imd-side-hover)] hover:text-[var(--imd-side-text)]"
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="truncate">{d.label}</span>
                          </span>
                          {badge > 0 && (
                            <span
                              className="text-[11px] font-bold tabular-nums shrink-0"
                              style={{ color: active ? 'var(--imd-side-text)' : '#FBBF24' }}
                            >
                              {fmt(badge, 0)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>

              {/* Drawer Footer: User Password, Space Selector & Logout */}
              <div
                className="p-3 border-t space-y-2 text-xs"
                style={{ borderColor: 'var(--imd-side-line)', color: 'var(--imd-side-muted)' }}
              >
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      setCurPwd('');
                      setNextPwd('');
                      setConfirmPwd('');
                      setPwdErr('');
                      setPwdModalOpen(true);
                    }}
                    className="min-h-[40px] px-2.5 rounded bg-white/10 hover:bg-white/15 text-white flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>كلمة المرور</span>
                  </button>
                  {canSupply && canFuel ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileDrawerOpen(false);
                        setActiveSpace(null);
                      }}
                      className="min-h-[40px] px-2.5 rounded bg-white/10 hover:bg-white/15 text-white flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>المساحات</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileDrawerOpen(false);
                        logout();
                      }}
                      className="min-h-[40px] px-2.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-200 flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>خروج</span>
                    </button>
                  )}
                </div>
                {canSupply && canFuel && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      logout();
                    }}
                    className="w-full min-h-[40px] px-2.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-200 flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>تسجيل الخروج من الجلسة</span>
                  </button>
                )}
                <div className="pt-1 flex items-center justify-between text-[10px] opacity-75 font-mono-num">
                  <span>SQLCipher AES-256 v31</span>
                  <span>{db.config.deviceId}</span>
                </div>
              </div>
            </div>
            <div className="flex-1 bg-black/50" onClick={() => setMobileDrawerOpen(false)} />
          </div>
        )}

        {/* Active Door Viewport */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 pb-6">
          <div className="max-w-[1440px] mx-auto">{renderDoorContent()}</div>
        </main>
      </div>

      {/* Android APK Bottom Navigation Bar (58px, 4 Primary Doors + 5th All-Doors Drawer Tab) */}
      <nav className="no-print shrink-0 h-[58px] imd-safe-bottom border-t border-[var(--imd-line-strong)] bg-[var(--imd-surface)] grid grid-cols-5 z-30">
        {visibleDoors.slice(0, 4).map((d) => {
          const Icon = d.icon;
          const active = d.id === activeDoor;
          const badge = doorBadges[d.id] ?? 0;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setActiveDoor(d.id)}
              className="relative flex flex-col items-center justify-center gap-0.5 text-[10px] sm:text-[11px] font-semibold cursor-pointer active:bg-[var(--imd-hover)] transition-colors"
              style={{ color: active ? 'var(--imd-accent)' : 'var(--imd-muted)' }}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[72px] sm:max-w-[120px]">{d.label}</span>
              {badge > 0 && (
                <span className="absolute top-1 left-3 text-[9px] font-bold px-1 bg-[var(--imd-danger)] text-white rounded-sm tabular-nums">
                  {fmt(badge, 0)}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 text-[10px] sm:text-[11px] font-semibold text-[var(--imd-muted)] hover:text-[var(--imd-accent)] active:bg-[var(--imd-hover)] cursor-pointer"
        >
          <Menu className="w-4 h-4" />
          <span>كل الأبواب ({visibleDoors.length})</span>
        </button>
      </nav>

      {/* Modals & Hosts */}
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <PrintModalHost />
      <IdleLockModal />
      <OfflineIndicator />

      <ImdModal
        open={pwdModalOpen}
        onClose={() => setPwdModalOpen(false)}
        title="تغيير كلمة المرور"
        widthClass="max-w-md"
      >
        <form onSubmit={handleChangeOwnPassword} className="space-y-3">
          {pwdErr && <ImdNote tone="danger">{pwdErr}</ImdNote>}
          <ImdFld
            label="كلمة المرور الحالية"
            type="password"
            value={curPwd}
            onChange={setCurPwd}
            autoFocus
          />
          <ImdFld
            label="كلمة المرور الجديدة"
            type="password"
            value={nextPwd}
            onChange={setNextPwd}
            placeholder="8 خانات فأكثر (حروف + أرقام)"
          />
          <ImdFld
            label="تأكيد كلمة المرور الجديدة"
            type="password"
            value={confirmPwd}
            onChange={setConfirmPwd}
          />
          <div className="flex justify-end gap-2 pt-2">
            <ImdButton variant="secondary" onClick={() => setPwdModalOpen(false)}>
              إغلاق
            </ImdButton>
            <ImdButton type="submit" variant="primary">
              حفظ كلمة المرور
            </ImdButton>
          </div>
        </form>
      </ImdModal>
    </div>
  );
};

