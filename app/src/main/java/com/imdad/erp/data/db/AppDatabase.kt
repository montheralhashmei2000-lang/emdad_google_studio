package com.imdad.erp.data.db

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.sqlite.db.SupportSQLiteDatabase
import com.imdad.erp.core.security.SecurityEngine
import kotlinx.coroutines.flow.Flow
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

const val K_SCHEMA_VERSION = 31

// ============================================================================
// 1. Supply & Fuel Entities (Schema v31)
// ============================================================================

@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    val username: String,
    val name: String,
    val role: String, // owner, admin, manager, warehouseKeeper, accountant, auditor, fuelOfficer, viewer
    @ColumnInfo(name = "salt_hex") val saltHex: String,
    @ColumnInfo(name = "hash_hex") val hashHex: String,
    val iterations: Int,
    @ColumnInfo(name = "warehouse_scope") val warehouseScope: String, // ALL or CSV
    val active: Boolean = true,
)

@Entity(tableName = "items")
data class ItemEntity(
    @PrimaryKey val id: String,
    val code: String,
    val barcode: String,
    val name: String,
    @ColumnInfo(name = "category_id") val categoryId: String,
    val unit: String,
    @ColumnInfo(name = "pack_size") val packSize: Double = 1.0,
    @ColumnInfo(name = "unit_price") val unitPrice: Double = 0.0,
    @ColumnInfo(name = "min_stock") val minStock: Double = 0.0,
    val perishable: Boolean = false,
)

@Entity(tableName = "opening_balances")
data class OpeningBalanceEntity(
    @PrimaryKey val id: String,
    val warehouse: String,
    @ColumnInfo(name = "item_id") val itemId: String,
    val qty: Double,
    @ColumnInfo(name = "unit_cost") val unitCost: Double,
    val date: String,
)

@Entity(tableName = "receipts")
data class ReceiptEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    val warehouse: String,
    @ColumnInfo(name = "item_id") val itemId: String,
    val supplier: String,
    val qty: Double,
    @ColumnInfo(name = "unit_cost") val unitCost: Double,
    @ColumnInfo(name = "batch_no") val batchNo: String,
    @ColumnInfo(name = "expiry_date") val expiryDate: String?,
    val status: String, // POSTED, DRAFT, CANCELLED
)

@Entity(tableName = "issues")
data class IssueEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    val warehouse: String,
    @ColumnInfo(name = "item_id") val itemId: String,
    @ColumnInfo(name = "beneficiary_unit") val beneficiaryUnit: String,
    val qty: Double,
    @ColumnInfo(name = "batch_no") val batchNo: String,
    val purpose: String,
    val status: String, // POSTED, PENDING, CANCELLED
)

@Entity(tableName = "transfers")
data class TransferEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    val warehouse: String,
    @ColumnInfo(name = "dest_warehouse") val destWarehouse: String,
    @ColumnInfo(name = "item_id") val itemId: String,
    @ColumnInfo(name = "sent_qty") val sentQty: Double,
    @ColumnInfo(name = "received_qty") val receivedQty: Double,
    val driver: String,
    val vehicle: String,
    val status: String, // PENDING, RECEIVED, DISCREPANCY, CANCELLED
)

@Entity(tableName = "returns")
data class ReturnEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    val warehouse: String,
    @ColumnInfo(name = "item_id") val itemId: String,
    val party: String,
    val qty: Double,
    val kind: String, // FROM_UNIT, TO_SUPPLIER
    val reason: String,
    val status: String,
)

@Entity(tableName = "adjustments")
data class AdjustmentEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    val warehouse: String,
    @ColumnInfo(name = "item_id") val itemId: String,
    @ColumnInfo(name = "diff_qty") val diffQty: Double,
    val reason: String,
    val status: String,
)

@Entity(tableName = "ration_orders")
data class RationOrderEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    @ColumnInfo(name = "beneficiary_unit") val beneficiaryUnit: String,
    valwarehouse: String,
    @ColumnInfo(name = "strength_count") val strengthCount: Int,
    @ColumnInfo(name = "days_count") val daysCount: Int,
    val status: String, // PENDING, APPROVED, ISSUED
)

