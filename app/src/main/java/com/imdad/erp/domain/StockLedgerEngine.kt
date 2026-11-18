package com.imdad.erp.domain

import com.imdad.erp.data.db.AdjustmentEntity
import com.imdad.erp.data.db.FuelIssueEntity
import com.imdad.erp.data.db.FuelStationEntity
import com.imdad.erp.data.db.FuelSupplyEntity
import com.imdad.erp.data.db.IssueEntity
import com.imdad.erp.data.db.ItemEntity
import com.imdad.erp.data.db.OpeningBalanceEntity
import com.imdad.erp.data.db.ReceiptEntity
import com.imdad.erp.data.db.ReturnEntity
import com.imdad.erp.data.db.TransferEntity
import com.imdad.erp.data.db.UserEntity
import kotlin.math.max
import kotlin.math.roundToLong

data class StockBalanceRow(
    val warehouse: String,
    val itemId: String,
    val itemCode: String,
    val itemName: String,
    val unit: String,
    val openingQty: Double,
    val receivedQty: Double,
    val issuedQty: Double,
    val transferInQty: Double,
    val transferOutQty: Double,
    val returnInQty: Double,
    val returnOutQty: Double,
    val adjustQty: Double,
    val availableQty: Double,
    val weightedUnitCost: Double,
    val totalValue: Double,
    val isBelowMin: Boolean,
)

data class FuelTankBalance(
    val stationId: String,
    val stationCode: String,
    val stationName: String,
    val fuelType: String,
    val capacityLiters: Double,
    val openingLiters: Double,
    val suppliedLiters: Double,
    val issuedLiters: Double,
    val currentLiters: Double,
    val pumpableLiters: Double,
    val fillPercent: Double,
    val isLowStock: Boolean,
)

data class DipCalibrationPoint(
    val dipCm: Double,
    val volumeLiters: Double,
)

/**
 * Pure Kotlin Domain Engine for Supply Stock Ledger, Weighted Average Cost,
 * Fuel Tank Balances, Linear Ruler Dip Interpolation, and Fail-Closed RBAC.
 */
object StockLedgerEngine {

    private fun round3(v: Double): Double = (v * 1000.0).roundToLong() / 1000.0

    /**
     * Fail-Closed Role-Based Access Control (RBAC) Matrix
     */
    private val rolePerms: Map<String, Set<String>> = mapOf(
        "owner" to setOf("*"),
        "admin" to setOf("*"),
        "manager" to setOf(
            "space.supply", "space.fuel",
            "supply.dashboard", "supply.moves.read", "supply.moves.write",
            "supply.orders", "supply.documents", "supply.stocktake",
            "supply.daily", "supply.campAccounts", "supply.reports",
            "supply.data", "supply.cables", "supply.archive",
            "supply.personnel", "supply.linkages", "supply.audit",
            "fuel.dashboard", "fuel.moves", "fuel.allocations",
            "fuel.stocktake", "fuel.reports", "fuel.data",
        ),
        "warehouseKeeper" to setOf(
            "space.supply",
            "supply.dashboard", "supply.moves.read", "supply.moves.write",
            "supply.orders", "supply.documents", "supply.stocktake", "supply.reports",
        ),
        "fuelOfficer" to setOf(
            "space.fuel",
            "fuel.dashboard", "fuel.moves", "fuel.allocations",
            "fuel.stocktake", "fuel.reports", "fuel.data", "fuel.settings",
        ),
        "auditor" to setOf(
            "space.supply", "space.fuel",
            "supply.dashboard", "supply.moves.read", "supply.documents",
            "supply.reports", "supply.audit", "fuel.dashboard", "fuel.reports",
        ),
    )

    fun hasPerm(user: UserEntity?, perm: String): Boolean {
        if (user == null || !user.active) return false
        val perms = rolePerms[user.role] ?: return false
        return "*" in perms || perm in perms
    }

