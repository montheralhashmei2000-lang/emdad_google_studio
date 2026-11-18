package com.imdad.erp.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.imdad.erp.core.theme.ImdFormat
import com.imdad.erp.core.ui.ImdButton
import com.imdad.erp.core.ui.ImdButtonVariant
import com.imdad.erp.core.ui.ImdKpiCard
import com.imdad.erp.core.ui.ImdPanel
import com.imdad.erp.core.ui.ImdStatusText
import com.imdad.erp.core.ui.ImdStatusTone
import com.imdad.erp.core.ui.ImdTable
import com.imdad.erp.core.ui.ImdTableColumn
import com.imdad.erp.core.ui.ImdTextField
import com.imdad.erp.data.db.ArchiveDocumentEntity
import com.imdad.erp.data.db.CableEntity
import com.imdad.erp.data.db.CampLedgerEntity
import com.imdad.erp.data.db.DailyStrengthEntity
import com.imdad.erp.data.db.FuelAllocationEntity
import com.imdad.erp.data.db.FuelIssueEntity
import com.imdad.erp.data.db.FuelStationEntity
import com.imdad.erp.data.db.IssueEntity
import com.imdad.erp.data.db.ItemEntity
import com.imdad.erp.data.db.PersonnelLinkEntity
import com.imdad.erp.data.db.RationOrderEntity
import com.imdad.erp.data.db.ReceiptEntity
import com.imdad.erp.data.db.StocktakeEntity
import com.imdad.erp.domain.StockBalanceRow
import com.imdad.erp.ui.ImdadUiState
import com.imdad.erp.ui.ImdadViewModel

@Composable
fun SupplyOrdersComposeScreen(state: ImdadUiState, viewModel: ImdadViewModel) {
    var unitName by remember { mutableStateOf("اللواء الأول مشاة") }
    var warehouse by remember { mutableStateOf("المستودع المركزي") }
    var strengthText by remember { mutableStateOf("1450") }
    var daysText by remember { mutableStateOf("15") }

    ImdPanel(
        title = "طلبيات الإعاشة والتموين الدوري",
        subtitle = "احتساب واعتماد طلبيات الوحدات بناءً على القوة الفعلية وعدد أيام الإمداد",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdTextField("الوحدة المستفيدة", unitName, { unitName = it }, modifier = Modifier.weight(1f))
                ImdTextField("المستودع الممون", warehouse, { warehouse = it }, modifier = Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdTextField("القوة البشرية", strengthText, { strengthText = it }, isNumeric = true, modifier = Modifier.weight(1f))
                ImdTextField("أيام الإمداد", daysText, { daysText = it }, isNumeric = true, modifier = Modifier.weight(1f))
            }
            ImdButton(
                text = "إنشاء واعتماد طلبية الإعاشة",
                variant = ImdButtonVariant.Primary,
                onClick = {
                    viewModel.createRationOrder(
                        unitName = unitName,
                        warehouse = warehouse,
                        strengthCount = strengthText.toIntOrNull() ?: 100,
                        daysCount = daysText.toIntOrNull() ?: 15,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )

            val cols = remember(state.useArabicDigits) {
                listOf(
                    ImdTableColumn<RationOrderEntity>("ref", "رقم الطلبية", 110.dp, cellText = { it.refNo }),
                    ImdTableColumn<RationOrderEntity>("date", "التاريخ", 110.dp, cellText = { it.date }),
                    ImdTableColumn<RationOrderEntity>("unit", "الوحدة المستفيدة", 180.dp, cellText = { it.beneficiaryUnit }),
                    ImdTableColumn<RationOrderEntity>(
                        "str",
                        "القوة",
                        100.dp,
                        isNumeric = true,
                        cellText = { ImdFormat.formatNum(it.strengthCount.toDouble(), 0, state.useArabicDigits) },
                    ),
                    ImdTableColumn<RationOrderEntity>(
                        "st",
                        "الحالة",
                        110.dp,
                        cellText = { it.status },
                        cellContent = { row ->
                            ImdStatusText(
                                label = if (row.status == "APPROVED") "معتمدة" else "قيد المراجعة",
                                tone = if (row.status == "APPROVED") ImdStatusTone.Success else ImdStatusTone.Warn,
                            )
                        },
                    ),
                )
            }
            ImdTable(rows = state.rationOrders, columns = cols, keySelector = { it.id })
        }
    }
}

@Composable
fun DocumentsComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "سجل سندات التوريد الرسمية (Receipts Register)",
        subtitle = "كافة سندات الاستلام المرحّلة في قاعدة البيانات المشفرة SQLCipher v31",
    ) {
        val recCols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<ReceiptEntity>("ref", "رقم السند", 110.dp, cellText = { it.refNo }),
                ImdTableColumn<ReceiptEntity>("date", "التاريخ", 110.dp, cellText = { it.date }),
                ImdTableColumn<ReceiptEntity>("wh", "المستودع", 140.dp, cellText = { it.warehouse }),
                ImdTableColumn<ReceiptEntity>("sup", "المورّد", 180.dp, cellText = { it.supplier }),
                ImdTableColumn<ReceiptEntity>(
                    "qty",
                    "الكمية",
                    100.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.qty, 2, state.useArabicDigits) },
                ),
            )
        }
        ImdTable(rows = state.receipts, columns = recCols, keySelector = { it.id })
    }

    ImdPanel(
        title = "سجل سندات الصرف الرسمية (Issues Register)",
    ) {
        val issCols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<IssueEntity>("ref", "رقم السند", 110.dp, cellText = { it.refNo }),
                ImdTableColumn<IssueEntity>("date", "التاريخ", 110.dp, cellText = { it.date }),
                ImdTableColumn<IssueEntity>("unit", "الوحدة المستفيدة", 180.dp, cellText = { it.beneficiaryUnit }),
                ImdTableColumn<IssueEntity>(
                    "qty",
                    "الكمية",
                    100.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.qty, 2, state.useArabicDigits) },
                ),
                ImdTableColumn<IssueEntity>("purp", "الغرض", 150.dp, cellText = { it.purpose }),
            )
        }
        ImdTable(rows = state.issues, columns = issCols, keySelector = { it.id })
    }
}