@Entity(tableName = "stocktakes")
data class StocktakeEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    val warehouse: String,
    @ColumnInfo(name = "committee_head") val committeeHead: String,
    @ColumnInfo(name = "matched_items") val matchedItems: Int,
    @ColumnInfo(name = "variance_items") val varianceItems: Int,
    val status: String, // COUNTING, POSTED
)

@Entity(tableName = "daily_strengths")
data class DailyStrengthEntity(
    @PrimaryKey val id: String,
    val date: String,
    @ColumnInfo(name = "unit_name") val unitName: String,
    val officers: Int,
    val ncos: Int,
    val soldiers: Int,
    val guests: Int,
    val total: Int,
)

@Entity(tableName = "camp_ledgers")
data class CampLedgerEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    @ColumnInfo(name = "camp_name") val campName: String,
    val description: String,
    @ColumnInfo(name = "debit_amount") val debitAmount: Double,
    @ColumnInfo(name = "credit_amount") val creditAmount: Double,
    val status: String,
)

@Entity(tableName = "cables")
data class CableEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "cable_no") val cableNo: String,
    val date: String,
    val direction: String, // INCOMING, OUTGOING
    val sender: String,
    val recipient: String,
    val subject: String,
    val priority: String, // عادي, عاجل, سري للغاية
    val status: String, // new, processing, archived
)

@Entity(tableName = "archive_documents")
data class ArchiveDocumentEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "doc_no") val docNo: String,
    val date: String,
    val title: String,
    val category: String,
    @ColumnInfo(name = "sha256_hash") val sha256Hash: String,
    val encrypted: Boolean = true,
)

@Entity(tableName = "personnel_links")
data class PersonnelLinkEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "military_no") val militaryNo: String,
    val rank: String,
    val name: String,
    @ColumnInfo(name = "unit_name") val unitName: String,
    @ColumnInfo(name = "ration_active") val rationActive: Boolean,
    @ColumnInfo(name = "custody_amount") val custodyAmount: Double,
)

@Entity(tableName = "fuel_stations")
data class FuelStationEntity(
    @PrimaryKey val id: String,
    val code: String,
    val name: String,
    val location: String,
    @ColumnInfo(name = "fuel_type") val fuelType: String, // diesel, petrol, oil
    @ColumnInfo(name = "capacity_liters") val capacityLiters: Double,
    @ColumnInfo(name = "opening_liters") val openingLiters: Double,
    @ColumnInfo(name = "dead_stock_liters") val deadStockLiters: Double,
    @ColumnInfo(name = "min_alert_liters") val minAlertLiters: Double,
)

@Entity(tableName = "fuel_supplies")
data class FuelSupplyEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    @ColumnInfo(name = "station_id") val stationId: String,
    @ColumnInfo(name = "fuel_type") val fuelType: String,
    val supplier: String,
    @ColumnInfo(name = "qty_liters") val qtyLiters: Double,
    @ColumnInfo(name = "unit_price") val unitPrice: Double,
    @ColumnInfo(name = "tanker_plate") val tankerPlate: String,
    val status: String,
)

@Entity(tableName = "fuel_issues")
data class FuelIssueEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "ref_no") val refNo: String,
    val date: String,
    @ColumnInfo(name = "station_id") val stationId: String,
    @ColumnInfo(name = "fuel_type") val fuelType: String,
    @ColumnInfo(name = "unit_name") val unitName: String,
    @ColumnInfo(name = "vehicle_plate") val vehiclePlate: String,
    @ColumnInfo(name = "driver_name") val driverName: String,
    @ColumnInfo(name = "odometer_km") val odometerKm: Int,
    @ColumnInfo(name = "qty_liters") val qtyLiters: Double,
    val status: String,
)

@Entity(tableName = "fuel_allocations")
data class FuelAllocationEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "period_month") val periodMonth: String,
    @ColumnInfo(name = "unit_name") val unitName: String,
    @ColumnInfo(name = "fuel_type") val fuelType: String,
    @ColumnInfo(name = "quota_liters") val quotaLiters: Double,
    @ColumnInfo(name = "consumed_liters") val consumedLiters: Double,
    val status: String,
)

