package com.imdad.erp.ui

import androidx.lifecycle.ViewModel
import com.imdad.erp.core.security.SecurityEngine
import com.imdad.erp.data.db.AdjustmentEntity
import com.imdad.erp.data.db.ArchiveDocumentEntity
import com.imdad.erp.data.db.AuditLogEntity
import com.imdad.erp.data.db.CableEntity
import com.imdad.erp.data.db.CampLedgerEntity
import com.imdad.erp.data.db.DailyStrengthEntity
import com.imdad.erp.data.db.FuelAllocationEntity
import com.imdad.erp.data.db.FuelIssueEntity
import com.imdad.erp.data.db.FuelMaintenanceEntity
import com.imdad.erp.data.db.FuelStationEntity
import com.imdad.erp.data.db.FuelSupplyEntity
import com.imdad.erp.data.db.FuelTankReadingEntity
import com.imdad.erp.data.db.IssueEntity
import com.imdad.erp.data.db.ItemEntity
import com.imdad.erp.data.db.OpeningBalanceEntity
import com.imdad.erp.data.db.PersonnelLinkEntity
import com.imdad.erp.data.db.RationOrderEntity
import com.imdad.erp.data.db.ReceiptEntity
import com.imdad.erp.data.db.ReturnEntity
import com.imdad.erp.data.db.StocktakeEntity
import com.imdad.erp.data.db.TransferEntity
import com.imdad.erp.data.db.UserEntity
import com.imdad.erp.domain.FuelTankBalance
import com.imdad.erp.domain.StockBalanceRow
import com.imdad.erp.domain.StockLedgerEngine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.UUID

enum class AppSpaceKind { Supply, Fuel }

data class ImdadUiState(
    val currentUser: UserEntity? = null,
    val isLocked: Boolean = false,
    val activeSpace: AppSpaceKind? = AppSpaceKind.Supply,
    val activeDoorId: String = "dashboard",
    val isDarkTheme: Boolean = false,
    val distinctFuelTheme: Boolean = true,
    val classicFlat: Boolean = false,
    val highDensity: Boolean = false,
    val useArabicDigits: Boolean = true,
    val deviceId: String = "AND-APK-31F9A0",
    val toastMessage: String? = null,
    val users: List<UserEntity> = emptyList(),
    val items: List<ItemEntity> = emptyList(),
    val openings: List<OpeningBalanceEntity> = emptyList(),
    val receipts: List<ReceiptEntity> = emptyList(),
    val issues: List<IssueEntity> = emptyList(),
    val transfers: List<TransferEntity> = emptyList(),
    val returns: List<ReturnEntity> = emptyList(),
    val adjustments: List<AdjustmentEntity> = emptyList(),
    val rationOrders: List<RationOrderEntity> = emptyList(),
    val stocktakes: List<StocktakeEntity> = emptyList(),
    val dailyStrengths: List<DailyStrengthEntity> = emptyList(),
    val campLedgers: List<CampLedgerEntity> = emptyList(),
    val cables: List<CableEntity> = emptyList(),
    val archiveDocs: List<ArchiveDocumentEntity> = emptyList(),
    val personnelLinks: List<PersonnelLinkEntity> = emptyList(),
    val fuelStations: List<FuelStationEntity> = emptyList(),
    val fuelSupplies: List<FuelSupplyEntity> = emptyList(),
    val fuelIssues: List<FuelIssueEntity> = emptyList(),
    val fuelAllocations: List<FuelAllocationEntity> = emptyList(),
    val fuelTankReadings: List<FuelTankReadingEntity> = emptyList(),
    val fuelMaintenances: List<FuelMaintenanceEntity> = emptyList(),
    val auditLogs: List<AuditLogEntity> = emptyList(),
) {
    val stockLedger: List<StockBalanceRow>
        get() = StockLedgerEngine.computeStockLedger(
            items = items,
            openings = openings,
            receipts = receipts,
            issues = issues,
            transfers = transfers,
            returns = returns,
            adjustments = adjustments,
        )

    val fuelTanks: List<FuelTankBalance>
        get() = StockLedgerEngine.computeFuelTankBalances(
            stations = fuelStations,
            supplies = fuelSupplies,
            issues = fuelIssues,
        )
}