@Composable
fun StocktakeComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "محاضر الجرد المخزني الفعلي والمطابقة الدفترية",
        subtitle = "فحص الفروقات الجردية وترحيل التسويات المعتمدة",
    ) {
        val cols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<StocktakeEntity>("ref", "رقم المحضر", 110.dp, cellText = { it.refNo }),
                ImdTableColumn<StocktakeEntity>("date", "التاريخ", 110.dp, cellText = { it.date }),
                ImdTableColumn<StocktakeEntity>("wh", "المستودع", 150.dp, cellText = { it.warehouse }),
                ImdTableColumn<StocktakeEntity>("head", "رئيس اللجنة", 160.dp, cellText = { it.committeeHead }),
                ImdTableColumn<StocktakeEntity>(
                    "match",
                    "الأصناف المطابقة",
                    120.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.matchedItems.toDouble(), 0, state.useArabicDigits) },
                ),
            )
        }
        ImdTable(rows = state.stocktakes, columns = cols, keySelector = { it.id })
    }
}

@Composable
fun SupplyDailyComposeScreen(state: ImdadUiState, viewModel: ImdadViewModel) {
    var unitName by remember { mutableStateOf("اللواء الأول مشاة") }
    var offText by remember { mutableStateOf("85") }
    var ncoText by remember { mutableStateOf("310") }
    var solText by remember { mutableStateOf("1055") }
    var gstText by remember { mutableStateOf("18") }

    ImdPanel(
        title = "التفريدة اليومية للقوة البشرية وجدول الاستحقاق",
        subtitle = "احتساب مخصصات الوجبات اليومية آلياً بناءً على التفريدة المعتمدة",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ImdTextField("الوحدة / المعسكر", unitName, { unitName = it })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdTextField("ضباط", offText, { offText = it }, isNumeric = true, modifier = Modifier.weight(1f))
                ImdTextField("صف ضباط", ncoText, { ncoText = it }, isNumeric = true, modifier = Modifier.weight(1f))
                ImdTextField("أفراد", solText, { solText = it }, isNumeric = true, modifier = Modifier.weight(1f))
                ImdTextField("ضيوف", gstText, { gstText = it }, isNumeric = true, modifier = Modifier.weight(1f))
            }
            ImdButton(
                text = "حفظ التفريدة اليومية واحتساب الاستحقاق",
                variant = ImdButtonVariant.Primary,
                onClick = {
                    viewModel.recordDailyStrength(
                        unitName = unitName,
                        officers = offText.toIntOrNull() ?: 0,
                        ncos = ncoText.toIntOrNull() ?: 0,
                        soldiers = solText.toIntOrNull() ?: 0,
                        guests = gstText.toIntOrNull() ?: 0,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )

            val cols = remember(state.useArabicDigits) {
                listOf(
                    ImdTableColumn<DailyStrengthEntity>("date", "التاريخ", 110.dp, cellText = { it.date }),
                    ImdTableColumn<DailyStrengthEntity>("unit", "الوحدة", 180.dp, cellText = { it.unitName }),
                    ImdTableColumn<DailyStrengthEntity>(
                        "tot",
                        "إجمالي القوة",
                        120.dp,
                        isNumeric = true,
                        cellText = { ImdFormat.formatNum(it.total.toDouble(), 0, state.useArabicDigits) },
                    ),
                )
            }
            ImdTable(rows = state.dailyStrengths, columns = cols, keySelector = { it.id })
        }
    }
}

