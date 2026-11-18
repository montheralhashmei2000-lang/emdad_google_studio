// Pure TypeScript Domain Types mirroring the 59-table Emdad System ERP Schema (kSchemaVersion = 31)

export type AppSpace = 'supply' | 'fuel';
export type UserRole = 'owner' | 'admin' | 'user';
export type RiskLevel = 'normal' | 'sensitive' | 'high' | 'critical';
export type MovementStatus =
  | 'DRAFT'
  | 'ORDER'
  | 'COMPLETED'
  | 'PENDING'
  | 'RECEIVED'
  | 'REJECTED'
  | 'CANCELLED';

export type CylReceiveAction = 'RECEIVE_FULL' | 'RECEIVE_EMPTY' | 'REFILL';
export type CylIssueAction = 'EXCHANGE' | 'ISSUE_FULL' | 'ISSUE_EMPTY' | 'CONSUME';
export type CylTransferAction = 'TRANSFER_FULL' | 'TRANSFER_EMPTY';
export type CylReturnAction = 'RETURN_FULL' | 'RETURN_EMPTY';

export interface ItemUnit {
  name: string;
  factor: number;
  isBase: boolean;
}

export interface EditLogEntry {
  at: string;
  by: string;
  summary: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  roles: string[];
  permissions: string[];
  warehouseScope: 'ALL' | string[];
  saltHex: string;
  hashHex: string;
  iterations: number;
  active: boolean;
  approved: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  sectionBlocked: string[];
  ownerSig: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  baseUnit: string;
  units: ItemUnit[];
  qty: number;
  minQty: number;
  barcode: string;
  isRefillable: boolean;
  reportUnit: string;
  isAsset: boolean;
  assetType: string;
  lifespanMonths: number;
  unitValue: number;
  createdAt: string;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  manager: string;
  location: string;
  feedsAllCamps: boolean;
  fuelCapacityLiters: number;
  isMain: boolean;
  campIds: string[];
  notes: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  contact: string;
  city: string;
  notes: string;
}

export interface BeneficiaryUnit {
  id: string;
  code: string;
  name: string;
  type: 'camp' | 'unit';
  parentId: string;
  parentName: string;
  isCamp: boolean;
  facilityId: string;
  facilityIds: string[];
  category: string;
}

export interface Facility {
  id: string;
  name: string;
  fType: 'kitchen' | 'bakery';
  capacity: number;
  warehouse: string;
  notes: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  summary: string;
  details: Record<string, unknown>;
  risk: RiskLevel;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  logDate: string;
  refNo: string;
  warehouse: string;
  target: string;
  status: string;
  itemCount: number;
  qty: number;
  createdAt: string;
}

export interface SensitiveReview {
  id: string;
  logId: string;
  reviewedBy: string;
  note: string;
  reviewedAt: string;
}