class ImdadViewModel : ViewModel() {
    private val _state = MutableStateFlow(createSeededState())
    val state: StateFlow<ImdadUiState> = _state.asStateFlow()

    fun login(username: String, passwordPlain: String): Boolean {
        val current = _state.value
        val user = current.users.find { it.username.equals(username.trim(), ignoreCase = true) && it.active }
            ?: return false

        val verified = SecurityEngine.verifyPasswordConstantTime(
            password = passwordPlain,
            saltHex = user.saltHex,
            expectedHashHex = user.hashHex,
            iterations = user.iterations,
        )
        if (!verified) return false

        _state.update {
            it.copy(
                currentUser = user,
                isLocked = false,
                activeSpace = AppSpaceKind.Supply,
                activeDoorId = "dashboard",
                toastMessage = "مرحباً بك ${user.name} في نظام الإمداد (Android APK)",
            )
        }
        appendAudit("auth.login", "users", "تسجيل دخول ناجح للمستخدم ${user.username}", "normal")
        return true
    }

    fun logout() {
        appendAudit("auth.logout", "users", "تسجيل خروج من الجلسة", "normal")
        _state.update { it.copy(currentUser = null, isLocked = false) }
    }

    fun lockSession() {
        _state.update { it.copy(isLocked = true) }
    }

    fun unlockWithBiometrics() {
        _state.update {
            it.copy(
                isLocked = false,
                toastMessage = "تم فك قفل الجلسة بالبصمة الحيوية (Android BiometricPrompt)",
            )
        }
    }

    fun setSpace(space: AppSpaceKind?) {
        val defaultDoor = if (space == AppSpaceKind.Fuel) "fuelDashboard" else "dashboard"
        _state.update { it.copy(activeSpace = space, activeDoorId = defaultDoor) }
    }

    fun navigateToDoor(doorId: String) {
        _state.update { it.copy(activeDoorId = doorId) }
    }

    fun toggleDarkTheme() {
        _state.update { it.copy(isDarkTheme = !it.isDarkTheme) }
    }

    fun toggleClassicFlat() {
        _state.update { it.copy(classicFlat = !it.classicFlat) }
    }

    fun toggleHighDensity() {
        _state.update { it.copy(highDensity = !it.highDensity) }
    }

    fun toggleArabicDigits() {
        _state.update { it.copy(useArabicDigits = !it.useArabicDigits) }
    }

    fun dismissToast() {
        _state.update { it.copy(toastMessage = null) }
    }

    fun postSupplyReceipt(
        warehouse: String,
        itemId: String,
        supplier: String,
        qty: Double,
        unitCost: Double,
        batchNo: String,
        expiryDate: String?,
    ) {
        if (qty <= 0.0) {
            _state.update { it.copy(toastMessage = "الكمية يجب أن تكون أكبر من الصفر") }
            return
        }
        val refNo = "RCV-${1000 + _state.value.receipts.size + 1}"
        val rec = ReceiptEntity(
            id = UUID.randomUUID().toString(),
            refNo = refNo,
            date = LocalDate.now().toString(),
            warehouse = warehouse,
            itemId = itemId,
            supplier = supplier.ifBlank { "مورد معتمد" },
            qty = qty,
            unitCost = unitCost,
            batchNo = batchNo.ifBlank { "B-${LocalDate.now().year}" },
            expiryDate = expiryDate,
            status = "POSTED",
        )
        _state.update {
            it.copy(
                receipts = listOf(rec) + it.receipts,
                toastMessage = "تم ترحيل سند التوريد $refNo بنجاح",
            )
        }
        appendAudit("supply.receipt.post", "receipts", "ترحيل سند استلام $refNo بكمية $qty", "normal")
    }