@Composable
fun CampAccountsComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "حسابات المعسكرات والتسويات الشهرية",
        subtitle = "متابعة المخصصات النقدية والتموينية والمطابقات الختامية للمعسكرات",
    ) {
        val cols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<CampLedgerEntity>("ref", "رقم القيد", 110.dp, cellText = { it.refNo }),
                ImdTableColumn<CampLedgerEntity>("camp", "المعسكر", 170.dp, cellText = { it.campName }),
                ImdTableColumn<CampLedgerEntity>("desc", "البيان", 210.dp, cellText = { it.description }),
                ImdTableColumn<CampLedgerEntity>(
                    "deb",
                    "المخصص",
                    120.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.debitAmount, 2, state.useArabicDigits) },
                ),
                ImdTableColumn<CampLedgerEntity>(
                    "cred",
                    "المنصرف",
                    120.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.creditAmount, 2, state.useArabicDigits) },
                ),
            )
        }
        ImdTable(rows = state.campLedgers, columns = cols, keySelector = { it.id })
    }
}

@Composable
fun SupplyReportsComposeScreen(state: ImdadUiState) {
    val ledger = state.stockLedger
    ImdPanel(
        title = "تقارير كفاية المخزون والتقييم المالي بالمتوسط المرجح",
        subtitle = "تحليل الوارد والمنصرف والرصيد المتاح وقيمة المخزون لكل مستودع",
    ) {
        val cols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<StockBalanceRow>("code", "الكود", 100.dp, cellText = { it.itemCode }),
                ImdTableColumn<StockBalanceRow>("name", "الصنف", 200.dp, cellText = { it.itemName }),
                ImdTableColumn<StockBalanceRow>(
                    "in",
                    "إجمالي الوارد",
                    115.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.openingQty + it.receivedQty, 1, state.useArabicDigits) },
                ),
                ImdTableColumn<StockBalanceRow>(
                    "out",
                    "إجمالي المنصرف",
                    115.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.issuedQty, 1, state.useArabicDigits) },
                ),
                ImdTableColumn<StockBalanceRow>(
                    "val",
                    "القيمة الإجمالية",
                    130.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.totalValue, 2, state.useArabicDigits) },
                ),
            )
        }
        ImdTable(rows = ledger, columns = cols, keySelector = { "${it.warehouse}-${it.itemId}" })
    }
}

@Composable
fun SupplyBasicDataComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "دليل الأصناف والباركود والمستودعات (Basic Data Catalog)",
        subtitle = "فهرس الأصناف المعتمد مع أكواد Code-128 وحدود الطلب الدنيا",
    ) {
        val cols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<ItemEntity>("code", "الكود", 100.dp, cellText = { it.code }),
                ImdTableColumn<ItemEntity>("bar", "الباركود", 140.dp, isNumeric = true, cellText = { it.barcode }),
                ImdTableColumn<ItemEntity>("name", "اسم الصنف", 220.dp, cellText = { it.name }),
                ImdTableColumn<ItemEntity>("unit", "الوحدة", 90.dp, cellText = { it.unit }),
                ImdTableColumn<ItemEntity>(
                    "min",
                    "الحد الأدنى",
                    110.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.minStock, 0, state.useArabicDigits) },
                ),
            )
        }
        ImdTable(rows = state.items, columns = cols, keySelector = { it.id })
    }
}