@Entity(tableName = "fuel_tank_readings")
data class FuelTankReadingEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "station_id") val stationId: String,
    @ColumnInfo(name = "fuel_type") val fuelType: String,
    @ColumnInfo(name = "reading_date") val readingDate: String,
    @ColumnInfo(name = "dip_cm") val dipCm: Double,
    @ColumnInfo(name = "volume_liters") val volumeLiters: Double,
    @ColumnInfo(name = "temperature_c") val temperatureC: Double,
    @ColumnInfo(name = "water_level_cm") val waterLevelCm: Double,
    @ColumnInfo(name = "measured_by") val measuredBy: String,
    val notes: String,
)

@Entity(tableName = "fuel_maintenances")
data class FuelMaintenanceEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "station_id") val stationId: String,
    @ColumnInfo(name = "maintenance_date") val maintenanceDate: String,
    @ColumnInfo(name = "maintenance_type") val maintenanceType: String, // cleaning, calibration, filter_replace, inspection
    val description: String,
    @ColumnInfo(name = "cost_amount") val costAmount: Double,
    @ColumnInfo(name = "performed_by") val performedBy: String,
    @ColumnInfo(name = "next_due_date") val nextDueDate: String,
    val status: String, // completed, scheduled, in_progress
)

@Entity(tableName = "audit_logs")
data class AuditLogEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "log_date") val logDate: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "user_id") val userId: String,
    val username: String,
    val action: String,
    @ColumnInfo(name = "entity_type") val entityType: String,
    val summary: String,
    val risk: String, // normal, sensitive, high, critical
    @ColumnInfo(name = "prev_hash") val prevHash: String,
    @ColumnInfo(name = "entry_hash") val entryHash: String,
)

// ============================================================================
// 2. Room Data Access Objects (@Dao)
// ============================================================================

@Dao
interface ImdadDao {
    @Query("SELECT * FROM users WHERE active = 1")
    fun observeUsers(): Flow<List<UserEntity>>

    @Query("SELECT * FROM items ORDER BY code ASC")
    fun observeItems(): Flow<List<ItemEntity>>

    @Query("SELECT * FROM receipts ORDER BY date DESC")
    fun observeReceipts(): Flow<List<ReceiptEntity>>

    @Query("SELECT * FROM issues ORDER BY date DESC")
    fun observeIssues(): Flow<List<IssueEntity>>

    @Query("SELECT * FROM transfers ORDER BY date DESC")
    fun observeTransfers(): Flow<List<TransferEntity>>

    @Query("SELECT * FROM fuel_stations ORDER BY code ASC")
    fun observeFuelStations(): Flow<List<FuelStationEntity>>

    @Query("SELECT * FROM fuel_supplies ORDER BY date DESC")
    fun observeFuelSupplies(): Flow<List<FuelSupplyEntity>>

    @Query("SELECT * FROM fuel_issues ORDER BY date DESC")
    fun observeFuelIssues(): Flow<List<FuelIssueEntity>>

    @Query("SELECT * FROM fuel_tank_readings ORDER BY reading_date DESC")
    fun observeFuelTankReadings(): Flow<List<FuelTankReadingEntity>>

    @Query("SELECT * FROM fuel_maintenances ORDER BY maintenance_date DESC")
    fun observeFuelMaintenances(): Flow<List<FuelMaintenanceEntity>>