    fun postSupplyIssue(
        warehouse: String,
        itemId: String,
        beneficiaryUnit: String,
        qty: Double,
        purpose: String,
    ) {
        if (qty <= 0.0) {
            _state.update { it.copy(toastMessage = "الكمية يجب أن تكون أكبر من الصفر") }
            return
        }
        val row = _state.value.stockLedger.find { it.warehouse == warehouse && it.itemId == itemId }
        val available = row?.availableQty ?: 0.0
        if (available + 1e-6 < qty) {
            _state.update {
                it.copy(toastMessage = "حارس المخزون: الرصيد المتاح ($available) أقل من الكمية المطلوبة ($qty)")
            }
            return
        }
        val refNo = "ISS-${2000 + _state.value.issues.size + 1}"
        val iss = IssueEntity(
            id = UUID.randomUUID().toString(),
            refNo = refNo,
            date = LocalDate.now().toString(),
            warehouse = warehouse,
            itemId = itemId,
            beneficiaryUnit = beneficiaryUnit.ifBlank { "اللواء الأول" },
            qty = qty,
            batchNo = "FEFO-AUTO",
            purpose = purpose.ifBlank { "صرف إعاشة يومي" },
            status = "POSTED",
        )
        _state.update {
            it.copy(
                issues = listOf(iss) + it.issues,
                toastMessage = "تم ترحيل سند الصرف $refNo بنجاح",
            )
        }
        appendAudit("supply.issue.post", "issues", "ترحيل سند صرف $refNo للوحدة $beneficiaryUnit", "normal")
    }

    fun createRationOrder(unitName: String, warehouse: String, strengthCount: Int, daysCount: Int) {
        val refNo = "ORD-${3000 + _state.value.rationOrders.size + 1}"
        val ord = RationOrderEntity(
            id = UUID.randomUUID().toString(),
            refNo = refNo,
            date = LocalDate.now().toString(),
            beneficiaryUnit = unitName.ifBlank { "اللواء الأول مشاة" },
            valwarehouse = warehouse.ifBlank { "المستودع المركزي" },
            strengthCount = strengthCount,
            daysCount = daysCount,
            status = "APPROVED",
        )
        _state.update {
            it.copy(
                rationOrders = listOf(ord) + it.rationOrders,
                toastMessage = "تم اعتماد طلبية الإعاشة $refNo للقوة ($strengthCount فرد)",
            )
        }
        appendAudit("supply.order.create", "ration_orders", "اعتماد طلبية إعاشة $refNo للوحدة $unitName", "normal")
    }

    fun recordDailyStrength(unitName: String, officers: Int, ncos: Int, soldiers: Int, guests: Int) {
        val total = officers + ncos + soldiers + guests
        val row = DailyStrengthEntity(
            id = UUID.randomUUID().toString(),
            date = LocalDate.now().toString(),
            unitName = unitName.ifBlank { "اللواء الأول مشاة" },
            officers = officers,
            ncos = ncos,
            soldiers = soldiers,
            guests = guests,
            total = total,
        )
        _state.update {
            it.copy(
                dailyStrengths = listOf(row) + it.dailyStrengths,
                toastMessage = "تم تسجيل التفريدة اليومية للوحدة $unitName بإجمالي $total فرد",
            )
        }
        appendAudit("supply.strength.record", "daily_strengths", "تفريدة يومية للوحدة $unitName ($total فرد)", "normal")
    }

    fun createCable(direction: String, sender: String, recipient: String, subject: String, priority: String) {
        val cableNo = "CBL-${400 + _state.value.cables.size + 1}"
        val cbl = CableEntity(
            id = UUID.randomUUID().toString(),
            cableNo = cableNo,
            date = LocalDate.now().toString(),
            direction = direction,
            sender = sender,
            recipient = recipient,
            subject = subject,
            priority = priority,
            status = "new",
        )
        _state.update {
            it.copy(
                cables = listOf(cbl) + it.cables,
                toastMessage = "تم قيد البرقية الرسمية رقم $cableNo",
            )
        }
        appendAudit("supply.cable.create", "cables", "تسجيل برقية $cableNo: $subject", "sensitive")
    }