@Composable
fun CablesComposeScreen(state: ImdadUiState, viewModel: ImdadViewModel) {
    var sender by remember { mutableStateOf("هيئة الإمداد والتموين") }
    var recipient by remember { mutableStateOf("قيادة القطاع الشمالي") }
    var subject by remember { mutableStateOf("توجيه صرف مخصصات الإعاشة الميدانية") }

    ImdPanel(
        title = "سجل البرقيات العسكرية الواردة والصادرة",
        subtitle = "قيد ومتابعة البرقيات التشغيلية وربطها بسندات الصرف والتوريد",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdTextField("الجهة المرسلة", sender, { sender = it }, modifier = Modifier.weight(1f))
                ImdTextField("الجهة المستلمة", recipient, { recipient = it }, modifier = Modifier.weight(1f))
            }
            ImdTextField("موضوع البرقية", subject, { subject = it })
            ImdButton(
                text = "قيد البرقية في السجل الرسمي",
                variant = ImdButtonVariant.Primary,
                onClick = {
                    viewModel.createCable("OUTGOING", sender, recipient, subject, "عاجل")
                },
                modifier = Modifier.fillMaxWidth(),
            )

            val cols = remember {
                listOf(
                    ImdTableColumn<CableEntity>("no", "رقم البرقية", 110.dp, cellText = { it.cableNo }),
                    ImdTableColumn<CableEntity>("date", "التاريخ", 110.dp, cellText = { it.date }),
                    ImdTableColumn<CableEntity>("subj", "الموضوع", 220.dp, cellText = { it.subject }),
                    ImdTableColumn<CableEntity>("prio", "الأولوية", 100.dp, cellText = { it.priority }),
                )
            }
            ImdTable(rows = state.cables, columns = cols, keySelector = { it.id })
        }
    }
}

@Composable
fun ElectronicArchiveComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "الأرشيف الإلكتروني المشفر (AES-256-GCM Vault)",
        subtitle = "توثيق المرفقات والمحاضر الرسمية مع بصمة التكامل SHA-256",
    ) {
        val cols = remember {
            listOf(
                ImdTableColumn<ArchiveDocumentEntity>("no", "رقم الوثيقة", 120.dp, cellText = { it.docNo }),
                ImdTableColumn<ArchiveDocumentEntity>("date", "التاريخ", 110.dp, cellText = { it.date }),
                ImdTableColumn<ArchiveDocumentEntity>("title", "عنوان الوثيقة", 230.dp, cellText = { it.title }),
                ImdTableColumn<ArchiveDocumentEntity>("hash", "بصمة SHA-256", 140.dp, isNumeric = true, cellText = { it.sha256Hash.take(12) }),
            )
        }
        ImdTable(rows = state.archiveDocs, columns = cols, keySelector = { it.id })
    }
}

@Composable
fun PersonnelComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "سجل القوة البشرية وربط استحقاق الإعاشة الفردي",
    ) {
        val cols = remember {
            listOf(
                ImdTableColumn<PersonnelLinkEntity>("mil", "الرقم العسكري", 120.dp, isNumeric = true, cellText = { it.militaryNo }),
                ImdTableColumn<PersonnelLinkEntity>("rank", "الرتبة", 100.dp, cellText = { it.rank }),
                ImdTableColumn<PersonnelLinkEntity>("name", "الاسم", 190.dp, cellText = { it.name }),
                ImdTableColumn<PersonnelLinkEntity>("unit", "الوحدة", 170.dp, cellText = { it.unitName }),
            )
        }
        ImdTable(rows = state.personnelLinks, columns = cols, keySelector = { it.id })
    }
}

@Composable
fun LinkagesComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "ارتباطات العهد المالية والتسليح والمهمات",
        subtitle = "مراقبة الذمم المالية والعهد المسجلة على الأفراد والوحدات",
    ) {
        val cols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<PersonnelLinkEntity>("mil", "الرقم العسكري", 120.dp, isNumeric = true, cellText = { it.militaryNo }),
                ImdTableColumn<PersonnelLinkEntity>("name", "المستلم", 190.dp, cellText = { "${it.rank}/ ${it.name}" }),
                ImdTableColumn<PersonnelLinkEntity>("unit", "الوحدة", 160.dp, cellText = { it.unitName }),
                ImdTableColumn<PersonnelLinkEntity>(
                    "amt",
                    "قيمة العهدة",
                    130.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.custodyAmount, 2, state.useArabicDigits) },
                ),
            )
        }
        ImdTable(rows = state.personnelLinks, columns = cols, keySelector = { it.id })
    }
}