    /**
     * Computes exact stock ledger per (Warehouse, Item) with Weighted Average Cost.
     */
    fun computeStockLedger(
        items: List<ItemEntity>,
        openings: List<OpeningBalanceEntity>,
        receipts: List<ReceiptEntity>,
        issues: List<IssueEntity>,
        transfers: List<TransferEntity>,
        returns: List<ReturnEntity>,
        adjustments: List<AdjustmentEntity>,
    ): List<StockBalanceRow> {
        val itemMap = items.associateBy { it.id }
        val keys = linkedSetOf<Pair<String, String>>()

        openings.forEach { keys.add(it.warehouse to it.itemId) }
        receipts.forEach { keys.add(it.warehouse to it.itemId) }
        issues.forEach { keys.add(it.warehouse to it.itemId) }
        transfers.forEach {
            keys.add(it.warehouse to it.itemId)
            keys.add(it.destWarehouse to it.itemId)
        }
        returns.forEach { keys.add(it.warehouse to it.itemId) }
        adjustments.forEach { keys.add(it.warehouse to it.itemId) }

        return keys.mapNotNull { (wh, itemId) ->
            val item = itemMap[itemId] ?: return@mapNotNull null

            val openRows = openings.filter { it.warehouse == wh && it.itemId == itemId }
            val recRows = receipts.filter { it.warehouse == wh && it.itemId == itemId && it.status == "POSTED" }
            val issRows = issues.filter { it.warehouse == wh && it.itemId == itemId && it.status == "POSTED" }
            val trOutRows = transfers.filter { it.warehouse == wh && it.itemId == itemId && it.status != "CANCELLED" }
            val trInRows = transfers.filter { it.destWarehouse == wh && it.itemId == itemId && (it.status == "RECEIVED" || it.status == "DISCREPANCY") }
            val retInRows = returns.filter { it.warehouse == wh && it.itemId == itemId && it.kind == "FROM_UNIT" && it.status == "POSTED" }
            val retOutRows = returns.filter { it.warehouse == wh && it.itemId == itemId && it.kind == "TO_SUPPLIER" && it.status == "POSTED" }
            val adjRows = adjustments.filter { it.warehouse == wh && it.itemId == itemId && it.status == "POSTED" }

            val openingQty = round3(openRows.sumOf { it.qty })
            val receivedQty = round3(recRows.sumOf { it.qty })
            val issuedQty = round3(issRows.sumOf { it.qty })
            val transferOutQty = round3(trOutRows.sumOf { it.sentQty })
            val transferInQty = round3(trInRows.sumOf { it.receivedQty })
            val returnInQty = round3(retInRows.sumOf { it.qty })
            val returnOutQty = round3(retOutRows.sumOf { it.qty })
            val adjustQty = round3(adjRows.sumOf { it.diffQty })

            val availableQty = round3(
                openingQty + receivedQty + transferInQty + returnInQty + adjustQty -
                    issuedQty - transferOutQty - returnOutQty
            )

            val totalInCostQty = openingQty + receivedQty
            val totalInCostValue =
                openRows.sumOf { it.qty * it.unitCost } + recRows.sumOf { it.qty * it.unitCost }
            val weightedUnitCost = if (totalInCostQty > 0.0) {
                round3(totalInCostValue / totalInCostQty)
            } else {
                item.unitPrice
            }

            StockBalanceRow(
                warehouse = wh,
                itemId = item.id,
                itemCode = item.code,
                itemName = item.name,
                unit = item.unit,
                openingQty = openingQty,
                receivedQty = receivedQty,
                issuedQty = issuedQty,
                transferInQty = transferInQty,
                transferOutQty = transferOutQty,
                returnInQty = returnInQty,
                returnOutQty = returnOutQty,
                adjustQty = adjustQty,
                availableQty = availableQty,
                weightedUnitCost = weightedUnitCost,
                totalValue = round3(max(0.0, availableQty) * weightedUnitCost),
                isBelowMin = availableQty <= item.minStock,
            )
        }
    }

    /**
     * Computes live Fuel Tank Balances per station including dead-stock deduction.
     */
    fun computeFuelTankBalances(
        stations: List<FuelStationEntity>,
        supplies: List<FuelSupplyEntity>,
        issues: List<FuelIssueEntity>,
    ): List<FuelTankBalance> {
        return stations.map { st ->
            val sup = round3(
                supplies
                    .filter { it.stationId == st.id && it.status == "POSTED" }
                    .sumOf { it.qtyLiters }
            )
            val iss = round3(
                issues
                    .filter { it.stationId == st.id && it.status == "POSTED" }
                    .sumOf { it.qtyLiters }
            )
            val current = round3(st.openingLiters + sup - iss)
            val pumpable = round3(max(0.0, current - st.deadStockLiters))
            val fillPct = if (st.capacityLiters > 0.0) {
                ((current / st.capacityLiters) * 100.0).coerceIn(0.0, 100.0)
            } else 0.0

            FuelTankBalance(
                stationId = st.id,
                stationCode = st.code,
                stationName = st.name,
                fuelType = st.fuelType,
                capacityLiters = st.capacityLiters,
                openingLiters = st.openingLiters,
                suppliedLiters = sup,
                issuedLiters = iss,
                currentLiters = current,
                pumpableLiters = pumpable,
                fillPercent = round3(fillPct),
                isLowStock = current <= st.minAlertLiters,
            )
        }
    }

    /**
     * Linear interpolation of tank volume (Liters) from physical ruler dip reading (cm).
     */
    fun interpolateRulerDipLiters(
        dipCm: Double,
        calibrationTable: List<DipCalibrationPoint>,
        tankCapacityLiters: Double = 50_000.0,
        maxDipCm: Double = 250.0,
    ): Double {
        if (dipCm <= 0.0) return 0.0
        if (calibrationTable.isEmpty()) {
            return round3(((dipCm / maxDipCm).coerceIn(0.0, 1.0)) * tankCapacityLiters)
        }
        val sorted = calibrationTable.sortedBy { it.dipCm }
        if (dipCm <= sorted.first().dipCm) return round3(sorted.first().volumeLiters)
        if (dipCm >= sorted.last().dipCm) return round3(sorted.last().volumeLiters)

        for (i in 0 until sorted.size - 1) {
            val a = sorted[i]
            val b = sorted[i + 1]
            if (dipCm in a.dipCm..b.dipCm) {
                val span = b.dipCm - a.dipCm
                if (span <= 0.0) return round3(a.volumeLiters)
                val ratio = (dipCm - a.dipCm) / span
                return round3(a.volumeLiters + ratio * (b.volumeLiters - a.volumeLiters))
            }
        }
        return 0.0
    }
}