    fun postFuelIssue(
        stationId: String,
        unitName: String,
        vehiclePlate: String,
        driverName: String,
        odometerKm: Int,
        qtyLiters: Double,
    ) {
        val tank = _state.value.fuelTanks.find { it.stationId == stationId }
        if (tank == null || qtyLiters <= 0.0) return
        if (tank.pumpableLiters + 1e-6 < qtyLiters) {
            _state.update {
                it.copy(toastMessage = "الرصيد القابل للضخ (${tank.pumpableLiters} لتر) لا يكفي لصرف $qtyLiters لتر")
            }
            return
        }
        val refNo = "F-ISS-${5000 + _state.value.fuelIssues.size + 1}"
        val entry = FuelIssueEntity(
            id = UUID.randomUUID().toString(),
            refNo = refNo,
            date = LocalDate.now().toString(),
            stationId = stationId,
            fuelType = tank.fuelType,
            unitName = unitName.ifBlank { "كتيبة النقل" },
            vehiclePlate = vehiclePlate.ifBlank { "ع س 4812" },
            driverName = driverName.ifBlank { "سائق مناوب" },
            odometerKm = odometerKm,
            qtyLiters = qtyLiters,
            status = "POSTED",
        )
        _state.update {
            it.copy(
                fuelIssues = listOf(entry) + it.fuelIssues,
                toastMessage = "تم صرف $qtyLiters لتر بموجب السند $refNo",
            )
        }
        appendAudit("fuel.issue.post", "fuel_issues", "صرف وقود $refNo للآلية $vehiclePlate ($qtyLiters لتر)", "normal")
    }

    fun recordFuelDipReading(
        stationId: String,
        dipCm: Double,
        temperatureC: Double,
        waterLevelCm: Double,
        measuredBy: String,
        notes: String,
    ) {
        val st = _state.value.fuelStations.find { it.id == stationId } ?: return
        val volumeLiters = StockLedgerEngine.interpolateRulerDipLiters(
            dipCm = dipCm,
            calibrationTable = emptyList(),
            tankCapacityLiters = st.capacityLiters,
            maxDipCm = 240.0,
        )
        val reading = FuelTankReadingEntity(
            id = UUID.randomUUID().toString(),
            stationId = stationId,
            fuelType = st.fuelType,
            readingDate = LocalDate.now().toString(),
            dipCm = dipCm,
            volumeLiters = volumeLiters,
            temperatureC = temperatureC,
            waterLevelCm = waterLevelCm,
            measuredBy = measuredBy.ifBlank { _state.value.currentUser?.name ?: "فني القياس" },
            notes = notes,
        )
        _state.update {
            it.copy(
                fuelTankReadings = listOf(reading) + it.fuelTankReadings,
                toastMessage = "تم تسجيل قراءة المسطرة (${dipCm} سم = $volumeLiters لتر)",
            )
        }
        appendAudit("fuel.dip.record", "fuel_tank_readings", "قراءة مسطرة للخزان ${st.name}: $dipCm سم ($volumeLiters لتر)", "normal")
    }

    fun recordFuelMaintenance(
        stationId: String,
        maintenanceType: String,
        description: String,
        costAmount: Double,
        performedBy: String,
        nextDueDate: String,
    ) {
        val st = _state.value.fuelStations.find { it.id == stationId } ?: return
        val maint = FuelMaintenanceEntity(
            id = UUID.randomUUID().toString(),
            stationId = stationId,
            maintenanceDate = LocalDate.now().toString(),
            maintenanceType = maintenanceType,
            description = description,
            costAmount = costAmount,
            performedBy = performedBy.ifBlank { "فريق الصيانة الفنية" },
            nextDueDate = nextDueDate,
            status = "completed",
        )
        _state.update {
            it.copy(
                fuelMaintenances = listOf(maint) + it.fuelMaintenances,
                toastMessage = "تم توثيق عملية الصيانة الدورية للمحطة ${st.name}",
            )
        }
        appendAudit("fuel.maintenance.record", "fuel_maintenances", "صيانة دورية ($maintenanceType) للمحطة ${st.name}", "sensitive")
    }

    private fun appendAudit(action: String, entityType: String, summary: String, risk: String) {
        val cur = _state.value
        val prevHash = cur.auditLogs.firstOrNull()?.entryHash ?: "GENESIS_V31"
        val nowIso = LocalDateTime.now().toString()
        val userId = cur.currentUser?.id ?: "system"
        val username = cur.currentUser?.username ?: "system"
        val entryHash = SecurityEngine.sha256Hex("$prevHash|$nowIso|$userId|$action|$summary")

        val entry = AuditLogEntity(
            id = UUID.randomUUID().toString(),
            logDate = LocalDate.now().toString(),
            createdAt = nowIso,
            userId = userId,
            username = username,
            action = action,
            entityType = entityType,
            summary = summary,
            risk = risk,
            prevHash = prevHash,
            entryHash = entryHash,
        )
        _state.update { it.copy(auditLogs = listOf(entry) + it.auditLogs) }
    }