@Composable
fun SettingsComposeScreen(state: ImdadUiState, viewModel: ImdadViewModel) {
    ImdPanel(
        title = "إعدادات النظام والسمات والتشفير المحلي (SQLCipher v31)",
        subtitle = "تخصيص المظهر، الكثافة، الأرقام العربية، والنسخ الاحتياطي المشفر (.imdbk)",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdButton(
                    text = if (state.isDarkTheme) "تفعيل السمة الفاتحة" else "تفعيل السمة الداكنة",
                    variant = ImdButtonVariant.Secondary,
                    onClick = { viewModel.toggleDarkTheme() },
                    modifier = Modifier.weight(1f),
                )
                ImdButton(
                    text = if (state.classicFlat) "النمط الحديث" else "النمط الكلاسيكي المسطح",
                    variant = ImdButtonVariant.Secondary,
                    onClick = { viewModel.toggleClassicFlat() },
                    modifier = Modifier.weight(1f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdButton(
                    text = if (state.highDensity) "الكثافة القياسية (46.dp)" else "الكثافة العالية (44.dp)",
                    variant = ImdButtonVariant.Secondary,
                    onClick = { viewModel.toggleHighDensity() },
                    modifier = Modifier.weight(1f),
                )
                ImdButton(
                    text = if (state.useArabicDigits) "الأرقام الهندية (١٢٣)" else "الأرقام الغربية (123)",
                    variant = ImdButtonVariant.Primary,
                    onClick = { viewModel.toggleArabicDigits() },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
fun FuelAllocationsComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "تفريدة مخصصات المحروقات الشهرية للوحدات",
        subtitle = "متابعة الحصص المقررة والكميات المستهلكة والمتبقية لكل وحدة",
    ) {
        val cols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<FuelAllocationEntity>("m", "الشهر", 100.dp, cellText = { it.periodMonth }),
                ImdTableColumn<FuelAllocationEntity>("u", "الوحدة", 190.dp, cellText = { it.unitName }),
                ImdTableColumn<FuelAllocationEntity>("t", "الوقود", 90.dp, cellText = { it.fuelType }),
                ImdTableColumn<FuelAllocationEntity>(
                    "q",
                    "المخصص (لتر)",
                    120.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.quotaLiters, 0, state.useArabicDigits) },
                ),
                ImdTableColumn<FuelAllocationEntity>(
                    "c",
                    "المستهلك (لتر)",
                    120.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.consumedLiters, 0, state.useArabicDigits) },
                ),
            )
        }
        ImdTable(rows = state.fuelAllocations, columns = cols, keySelector = { it.id })
    }
}

@Composable
fun FuelReportsComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "تقارير استهلاك الآليات وحركة عدادات المسافة",
    ) {
        val cols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<FuelIssueEntity>("ref", "رقم السند", 110.dp, cellText = { it.refNo }),
                ImdTableColumn<FuelIssueEntity>("date", "التاريخ", 110.dp, cellText = { it.date }),
                ImdTableColumn<FuelIssueEntity>("plate", "رقم الآلية", 120.dp, cellText = { it.vehiclePlate }),
                ImdTableColumn<FuelIssueEntity>(
                    "odo",
                    "العداد (كم)",
                    115.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.odometerKm.toDouble(), 0, state.useArabicDigits) },
                ),
                ImdTableColumn<FuelIssueEntity>(
                    "qty",
                    "الكمية (لتر)",
                    115.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.qtyLiters, 1, state.useArabicDigits) },
                ),
            )
        }
        ImdTable(rows = state.fuelIssues, columns = cols, keySelector = { it.id })
    }
}

@Composable
fun FuelDataComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "بيانات محطات الوقود والخزانات والرواسب الميتة (Dead Stock)",
    ) {
        val cols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<FuelStationEntity>("code", "الكود", 110.dp, cellText = { it.code }),
                ImdTableColumn<FuelStationEntity>("name", "المحطة / الخزان", 220.dp, cellText = { it.name }),
                ImdTableColumn<FuelStationEntity>(
                    "cap",
                    "السعة (لتر)",
                    120.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.capacityLiters, 0, state.useArabicDigits) },
                ),
                ImdTableColumn<FuelStationEntity>(
                    "dead",
                    "المخزون الميت",
                    120.dp,
                    isNumeric = true,
                    cellText = { ImdFormat.formatNum(it.deadStockLiters, 0, state.useArabicDigits) },
                ),
            )
        }
        ImdTable(rows = state.fuelStations, columns = cols, keySelector = { it.id })
    }
}

@Composable
fun FuelSettingsComposeScreen(state: ImdadUiState, viewModel: ImdadViewModel) {
    val totalCapacity = state.fuelStations.sumOf { it.capacityLiters }
    val totalPumpable = state.fuelTanks.sumOf { it.pumpableLiters }

    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        ImdKpiCard(
            label = "إجمالي السعة التخزينية",
            value = "${ImdFormat.formatNum(totalCapacity, 0, state.useArabicDigits)} لتر",
            tone = ImdStatusTone.Info,
            modifier = Modifier.weight(1f),
        )
        ImdKpiCard(
            label = "الصافي القابل للضخ",
            value = "${ImdFormat.formatNum(totalPumpable, 0, state.useArabicDigits)} لتر",
            tone = ImdStatusTone.Success,
            modifier = Modifier.weight(1f),
        )
    }

    SettingsComposeScreen(state = state, viewModel = viewModel)
}