export interface AppSettingRow {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface MovementBase {
  id: string;
  refNo: string;
  date: string; // yyyy-MM-dd
  warehouse: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  factor: number;
  qty: number;
  baseQty: number;
  status: MovementStatus;
  notes: string;
  createdBy: string;
  createdAt: string;
  editCount: number;
  editLog: EditLogEntry[];
  editedBy: string;
  cancelReason: string;
  cancelledBy: string;
  prevStatus: string;
}

export interface Receipt extends MovementBase {
  supplier: string;
  invoiceNo: string;
  entryNo?: string;
  committee: string;
  supervision: string;
  audit: string;
  expiryDate: string;
  cylinderAction: CylReceiveAction | '';
}

export interface Issue extends MovementBase {
  targetType: 0 | 1 | 2 | 3; // 0 unit, 1 facility, 2 custom, 3 multi
  recipientDisplay: string;
  unitId: string;
  facilityId: string;
  beneficiaryUnitId: string;
  beneficiaryUnitName: string;
  soldierCount: number;
  officerCount: number;
  durationDays: number;
  approvedBy: string;
  rejectReason: string;
  rejectedBy: string;
  cylinderAction: CylIssueAction | '';
  receiverName: string;
}

export interface Transfer extends MovementBase {
  destWarehouse: string;
  campId: string;
  campName: string;
  strength: number;
  durationDays: number;
  rejectReason: string;
  cylinderAction: CylTransferAction | '';
}

export interface ReturnRecord extends MovementBase {
  party: string;
  beneficiaryUnitId: string;
  beneficiaryUnitName: string;
  type: 'FROM_UNIT' | 'TO_SUPPLIER';
  condition: 'صالحة' | 'تالفة';
  origRef: string;
  cylinderAction: CylReturnAction | '';
}

export interface OpeningBalance {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  warehouse: string;
  qty: number;
  date: string;
  setBy: string;
  breakdown: {
    units?: Record<string, number>;
    full?: number;
    empty?: number;
  };
  createdAt: string;
}

export interface DestructionCommitteeMember {
  name: string;
  rank: string;
  role: string;
}

export interface Destruction {
  id: string;
  refNo: string;
  date: string;
  warehouse: string;
  reason: string;
  method: string;
  place: string;
  committee: DestructionCommitteeMember[];
  orderRef: string;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  notes: string;
  approvedBy: string;
  cancelReason: string;
  createdBy: string;
  createdAt: string;
}

export interface Adjustment extends MovementBase {
  sessionId: string;
  reason: string;
  approvedBy: string;
}

export interface Stocktake {
  id: string;
  orderNo: string;
  type: 'FULL' | 'PARTIAL' | 'SURPRISE' | 'CYCLE' | 'CATEGORY';
  date: string;
  warehouse: string;
  categoryId: string;
  categoryName: string;
  committee: string;
  freeze: boolean;
  status: 'COUNTING' | 'POSTED' | 'CANCELLED';
  itemsCount: number;
  countedCount: number;
  varianceCount: number;
  adjustedCount: number;
  notes: string;
  closedDate: string;
  closedBy: string;
  cancelReason: string;
  cancelledBy: string;
  createdBy: string;
  createdAt: string;
}

export interface StocktakeLine {
  id: string;
  sessionId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  systemQty: number;
  countedQty: number | null;
  counts: Record<string, number>;
  variance: number | null;
  reason: string;
  decision: 'ADJUST' | 'IGNORE';
  status: string;
  discovered: boolean;
}

export type AssetStatus = 'NEW' | 'GOOD' | 'NEEDS_MAINTENANCE' | 'DAMAGED' | 'RETIRED';

export interface Asset {
  id: string;
  name: string;
  quantity: number;
  assetType: string;
  serialNumber: string;
  facilityId: string;
  facilityName: string;
  beneficiaryUnitId: string;
  beneficiaryUnitName: string;
  warehouse: string;
  status: AssetStatus;
  acquisitionDate: string;
  value: number;
  lifespanMonths: number;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  itemId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetAssignment {
  id: string;
  assetId: string;
  assetName: string;
  beneficiaryUnitId: string;
  beneficiaryUnitName: string;
  facilityId: string;
  facilityName: string;
  assignedDate: string;
  returnedDate: string;
  assignedTo: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface StrengthRecord {
  id: string;
  unitId: string;
  unitName: string;
  campId: string;
  campName: string;
  strengthDate: string;
  soldierCount: number;
  officerCount: number;
  total: number;
  pct: number;
  mode: 'camp' | 'detail';
  createdBy: string;
  createdAt: string;
}

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'SUHOOR' | 'IFTAR';

export interface KitchenLog {
  id: string;
  facilityId: string;
  facilityName: string;
  date: string;
  mealType: MealType;
  strength: number;
  itemId: string;
  itemName: string;
  unitName: string;
  qty: number;
  baseQty: number;
  expectedBase: number;
  varianceBase: number;
  notes: string;
  createdAt: string;
}

export interface Entitlement {
  itemId: string; // PK (or grp:<id>)
  itemName: string;
  qtyPerPerson: number; // 30-day monthly entitlement
  measureUnitName: string;
  measureFactor: number;
  notes: string;
  isCritical: boolean;
  substituteItemId: string;
  substituteItemName: string;
  substituteRatio: number;
  updatedAt: string;
}

export type GroupDistMode = 'byStock' | 'shares' | 'priority';

export interface EntitlementGroupMember {
  itemId: string;
  itemName: string;
  perBase: number;
  sharePct: number;
  priority: number;
}

export interface EntitlementGroup {
  id: string; // without grp: prefix; referenced as grp:<id>
  name: string;
  unitName: string;
  distMode: GroupDistMode;
  members: EntitlementGroupMember[];
  notes: string;
}

export interface MealPlan {
  id: string;
  name: string;
  planType: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM';
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  facilityId: string;
  facilityName: string;
  warehouse: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanEntry {
  id: string;
  planId: string;
  entryDate: string;
  mealType: MealType;
  itemId: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  factor: number;
  qtyPerPerson: number;
  isCritical: boolean;
  substituteItemId: string;
  substituteItemName: string;
  substituteUnitName: string;
  substituteFactor: number;
  substituteQtyPerPerson: number;
  stdKey: string;
  notes: string;
}

export interface MealHeadcount {
  id: string;
  facilityId: string;
  facilityName: string;
  date: string;
  mealType: MealType;
  headcount: number;
  notes: string;
  createdBy: string;
  updatedAt: string;
}

export interface MealDispatch {
  id: string;
  issueRef: string;
  planId: string;
  planName: string;
  facilityId: string;
  facilityName: string;
  warehouse: string;
  date: string;
  mealType: MealType;
  headcount: number;
  wastePct: number;
  wholePacks: boolean;
  decision: 'pass' | 'soft' | 'hard';
  reason: string;
  warnings: string[];
  overrideBy: string;
  overrideToken: string;
  createdBy: string;
  createdAt: string;
}

export interface MealDispatchLine {
  id: string;
  dispatchId: string;
  itemId: string;
  itemName: string;
  unitName: string;
  requiredBase: number;
  issuedBase: number;
  carryIn: number;
  carryOut: number;
  kind: 'full' | 'substitute' | 'partial' | 'carried';
  isCritical: boolean;
  substituteForId: string;
  substituteForName: string;
  note: string;
}

export interface SupplyAuthority {
  id: string;
  name: string;
  title: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

export interface RationOrder {
  id: string;
  refNo: string;
  requestingWarehouse: string;
  supplyingWarehouse: string;
  date: string;
  requiredDate: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'RECEIVED' | 'REJECTED';
  priority: 'عادي' | 'عاجل' | 'فوري';
  orderKind: 'MAIN' | 'BRANCH';
  authorityId: string;
  authorityName: string;
  receiptRef: string;
  fulfillRef: string;
  fulfillKind: string;
  fulfillDate: string;
  notes: string;
  rejectReason: string;
  createdBy: string;
  approvedBy: string;
  receivedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RationOrderLine {
  id: string;
  orderId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  factor: number;
  requestedQty: number;
  approvedQty: number;
  receivedQty: number;
  notes: string;
}

export interface CampLedger {
  id: string;
  campId: string;
  campName: string;
  itemId: string;
  itemName: string;
  unitName: string;
  year: number;
  month: number;
  openingEntitled: number;
  openingStock: number;
  entitlementTotal: number;
  transferredIn: number;
  issuedDirect: number;
  returnedQty: number;
  consumedKitchen: number;
  strengthSum: number;
  strengthDays: number;
  status: 'OPEN' | 'CLOSED';
  closedBy: string;
  closedAt: string;
  updatedAt: string;
}

export interface WarehouseStockLimit {
  id: string;
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  itemName: string;
  unitName: string;
  factor: number;
  minStock: number;
  maxStock: number;
  notes: string;
  updatedAt: string;
}

export interface CampStockLimit {
  id: string;
  campId: string;
  campName: string;
  itemId: string;
  itemName: string;
  minStock: number;
  maxStock: number;
  alertDaysBefore: number;
  updatedAt: string;
}

export interface MonthlySettlement {
  id: string;
  year: number;
  month: number;
  scopeKey: string;
  scopeLabel: string;
  settledBy: string;
  notes: string;
  campsCount: number;
  itemsCount: number;
  totalCredit: number;
  totalDebit: number;
  settledAt: string;
}

// Fuel Section Tables
export type FuelType = 'petrol' | 'diesel';
export type FuelPeriodType = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface FuelWarehouse {
  id: string;
  code: string;
  name: string;
  manager: string;
  location: string;
  capacityLiters: number;
  active: boolean;
  notes: string;
  createdAt: string;
}

export interface FuelUnit {
  id: string;
  code: string;
  name: string;
  commander: string;
  phone: string;
  active: boolean;
  notes: string;
  createdAt: string;
}

export interface FuelSettingsRow {
  id: string;
  lowStockPercent: number;
  defaultDailyLiters: number;
  defaultWeeklyLiters: number;
  defaultMonthlyLiters: number;
  parentOrg: string;
  agencyTitle: string;
  commandTitle: string;
  branchTitle: string;
  orgName: string;
  sealLines: string;
  roleOfficer: string;
  roleSupply: string;
  roleChief: string;
  signOfficer: string;
  signSupply: string;
  signChief: string;
  requireChassis: boolean;
  allowExceptional: boolean;
  carryCapPeriods: number;
  notes: string;
  updatedAt: string;
}

export interface FuelAllocation {
  id: string;
  refNo: string;
  unitId: string;
  unitName: string;
  fuelType: FuelType;
  periodType: FuelPeriodType;
  quantityPerPeriod: number;
  totalQuantity: number;
  weeklyLiters: number;
  monthlyLiters: number;
  issueLocation: string;
  startDate: string;
  endDate: string;
  active: boolean;
  disbursable: boolean;
  writtenOffLiters: number;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FuelIssue {
  id: string;
  refNo: string;
  date: string;
  fuelType: FuelType;
  warehouse: string;
  source: 'allocation' | 'exceptional';
  quantityLiters: number;
  driverName: string;
  vehicleType: string;
  chassisNo: string;
  allocationId: string;
  beneficiaryUnitId: string;
  beneficiaryName: string;
  entitledLiters: number;
  periodType: FuelPeriodType;
  customFrom: string;
  customTo: string;
  justification: string;
  orderAuthority: string;
  purpose: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface FuelSupply {
  id: string;
  refNo: string;
  date: string;
  fuelType: FuelType;
  quantityLiters: number;
  supplierName: string;
  warehouse: string;
  transportVehicleType: string;
  driverName: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface FuelOpening {
  id: string;
  warehouse: string;
  fuelType: FuelType;
  liters: number;
  asOfDate: string;
  note: string;
  createdAt: string;
}

export interface FuelTransfer {
  id: string;
  refNo: string;
  date: string;
  fuelType: FuelType;
  quantityLiters: number;
  fromWarehouse: string;
  toWarehouse: string;
  driverName: string;
  transportVehicleType: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface FuelStocktake {
  id: string;
  refNo: string;
  date: string;
  warehouse: string;
  kind: 'full' | 'partial';
  fuelFilter: 'all' | FuelType;
  committee: string;
  status: 'open' | 'counting' | 'analysis' | 'posted';
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FuelStocktakeLine {
  id: string;
  stocktakeId: string;
  fuelType: FuelType;
  bookLiters: number;
  counted: boolean;
  countedLiters: number;
}

export interface FuelTankReading {
  id: string;
  warehouseId: string;
  warehouse: string;
  fuelType: FuelType;
  readingDate: string;
  dipstickCm: number;
  measuredLiters: number;
  bookLiters: number;
  varianceLiters: number;
  temperatureC: number;
  readerName: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface FuelMaintenance {
  id: string;
  refNo: string;
  warehouseId: string;
  warehouse: string;
  fuelType: FuelType | 'all';
  maintDate: string;
  maintType: 'tank_cleaning' | 'pump_calibration' | 'filter_replacement' | 'leak_inspection' | 'valve_repair';
  status: 'scheduled' | 'in_progress' | 'completed';
  costSar: number;
  technicianName: string;
  summary: string;
  nextDueDate: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FuelAuditLog {
  id: string;
  action: string;
  warehouse: string;
  fuelType: FuelType | 'all';
  refNo: string;
  liters: number;
  summary: string;
  actorName: string;
  createdAt: string;
}

// Linkages, Cables, Archive Tables
export type PersonStatus =
  | 'present'
  | 'leave'
  | 'mission'
  | 'sick'
  | 'absent'
  | 'transferred'
  | 'retired';

export interface LinkPerson {
  id: string;
  fullName: string;
  militaryNo: string;
  rank: string;
  phone: string;
  phone2: string;
  photoPath: string;
  subUnit: string;
  camp: string;
  section: string;
  job: string;
  status: PersonStatus;
  statusFrom: string;
  statusTo: string;
  statusDays: number;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkStatusLog {
  id: string;
  personId: string;
  personName: string;
  status: PersonStatus;
  fromDate: string;
  toDate: string;
  days: number;
  returnAction: string;
  notes: string;
  actor: string;
  createdAt: string;
}

export interface LinkTerm {
  id: string; // `${kind}:${name}`
  kind: 'section' | 'job' | 'subunit' | 'holder';
  name: string;
}

export interface LinkFinCustody {
  id: string;
  custodyNo: string;
  holder: string;
  title: string;
  serialNo: string;
  qty: number;
  unit: string;
  valueAmount: number;
  custodyDate: string;
  dueDate: string;
  kind: 'received' | 'delivered';
  amount: number;
  currency: 'sar' | 'yer';
  exchangeRate: number;
  giverName: string;
  receiverName: string;
  status: 'open' | 'cleared' | 'canceled';
  outcome: 'matched' | 'surplus' | 'deficit';
  outcomeAmount: number;
  sourceDocNo: string;
  costCenter: string;
  attachmentsJson: string[];
  cleared: boolean;
  clearedDate: string;
  clearanceNotes: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkClearance {
  id: string;
  clearanceNo: string;
  kind: 'custody' | 'contract' | 'other';
  refId: string;
  refTitle: string;
  partyName: string;
  amount: number;
  clearanceDate: string;
  custodyNo: string;
  currency: 'sar' | 'yer';
  grantedAmount: number;
  spentAmount: number;
  diffType: 'matched' | 'surplus' | 'deficit';
  surplusAmount: number;
  deficitAmount: number;
  counterpartyName: string;
  workflow: 'draft' | 'sent' | 'approved';
  docNo: string;
  clearerName: string;
  reviewDate: string;
  adminNotes: string;
  attachName: string;
  attachPath: string;
  attachSha256: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface LinkPurchaseContract {
  id: string;
  contractNo: string;
  title: string;
  supplier: string;
  currency: 'sar' | 'yer';
  exchangeRate: number;
  listDate: string;
  custodyId: string;
  invoiceNo: string;
  itemsJson: Array<{ name: string; qty: number; unit: string; price: number }>;
  amount: number;
  endDate: string;
  status: 'active' | 'completed' | 'canceled';
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkCustodySheet {
  id: string;
  sheetNo: string;
  title: string;
  custodyId: string;
  currency: 'sar' | 'yer';
  holderName: string;
  defaultRate: number;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkCustodySheetRow {
  id: string;
  sheetId: string;
  seq: number;
  date: string;
  grantSar: number;
  grantYer: number;
  returnSar: number;
  returnYer: number;
  spentSar: number;
  spentYer: number;
  rate: number;
  person: string;
  statement: string;
  category: string;
  entryNo: string;
  invoiceNo: string;
  shop: string;
  notes: string;
}

export interface LinkArmament {
  id: string;
  personId: string;
  personName: string;
  personMilitaryNo: string;
  weaponType: string;
  serialNo: string;
  qty: number;
  magazines: number;
  magazineType: string;
  ammoQty: number;
  assignedDate: string;
  returned: boolean;
  returnedDate: string;
  condition: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkMoneyReceipt {
  id: string;
  receiverName: string;
  capacity: string;
  amount: number;
  currency: 'sar' | 'yer';
  receiptDate: string;
  purpose: string;
  method: 'cash' | 'transfer';
  transferNo: string;
  delivererName: string;
  attachments: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkFinanceLedger {
  id: string;
  partyName: string;
  custodyId: string;
  clearanceId: string;
  entryKind: 'received' | 'delivered' | 'surplus' | 'deficit' | 'reversal';
  delta: number;
  currency: 'sar' | 'yer';
  entryDate: string;
  note: string;
  receiptId: string;
  createdBy: string;
  createdAt: string;
}

export interface Cable {
  id: string;
  direction: 'in' | 'out';
  cableNo: string;
  cableDate: string;
  subject: string;
  body: string;
  fromParty: string;
  toParty: string;
  branch: string | null;
  classification: 'normal' | 'secret' | 'top';
  priority: 'normal' | 'urgent' | 'immediate';
  status: 'new' | 'processing' | 'replied' | 'archived';
  cableTime: string;
  ccParty: string;
  recipientsJson: string[];
  editorName: string;
  editorRank: string;
  editorJob: string;
  signerText: string;
  serialNo: string;
  sendMethod: string;
  sendDateTime: string;
  specialist: string;
  receiverName: string;
  receiveTime: string;
  replyToNo: string;
  attachName: string;
  attachPath: string;
  attachSize: number;
  attachSha256: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveFile {
  id: string;
  space: AppSpace;
  title: string;
  category: string;
  tags: string[];
  docRef: string;
  warehouse: string;
  docDate: string;
  fileName: string;
  storedPath: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  source: 'manual' | 'auto';
  opType: string;
  notes: string;
  pinned: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocCounter {
  prefix: string;
  seq: number;
}

export interface SyncConflict {
  id: string;
  table: string;
  recordId: string;
  localSnapshot: unknown;
  peerSnapshot: unknown;
  peerName: string;
  detectedAt: string;
  resolved: boolean;
}

export type PrintPaperSize =
  | 'A4_P'
  | 'A4_L'
  | 'A5'
  | 'THERMAL_58'
  | 'THERMAL_80'
  | 'THERMAL_112';

export type VoucherCopyType =
  | 'default'
  | 'issue_order'
  | 'issue_receipt'
  | 'issue_recipient'
  | 'transfer_source'
  | 'transfer_dest'
  | 'transfer_driver';

export interface SignerPositionEntry {
  id: string;
  roleKey: string;
  roleLabel: string;
  warehouse: string; // '*' for all or exact warehouse name
  personName: string;
  rank: string;
}

export interface PrintFormConfig {
  id: string;
  name: string;
  rightLines: string[];
  leftFields: Array<{ label: string; key: string }>;
  tableAlign: 'right' | 'center';
  fontSize: number;
  fontFamily: string;
  showAuthBox: boolean;
  showQr: boolean;
  footerRoles: [string, string, string];
  footerNames: [string, string, string];
  showLogo: boolean;
}

export interface SystemConfig {
  orgName: string;
  orgSubTitle: string;
  orgCity: string;
  orgPhone: string;
  logoDataUrl: string;
  themeMode: 'light' | 'dark';
  classicFlat: boolean;
  distinctFuelTheme: boolean;
  highDensity: boolean;
  fontFamily: 'IBMPlexSansArabic' | 'Tajawal' | 'Cairo' | 'NotoSansArabic';
  numerals: 'western' | 'arabic';
  currencyPrimary: 'SAR' | 'YER';
  idleLockMinutes: number;
  autoArchiveOnPrint: boolean;
  supplyDaysMin: number;
  supplyDaysCritical: number;
  ruleHardLockThresholdPct: number;
  ruleSoftWarningThresholdPct: number;
  officialStandard: 'detailed32' | 'compact27';
  paperSize?: PrintPaperSize;
  signerPositions?: SignerPositionEntry[];
  deviceId: string;
  activationToken: string;
  schemaVersion?: number;
  printForms: Record<string, PrintFormConfig>;
}