    companion object {
        private fun createSeededState(): ImdadUiState {
            val adminHash = SecurityEngine.hashPassword("Admin@123", "a1b2c3d4e5f60718293a4b5c6d7e8f90", 10_000)
            val ownerUser = UserEntity(
                id = "usr-owner-1",
                username = "admin",
                name = "العقيد/ منذر الهاشمي — مدير الإمداد",
                role = "owner",
                saltHex = adminHash.saltHex,
                hashHex = adminHash.hashHex,
                iterations = adminHash.iterations,
                warehouseScope = "ALL",
                active = true,
            )

            val items = listOf(
                ItemEntity("itm-1", "SUP-001", "6281000001015", "أرز بسمتي هندي درجة أولى (كيس 50 كجم)", "cat-food", "كيس", 50.0, 215.0, 120.0, true),
                ItemEntity("itm-2", "SUP-002", "6281000001022", "سكر أبيض ناعم مكرر (كيس 50 كجم)", "cat-food", "كيس", 50.0, 165.0, 80.0, false),
                ItemEntity("itm-3", "SUP-003", "6281000001039", "زيت طبخ نباتي عبوة 18 لتر", "cat-food", "عبوة", 18.0, 130.0, 100.0, true),
                ItemEntity("itm-4", "SUP-004", "6281000001046", "دقيق قمح فاخر للمخابز الميدانية (50 كجم)", "cat-food", "كيس", 50.0, 140.0, 150.0, true),
                ItemEntity("itm-5", "SUP-005", "6281000001053", "بدلة ميدانية مموهة كاملة", "cat-gear", "طقم", 1.0, 290.0, 200.0, false),
            )

            val openings = listOf(
                OpeningBalanceEntity("op-1", "المستودع المركزي", "itm-1", 420.0, 210.0, "2026-01-01"),
                OpeningBalanceEntity("op-2", "المستودع المركزي", "itm-2", 260.0, 160.0, "2026-01-01"),
                OpeningBalanceEntity("op-3", "المستودع المركزي", "itm-3", 310.0, 128.0, "2026-01-01"),
                OpeningBalanceEntity("op-4", "مستودع القطاع الشمالي", "itm-4", 190.0, 138.0, "2026-01-01"),
                OpeningBalanceEntity("op-5", "المستودع المركزي", "itm-5", 500.0, 285.0, "2026-01-01"),
            )

            val receipts = listOf(
                ReceiptEntity("rc-1", "RCV-1001", "2026-03-01", "المستودع المركزي", "itm-1", "شركة المطاحن والأغذية الوطنية", 180.0, 215.0, "B-2026-01", "2027-06-30", "POSTED"),
                ReceiptEntity("rc-2", "RCV-1002", "2026-03-04", "المستودع المركزي", "itm-3", "مؤسسة التموين الغذائي", 95.0, 130.0, "B-2026-02", "2027-04-15", "POSTED"),
            )

            val issues = listOf(
                IssueEntity("is-1", "ISS-2001", "2026-03-05", "المستودع المركزي", "itm-1", "اللواء الأول مشاة", 65.0, "B-2026-01", "مخصص الإعاشة الشهري", "POSTED"),
                IssueEntity("is-2", "ISS-2002", "2026-03-06", "المستودع المركزي", "itm-2", "معسكر التدريب المركزي", 40.0, "B-2025-12", "صرف إعاشة دورية", "POSTED"),
            )

            val rationOrders = listOf(
                RationOrderEntity("ro-1", "ORD-3001", "2026-03-07", "اللواء الأول مشاة", "المستودع المركزي", 1450, 15, "APPROVED"),
                RationOrderEntity("ro-2", "ORD-3002", "2026-03-08", "كتيبة الاستطلاع", "مستودع القطاع الشمالي", 480, 10, "PENDING"),
            )

            val stocktakes = listOf(
                StocktakeEntity("st-1", "STK-701", "2026-03-01", "المستودع المركزي", "المقدم/ خالد السالم", 48, 0, "POSTED"),
            )

            val dailyStrengths = listOf(
                DailyStrengthEntity("ds-1", "2026-03-08", "اللواء الأول مشاة", 85, 310, 1055, 18, 1468),
                DailyStrengthEntity("ds-2", "2026-03-08", "معسكر التدريب المركزي", 42, 160, 740, 12, 954),
            )

            val campLedgers = listOf(
                CampLedgerEntity("cl-1", "CMP-901", "2026-03-01", "معسكر التدريب المركزي", "مخصص الإعاشة النقدي والتمويني للشهر", 185_000.0, 142_300.0, "ACTIVE"),
            )

            val cables = listOf(
                CableEntity("cb-1", "CBL-401", "2026-03-07", "INCOMING", "هيئة الإمداد والتموين", "المستودع المركزي", "تعزيز مخزون الطوارئ للقطاع الشمالي", "عاجل", "processing"),
            )

            val archiveDocs = listOf(
                ArchiveDocumentEntity("ar-1", "ARC-2026-01", "2026-03-01", "محضر جرد المستودع المركزي الربع الأول", "محاضر جرد", "9f86d081884c7d659a2feaa0c55ad015", true),
            )

            val personnelLinks = listOf(
                PersonnelLinkEntity("pl-1", "MIL-88210", "نقيب", "عبدالرحمن القحطاني", "اللواء الأول مشاة", true, 12_500.0),
                PersonnelLinkEntity("pl-2", "MIL-90412", "رقيب أول", "فهد الدوسري", "كتيبة النقل الميداني", true, 4_200.0),
            )

            val stations = listOf(
                FuelStationEntity("st-1", "FUEL-ST-01", "محطة المحروقات المركزية - الخزان الرئيسي 1", "المعسكر الرئيسي", "diesel", 60_000.0, 42_000.0, 2_500.0, 10_000.0),
                FuelStationEntity("st-2", "FUEL-ST-02", "محطة القطاع الشمالي - خزان البنزين", "القطاع الشمالي", "petrol", 35_000.0, 21_500.0, 1_500.0, 6_000.0),
            )

            val fuelSupplies = listOf(
                FuelSupplyEntity("fs-1", "F-SUP-3001", "2026-03-02", "st-1", "diesel", "شركة النفط الوطنية", 12_000.0, 3.85, "ق ص 9921", "POSTED"),
            )

            val fuelIssues = listOf(
                FuelIssueEntity("fi-1", "F-ISS-5001", "2026-03-06", "st-1", "diesel", "كتيبة النقل الميداني", "ع س 4108", "رقيب/ سالم الحربي", 84_320, 450.0, "POSTED"),
            )

            val fuelAllocations = listOf(
                FuelAllocationEntity("fa-1", "2026-03", "كتيبة النقل الميداني", "diesel", 25_000.0, 14_200.0, "ACTIVE"),
                FuelAllocationEntity("fa-2", "2026-03", "اللواء الأول مشاة", "petrol", 15_000.0, 8_450.0, "ACTIVE"),
            )

            val readings = listOf(
                FuelTankReadingEntity("fr-1", "st-1", "diesel", "2026-03-07", 214.0, 53_500.0, 26.5, 0.2, "ملازم/ طارق الزهراني", "مطابق للرصيد الدفتري"),
            )

            val maintenances = listOf(
                FuelMaintenanceEntity("fm-1", "st-1", "2026-02-20", "calibration", "معايرة مسطرة القياس وفحص فلاتر الضخ", 1_450.0, "الفريق الهندسي للمحروقات", "2026-08-20", "completed"),
            )

            return ImdadUiState(
                currentUser = ownerUser,
                users = listOf(ownerUser),
                items = items,
                openings = openings,
                receipts = receipts,
                issues = issues,
                rationOrders = rationOrders,
                stocktakes = stocktakes,
                dailyStrengths = dailyStrengths,
                campLedgers = campLedgers,
                cables = cables,
                archiveDocs = archiveDocs,
                personnelLinks = personnelLinks,
                fuelStations = stations,
                fuelSupplies = fuelSupplies,
                fuelIssues = fuelIssues,
                fuelAllocations = fuelAllocations,
                fuelTankReadings = readings,
                fuelMaintenances = maintenances,
            )
        }
    }
}