    @Query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500")
    fun observeAuditLogs(): Flow<List<AuditLogEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReceipt(receipt: ReceiptEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertIssue(issue: IssueEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransfer(transfer: TransferEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFuelSupply(supply: FuelSupplyEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFuelIssue(issue: FuelIssueEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFuelTankReading(reading: FuelTankReadingEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFuelMaintenance(maintenance: FuelMaintenanceEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAuditLog(log: AuditLogEntity)

    @Query(
        """
        SELECT COALESCE(SUM(qty), 0.0) FROM opening_balances WHERE warehouse = :wh AND item_id = :itemId
        """
    )
    suspend fun sumOpening(wh: String, itemId: String): Double

    @Query(
        """
        SELECT COALESCE(SUM(qty), 0.0) FROM receipts WHERE warehouse = :wh AND item_id = :itemId AND status = 'POSTED'
        """
    )
    suspend fun sumReceipts(wh: String, itemId: String): Double

    @Query(
        """
        SELECT COALESCE(SUM(qty), 0.0) FROM issues WHERE warehouse = :wh AND item_id = :itemId AND status = 'POSTED'
        """
    )
    suspend fun sumIssues(wh: String, itemId: String): Double

    /**
     * Transactional Stock Guard: prevents negative inventory balance before posting an Issue voucher.
     */
    @Transaction
    suspend fun postIssueWithStockGuard(issue: IssueEntity, audit: AuditLogEntity) {
        require(issue.qty > 0.0) { "الكمية يجب أن تكون أكبر من الصفر" }
        val currentAvailable =
            sumOpening(issue.warehouse, issue.itemId) +
                sumReceipts(issue.warehouse, issue.itemId) -
                sumIssues(issue.warehouse, issue.itemId)
        require(currentAvailable + 1e-6 >= issue.qty) {
            "الرصيد المتاح في المستودع ($currentAvailable) لا يكفي لصرف الكمية المطلوبة (${issue.qty})"
        }
        insertIssue(issue)
        insertAuditLog(audit)
    }
}

// ============================================================================
// 3. Room + SQLCipher Database Singleton & Index Initializer (_createIndexes)
// ============================================================================

@Database(
    entities = [
        UserEntity::class,
        ItemEntity::class,
        OpeningBalanceEntity::class,
        ReceiptEntity::class,
        IssueEntity::class,
        TransferEntity::class,
        ReturnEntity::class,
        AdjustmentEntity::class,
        RationOrderEntity::class,
        StocktakeEntity::class,
        DailyStrengthEntity::class,
        CampLedgerEntity::class,
        CableEntity::class,
        ArchiveDocumentEntity::class,
        PersonnelLinkEntity::class,
        FuelStationEntity::class,
        FuelSupplyEntity::class,
        FuelIssueEntity::class,
        FuelAllocationEntity::class,
        FuelTankReadingEntity::class,
        FuelMaintenanceEntity::class,
        AuditLogEntity::class,
    ],
    version = K_SCHEMA_VERSION,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun imdadDao(): ImdadDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                System.loadLibrary("sqlcipher")
                val passphraseBytes = SecurityEngine.getOrCreateSqlCipherKey(context)
                val factory = SupportOpenHelperFactory(passphraseBytes)

                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "imdad_encrypted_v31.db"
                )
                    .openHelperFactory(factory)
                    .addCallback(object : Callback() {
                        override fun onOpen(db: SupportSQLiteDatabase) {
                            super.onOpen(db)
                            createIndexes(db)
                        }
                    })
                    .fallbackToDestructiveMigrationOnDowngrade()
                    .build()

                INSTANCE = instance
                instance
            }
        }

        /**
         * Creates all query-serving indexes with `IF NOT EXISTS` on every database open.
         */
        fun createIndexes(db: SupportSQLiteDatabase) {
            val movementTables = listOf("receipts", "issues", "transfers", "returns", "adjustments")
            movementTables.forEach { t ->
                db.execSQL("CREATE INDEX IF NOT EXISTS ix_${t}_ref ON $t (ref_no)")
                db.execSQL("CREATE INDEX IF NOT EXISTS ix_${t}_status ON $t (status)")
                db.execSQL("CREATE INDEX IF NOT EXISTS ix_${t}_wh_item ON $t (warehouse, item_id)")
                db.execSQL("CREATE INDEX IF NOT EXISTS ix_${t}_date ON $t (date)")
            }
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_opening_wh_item ON opening_balances (warehouse, item_id)")
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_transfers_dest ON transfers (dest_warehouse)")
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_items_code ON items (code)")
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_items_barcode ON items (barcode)")
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_items_category ON items (category_id)")
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_audit_date ON audit_logs (log_date)")
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs (created_at)")
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_fuel_readings_station_date ON fuel_tank_readings (station_id, reading_date)")
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_fuel_maint_station_date ON fuel_maintenances (station_id, maintenance_date)")
        }
    }
}
