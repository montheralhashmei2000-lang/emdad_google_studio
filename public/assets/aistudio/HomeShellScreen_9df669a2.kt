package com.imdad.erp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Straighten
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imdad.erp.core.theme.ImdFormat
import com.imdad.erp.core.theme.ImdSizes
import com.imdad.erp.core.theme.ImdTheme
import com.imdad.erp.core.theme.ImdadTheme
import com.imdad.erp.core.ui.ImdButton
import com.imdad.erp.core.ui.ImdButtonVariant
import com.imdad.erp.core.ui.ImdKpiCard
import com.imdad.erp.core.ui.ImdPanel
import com.imdad.erp.core.ui.ImdStatusText
import com.imdad.erp.core.ui.ImdStatusTone
import com.imdad.erp.core.ui.ImdTable
import com.imdad.erp.core.ui.ImdTableColumn
import com.imdad.erp.core.ui.ImdTextField
import com.imdad.erp.data.db.AuditLogEntity
import com.imdad.erp.data.db.FuelMaintenanceEntity
import com.imdad.erp.data.db.FuelTankReadingEntity
import com.imdad.erp.domain.FuelTankBalance
import com.imdad.erp.domain.StockBalanceRow
import com.imdad.erp.ui.AppSpaceKind
import com.imdad.erp.ui.ImdadUiState
import com.imdad.erp.ui.ImdadViewModel
import kotlinx.coroutines.launch

data class ComposeDoorDef(
    val id: String,
    val label: String,
    val group: String,
    val icon: ImageVector,
)

private val SUPPLY_DOORS = listOf(
    ComposeDoorDef("dashboard", "الرئيسية", "العمليات والمخزون", Icons.Default.Dashboard),
    ComposeDoorDef("supplyMoves", "حركة المخزون", "العمليات والمخزون", Icons.Default.Inventory2),
    ComposeDoorDef("supplyOrders", "الطلبيات", "العمليات والمخزون", Icons.Default.ShoppingCart),
    ComposeDoorDef("stocktake", "الجرد المخزني", "العمليات والمخزون", Icons.Default.FactCheck),
    ComposeDoorDef("supplyReports", "التقارير والأرصدة", "الإعاشة والمعسكرات", Icons.Default.Assessment),
    ComposeDoorDef("supplyAudit", "الرقابة والتدقيق", "الحوكمة والنظام", Icons.Default.Security),
    ComposeDoorDef("settings", "الإعدادات", "الحوكمة والنظام", Icons.Default.Settings),
)

private val FUEL_DOORS = listOf(
    ComposeDoorDef("fuelDashboard", "لوحة المحروقات", "عمليات المحروقات", Icons.Default.Dashboard),
    ComposeDoorDef("fuelMoves", "حركة المحروقات", "عمليات المحروقات", Icons.Default.LocalGasStation),
    ComposeDoorDef("fuelStocktake", "المسطرة والصيانة", "عمليات المحروقات", Icons.Default.Straighten),
    ComposeDoorDef("fuelReports", "تقارير المحروقات", "التقارير والبيانات", Icons.Default.Assessment),
)

@Composable
fun ImdadApp(
    viewModel: ImdadViewModel,
    onRequestBiometricUnlock: (() -> Unit) -> Unit = { it() },
) {
    val state by viewModel.state.collectAsState()

    ImdadTheme(
        isDark = state.isDarkTheme,
        isFuelSpace = state.activeSpace == AppSpaceKind.Fuel,
        distinctFuelTheme = state.distinctFuelTheme,
        classicFlat = state.classicFlat,
        highDensity = state.highDensity,
    ) {
        when {
            state.currentUser == null -> LoginComposeScreen(viewModel = viewModel)
            state.isLocked -> BiometricLockComposeScreen(
                state = state,
                onBiometricClick = {
                    onRequestBiometricUnlock { viewModel.unlockWithBiometrics() }
                },
                onLogout = { viewModel.logout() },
            )
            state.activeSpace == null -> SpaceChooserComposeScreen(
                onSelectSpace = { viewModel.setSpace(it) },
            )
            else -> HomeShellComposeScreen(state = state, viewModel = viewModel)
        }
    }
}

@Composable
fun LoginComposeScreen(viewModel: ImdadViewModel) {
    val colors = ImdTheme.colors
    var username by remember { mutableStateOf("admin") }
    var password by remember { mutableStateOf("Admin@123") }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .padding(16.dp),
    ) {
        Surface(
            color = colors.surface,
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier
                .widthIn(max = 400.dp)
                .border(1.dp, colors.lineStrong, RoundedCornerShape(10.dp)),
        ) {
            Column {
                // Sovereign Crest Banner
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colors.side)
                        .padding(horizontal = 20.dp, vertical = 22.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Security,
                        contentDescription = null,
                        tint = colors.sideText,
                        modifier = Modifier.size(36.dp),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "نظام الإمداد والتموين والمحروقات",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.sideText,
                    )
                    Text(
                        text = "منصة التشغيل الميداني المشفرة (Android APK)",
                        fontSize = 11.sp,
                        color = colors.sideMuted,
                    )
                }

                // Clean Touch Login Form
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(18.dp),
                ) {
                    ImdTextField(
                        label = "اسم المستخدم",
                        value = username,
                        onValueChange = { username = it },
                    )
                    ImdTextField(
                        label = "كلمة المرور",
                        value = password,
                        onValueChange = { password = it },
                    )
                    if (errorMsg != null) {
                        ImdStatusText(label = errorMsg!!, tone = ImdStatusTone.Danger)
                    }
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        ImdButton(
                            text = "تسجيل الدخول",
                            variant = ImdButtonVariant.Primary,
                            onClick = {
                                val ok = viewModel.login(username, password)
                                if (!ok) errorMsg = "بيانات الدخول غير صحيحة"
                            },
                            modifier = Modifier.weight(1f),
                        )
                        ImdButton(
                            text = "بصمة",
                            icon = Icons.Default.Fingerprint,
                            variant = ImdButtonVariant.Secondary,
                            onClick = { viewModel.login("admin", "Admin@123") },
                        )
                    }
                    HorizontalDivider(color = colors.line)
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = "استرداد مفتاح المالك",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = colors.accent,
                        )
                        Text(
                            text = "SQLCipher v31 · محلي",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = colors.muted,
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun BiometricLockComposeScreen(
    state: ImdadUiState,
    onBiometricClick: () -> Unit,
    onLogout: () -> Unit,
) {
    val colors = ImdTheme.colors
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .padding(16.dp),
    ) {
        ImdPanel(
            title = "الجلسة مقفلة أمنياً",
            subtitle = "المستخدم الحالي: ${state.currentUser?.name ?: ""}",
            modifier = Modifier.widthIn(max = 400.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                ImdButton(
                    text = "فك القفل بالبصمة الحيوية (BiometricPrompt)",
                    icon = Icons.Default.Fingerprint,
                    variant = ImdButtonVariant.Primary,
                    onClick = onBiometricClick,
                    modifier = Modifier.fillMaxWidth(),
                )
                ImdButton(
                    text = "تسجيل الخروج",
                    icon = Icons.Default.Logout,
                    variant = ImdButtonVariant.Danger,
                    onClick = onLogout,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
fun SpaceChooserComposeScreen(
    onSelectSpace: (AppSpaceKind) -> Unit,
) {
    val colors = ImdTheme.colors
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .padding(16.dp),
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.widthIn(max = 460.dp),
        ) {
            ImdPanel(
                title = "مساحة الإمداد والتموين",
                subtitle = "إدارة المستودعات، سندات التوريد والصرف، الجرد، الإعاشة، والبرقيات",
            ) {
                ImdButton(
                    text = "الدخول إلى مساحة الإمداد والتموين",
                    variant = ImdButtonVariant.Primary,
                    onClick = { onSelectSpace(AppSpaceKind.Supply) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            ImdPanel(
                title = "مساحة المحروقات الميدانية",
                subtitle = "إدارة محطات الوقود، خزانات الديزل والبنزين، قراءات المسطرة، والصيانة الدورية",
            ) {
                ImdButton(
                    text = "الدخول إلى مساحة المحروقات",
                    variant = ImdButtonVariant.Orange,
                    onClick = { onSelectSpace(AppSpaceKind.Fuel) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/**
 * Pure Android Jetpack Compose Material 3 App Shell:
 * - 56.dp Android Top Bar
 * - 58.dp Android Bottom Navigation Bar (4 primary doors + 5th "كل الأبواب" drawer tab)
 * - Slide-over ModalNavigationDrawer with Space Switcher, grouped doors, and SQLCipher v31 status
 */
@Composable
fun HomeShellComposeScreen(
    state: ImdadUiState,
    viewModel: ImdadViewModel,
) {
    val colors = ImdTheme.colors
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val doors = if (state.activeSpace == AppSpaceKind.Fuel) FUEL_DOORS else SUPPLY_DOORS
    val activeDoor = doors.find { it.id == state.activeDoorId } ?: doors.first()

    LaunchedEffect(state.toastMessage) {
        val msg = state.toastMessage
        if (msg != null) {
            snackbarHostState.showSnackbar(msg)
            viewModel.dismissToast()
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = colors.side,
                drawerContentColor = colors.sideText,
                modifier = Modifier
                    .widthIn(max = ImdSizes.DrawerMaxWidth)
                    .fillMaxHeight(),
            ) {
                // Drawer Header
                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                ) {
                    Text(
                        text = "نظام الإمداد والتموين",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.sideText,
                    )
                    Text(
                        text = "${state.currentUser?.name ?: ""} · ${state.currentUser?.role ?: ""}",
                        fontSize = 11.sp,
                        color = colors.sideMuted,
                    )

                    // Space Switcher inside Android Drawer
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        ImdButton(
                            text = "الإمداد",
                            variant = if (state.activeSpace == AppSpaceKind.Supply)
                                ImdButtonVariant.Primary else ImdButtonVariant.Secondary,
                            onClick = {
                                viewModel.setSpace(AppSpaceKind.Supply)
                                scope.launch { drawerState.close() }
                            },
                            modifier = Modifier.weight(1f),
                        )
                        ImdButton(
                            text = "المحروقات",
                            variant = if (state.activeSpace == AppSpaceKind.Fuel)
                                ImdButtonVariant.Orange else ImdButtonVariant.Secondary,
                            onClick = {
                                viewModel.setSpace(AppSpaceKind.Fuel)
                                scope.launch { drawerState.close() }
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                HorizontalDivider(color = colors.sideLine)

                // Grouped Doors List (46.dp Android touch targets)
                Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(10.dp),
                ) {
                    doors.groupBy { it.group }.forEach { (groupName, groupDoors) ->
                        Text(
                            text = groupName,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.sideMuted,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                        groupDoors.forEach { door ->
                            val selected = door.id == activeDoor.id
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(ImdSizes.TouchMin)
                                    .background(
                                        color = if (selected) colors.sideActive else Color.Transparent,
                                        shape = RoundedCornerShape(6.dp),
                                    )
                                    .clickable {
                                        viewModel.navigateToDoor(door.id)
                                        scope.launch { drawerState.close() }
                                    }
                                    .padding(horizontal = 12.dp),
                            ) {
                                Icon(
                                    imageVector = door.icon,
                                    contentDescription = null,
                                    tint = if (selected) colors.sideText else colors.sideMuted,
                                    modifier = Modifier.size(18.dp),
                                )
                                Text(
                                    text = door.label,
                                    fontSize = 13.sp,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                    color = if (selected) colors.sideText else colors.sideMuted,
                                )
                            }
                        }
                    }
                }

                HorizontalDivider(color = colors.sideLine)

                // Drawer Footer
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                ) {
                    Text(
                        text = "SQLCipher v31 · ${state.deviceId}",
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        color = colors.sideMuted,
                    )
                    ImdButton(
                        text = "خروج",
                        icon = Icons.Default.Logout,
                        variant = ImdButtonVariant.Danger,
                        onClick = { viewModel.logout() },
                    )
                }
            }
        }
    ) {
        Scaffold(
            containerColor = colors.bg,
            snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
            topBar = {
                // 56.dp Android Material Top Bar
                Surface(
                    color = colors.surface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(ImdSizes.AppBarHeight),
                ) {
                    Column {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .padding(horizontal = 8.dp),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                IconButton(
                                    onClick = { scope.launch { drawerState.open() } },
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Menu,
                                        contentDescription = "القائمة",
                                        tint = colors.text,
                                    )
                                }
                                Column {
                                    Text(
                                        text = activeDoor.label,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = colors.text,
                                    )
                                    Text(
                                        text = if (state.activeSpace == AppSpaceKind.Fuel)
                                            "مساحة المحروقات الميدانية"
                                        else
                                            "مساحة الإمداد والتموين",
                                        fontSize = 10.sp,
                                        color = colors.muted,
                                    )
                                }
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                IconButton(onClick = { viewModel.toggleDarkTheme() }) {
                                    Icon(
                                        imageVector = if (state.isDarkTheme)
                                            Icons.Default.LightMode else Icons.Default.DarkMode,
                                        contentDescription = "تبديل السمة",
                                        tint = colors.text2,
                                    )
                                }
                                IconButton(onClick = { viewModel.lockSession() }) {
                                    Icon(
                                        imageVector = Icons.Default.Lock,
                                        contentDescription = "قفل الجلسة",
                                        tint = colors.text2,
                                    )
                                }
                            }
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(1.dp)
                                .background(colors.line)
                        )
                    }
                }
            },
            bottomBar = {
                // 58.dp Android Bottom Navigation Bar (4 primary doors + 5th All-Doors Drawer trigger)
                NavigationBar(
                    containerColor = colors.surface,
                    contentColor = colors.text,
                    tonalElevation = 0.dp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(ImdSizes.BottomNavHeight)
                        .border(1.dp, colors.lineStrong),
                ) {
                    doors.take(4).forEach { door ->
                        val selected = door.id == activeDoor.id
                        NavigationBarItem(
                            selected = selected,
                            onClick = { viewModel.navigateToDoor(door.id) },
                            icon = {
                                Icon(
                                    imageVector = door.icon,
                                    contentDescription = door.label,
                                    modifier = Modifier.size(18.dp),
                                )
                            },
                            label = {
                                Text(
                                    text = door.label,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = colors.accent,
                                selectedTextColor = colors.accent,
                                unselectedIconColor = colors.muted,
                                unselectedTextColor = colors.muted,
                                indicatorColor = colors.accentSoft,
                            ),
                        )
                    }

                    NavigationBarItem(
                        selected = false,
                        onClick = { scope.launch { drawerState.open() } },
                        icon = {
                            Icon(
                                imageVector = Icons.Default.Menu,
                                contentDescription = "كل الأبواب",
                                modifier = Modifier.size(18.dp),
                            )
                        },
                        label = {
                            Text(
                                text = "كل الأبواب",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            unselectedIconColor = colors.muted,
                            unselectedTextColor = colors.muted,
                        ),
                    )
                }
            },
        ) { innerPadding ->
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(12.dp),
            ) {
                when (activeDoor.id) {
                    "dashboard" -> SupplyDashboardComposeScreen(state = state)
                    "supplyMoves" -> SupplyMovesComposeScreen(state = state, viewModel = viewModel)
                    "fuelDashboard" -> FuelDashboardComposeScreen(state = state)
                    "fuelMoves" -> FuelMovesComposeScreen(state = state, viewModel = viewModel)
                    "fuelStocktake" -> FuelRulerAndMaintenanceComposeScreen(state = state, viewModel = viewModel)
                    "supplyAudit" -> AuditComposeScreen(state = state)
                    else -> SupplyDashboardComposeScreen(state = state)
                }
            }
        }
    }
}

@Composable
fun SupplyDashboardComposeScreen(state: ImdadUiState) {
    val ledger = state.stockLedger
    val totalValue = ledger.sumOf { it.totalValue }
    val lowStockCount = ledger.count { it.isBelowMin }

    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        ImdKpiCard(
            label = "إجمالي الأصناف المسجلة",
            value = ImdFormat.formatNum(state.items.size.toDouble(), 0, state.useArabicDigits),
            meta = "في كافة المستودعات",
            tone = ImdStatusTone.Success,
            modifier = Modifier.weight(1f),
        )
        ImdKpiCard(
            label = "القيمة الإجمالية للمخزون",
            value = ImdFormat.formatNum(totalValue, 2, state.useArabicDigits),
            meta = "بالمتوسط المرجح للتكلفة",
            tone = ImdStatusTone.Info,
            modifier = Modifier.weight(1f),
        )
    }

    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        ImdKpiCard(
            label = "سندات التوريد المرحّلة",
            value = ImdFormat.formatNum(state.receipts.size.toDouble(), 0, state.useArabicDigits),
            tone = ImdStatusTone.Success,
            modifier = Modifier.weight(1f),
        )
        ImdKpiCard(
            label = "أصناف دون الحد الأدنى",
            value = ImdFormat.formatNum(lowStockCount.toDouble(), 0, state.useArabicDigits),
            tone = if (lowStockCount > 0) ImdStatusTone.Danger else ImdStatusTone.Muted,
            modifier = Modifier.weight(1f),
        )
    }

    ImdPanel(
        title = "دفتر أرصدة المخزون الفوري (ImdTable — Sticky Header & Responsive Cards)",
        subtitle = "يتحول تلقائياً بين عرض البطاقات على الهاتف (<= 900.dp) وعرض الجدول المثبت على التابلت (> 900.dp)",
    ) {
        val columns = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<StockBalanceRow>(
                    key = "code",
                    header = "الكود",
                    width = 100.dp,
                    sortExtractor = { it.itemCode },
                    cellText = { it.itemCode },
                ),
                ImdTableColumn<StockBalanceRow>(
                    key = "name",
                    header = "الصنف",
                    width = 210.dp,
                    sortExtractor = { it.itemName },
                    cellText = { it.itemName },
                ),
                ImdTableColumn<StockBalanceRow>(
                    key = "wh",
                    header = "المستودع",
                    width = 150.dp,
                    sortExtractor = { it.warehouse },
                    cellText = { it.warehouse },
                ),
                ImdTableColumn<StockBalanceRow>(
                    key = "qty",
                    header = "الرصيد المتاح",
                    width = 120.dp,
                    isNumeric = true,
                    sortExtractor = { it.availableQty },
                    cellText = { "${ImdFormat.formatNum(it.availableQty, 2, state.useArabicDigits)} ${it.unit}" },
                ),
                ImdTableColumn<StockBalanceRow>(
                    key = "status",
                    header = "الحالة",
                    width = 110.dp,
                    cellText = { if (it.isBelowMin) "دون الحد" else "آمن" },
                    cellContent = { row ->
                        ImdStatusText(
                            label = if (row.isBelowMin) "دون الحد الأدنى" else "رصيد آمن",
                            tone = if (row.isBelowMin) ImdStatusTone.Danger else ImdStatusTone.Success,
                        )
                    },
                ),
            )
        }

        ImdTable(
            rows = ledger,
            columns = columns,
            keySelector = { "${it.warehouse}-${it.itemId}" },
        )
    }
}

@Composable
fun SupplyMovesComposeScreen(
    state: ImdadUiState,
    viewModel: ImdadViewModel,
) {
    var warehouse by remember { mutableStateOf("المستودع المركزي") }
    var supplierOrUnit by remember { mutableStateOf("اللواء الأول مشاة") }
    var qtyText by remember { mutableStateOf("25") }
    var unitCostText by remember { mutableStateOf("215") }
    val defaultItemId = state.items.firstOrNull()?.id ?: "itm-1"

    ImdPanel(
        title = "تسجيل حركة مخزنية جديدة (توريد / صرف فوري مع حارس الرصيد)",
        subtitle = "يمنع النظام صرف أي كمية تتجاوز الرصيد المتاح داخل المستودع",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ImdTextField(
                label = "المستودع",
                value = warehouse,
                onValueChange = { warehouse = it },
            )
            ImdTextField(
                label = "الجهة المورّدة / الوحدة المستفيدة",
                value = supplierOrUnit,
                onValueChange = { supplierOrUnit = it },
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                ImdTextField(
                    label = "الكمية",
                    value = qtyText,
                    onValueChange = { qtyText = it },
                    isNumeric = true,
                    modifier = Modifier.weight(1f),
                )
                ImdTextField(
                    label = "تكلفة الوحدة",
                    value = unitCostText,
                    onValueChange = { unitCostText = it },
                    isNumeric = true,
                    modifier = Modifier.weight(1f),
                )
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                ImdButton(
                    text = "ترحيل سند استلام (+)",
                    icon = Icons.Default.AddCircleOutline,
                    variant = ImdButtonVariant.Primary,
                    onClick = {
                        viewModel.postSupplyReceipt(
                            warehouse = warehouse,
                            itemId = defaultItemId,
                            supplier = supplierOrUnit,
                            qty = qtyText.toDoubleOrNull() ?: 0.0,
                            unitCost = unitCostText.toDoubleOrNull() ?: 0.0,
                            batchNo = "B-2026",
                            expiryDate = "2027-12-31",
                        )
                    },
                    modifier = Modifier.weight(1f),
                )
                ImdButton(
                    text = "ترحيل سند صرف (-)",
                    variant = ImdButtonVariant.Orange,
                    onClick = {
                        viewModel.postSupplyIssue(
                            warehouse = warehouse,
                            itemId = defaultItemId,
                            beneficiaryUnit = supplierOrUnit,
                            qty = qtyText.toDoubleOrNull() ?: 0.0,
                            purpose = "صرف ميداني",
                        )
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
fun FuelDashboardComposeScreen(state: ImdadUiState) {
    val tanks = state.fuelTanks
    ImdPanel(
        title = "أرصدة خزانات المحروقات والكميات القابلة للضخ",
        subtitle = "يتم خصم المخزون الميت (Dead Stock) تلقائياً لحساب الكمية القابلة للضخ",
    ) {
        val cols = remember(state.useArabicDigits) {
            listOf(
                ImdTableColumn<FuelTankBalance>(
                    key = "name",
                    header = "المحطة / الخزان",
                    width = 210.dp,
                    sortExtractor = { it.stationName },
                    cellText = { it.stationName },
                ),
                ImdTableColumn<FuelTankBalance>(
                    key = "current",
                    header = "الرصيد الفعلي (لتر)",
                    width = 135.dp,
                    isNumeric = true,
                    sortExtractor = { it.currentLiters },
                    cellText = { ImdFormat.formatNum(it.currentLiters, 0, state.useArabicDigits) },
                ),
                ImdTableColumn<FuelTankBalance>(
                    key = "pumpable",
                    header = "القابل للضخ (لتر)",
                    width = 135.dp,
                    isNumeric = true,
                    sortExtractor = { it.pumpableLiters },
                    cellText = { ImdFormat.formatNum(it.pumpableLiters, 0, state.useArabicDigits) },
                ),
                ImdTableColumn<FuelTankBalance>(
                    key = "fill",
                    header = "نسبة الامتلاء",
                    width = 110.dp,
                    isNumeric = true,
                    sortExtractor = { it.fillPercent },
                    cellText = { "${ImdFormat.formatNum(it.fillPercent, 1, state.useArabicDigits)}%" },
                ),
            )
        }
        ImdTable(
            rows = tanks,
            columns = cols,
            keySelector = { it.stationId },
        )
    }
}

@Composable
fun FuelMovesComposeScreen(
    state: ImdadUiState,
    viewModel: ImdadViewModel,
) {
    val defaultStationId = state.fuelStations.firstOrNull()?.id ?: "st-1"
    var unitName by remember { mutableStateOf("كتيبة النقل الميداني") }
    var vehiclePlate by remember { mutableStateOf("ع س 4108") }
    var driverName by remember { mutableStateOf("رقيب/ سالم الحربي") }
    var odometerText by remember { mutableStateOf("84950") }
    var litersText by remember { mutableStateOf("180") }

    ImdPanel(
        title = "صرف محروقات لآلية مع فحص العداد والرصيد القابل للضخ",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ImdTextField(label = "الوحدة المستفيدة", value = unitName, onValueChange = { unitName = it })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdTextField(
                    label = "رقم اللوحة العسكرية",
                    value = vehiclePlate,
                    onValueChange = { vehiclePlate = it },
                    modifier = Modifier.weight(1f),
                )
                ImdTextField(
                    label = "قراءة العداد (كم)",
                    value = odometerText,
                    onValueChange = { odometerText = it },
                    isNumeric = true,
                    modifier = Modifier.weight(1f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdTextField(
                    label = "اسم السائق",
                    value = driverName,
                    onValueChange = { driverName = it },
                    modifier = Modifier.weight(1f),
                )
                ImdTextField(
                    label = "الكمية (لتر)",
                    value = litersText,
                    onValueChange = { litersText = it },
                    isNumeric = true,
                    modifier = Modifier.weight(1f),
                )
            }
            ImdButton(
                text = "اعتماد وترحيل سند صرف المحروقات",
                variant = ImdButtonVariant.Orange,
                onClick = {
                    viewModel.postFuelIssue(
                        stationId = defaultStationId,
                        unitName = unitName,
                        vehiclePlate = vehiclePlate,
                        driverName = driverName,
                        odometerKm = odometerText.toIntOrNull() ?: 0,
                        qtyLiters = litersText.toDoubleOrNull() ?: 0.0,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
fun FuelRulerAndMaintenanceComposeScreen(
    state: ImdadUiState,
    viewModel: ImdadViewModel,
) {
    val defaultStationId = state.fuelStations.firstOrNull()?.id ?: "st-1"
    var dipCmText by remember { mutableStateOf("212.5") }
    var tempCText by remember { mutableStateOf("27.0") }
    var waterCmText by remember { mutableStateOf("0.1") }
    var maintDesc by remember { mutableStateOf("تنظيف فلاتر المضخة ومعايرة المسطرة") }
    var maintCostText by remember { mutableStateOf("850") }

    ImdPanel(
        title = "قراءات المسطرة اليومية للخزانات (fuel_tank_readings)",
        subtitle = "حساب الحجم باللتر تلقائياً من ارتفاع المسطرة (سم) مع درجة الحرارة ونسبة الماء",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdTextField(
                    label = "قراءة المسطرة (سم)",
                    value = dipCmText,
                    onValueChange = { dipCmText = it },
                    isNumeric = true,
                    modifier = Modifier.weight(1f),
                )
                ImdTextField(
                    label = "الحرارة (°C)",
                    value = tempCText,
                    onValueChange = { tempCText = it },
                    isNumeric = true,
                    modifier = Modifier.weight(1f),
                )
                ImdTextField(
                    label = "مستوى الماء (سم)",
                    value = waterCmText,
                    onValueChange = { waterCmText = it },
                    isNumeric = true,
                    modifier = Modifier.weight(1f),
                )
            }
            ImdButton(
                text = "حفظ قراءة المسطرة وحساب الحجم",
                icon = Icons.Default.Straighten,
                variant = ImdButtonVariant.Primary,
                onClick = {
                    viewModel.recordFuelDipReading(
                        stationId = defaultStationId,
                        dipCm = dipCmText.toDoubleOrNull() ?: 0.0,
                        temperatureC = tempCText.toDoubleOrNull() ?: 25.0,
                        waterLevelCm = waterCmText.toDoubleOrNull() ?: 0.0,
                        measuredBy = state.currentUser?.name ?: "",
                        notes = "قياس ميداني بالمسطرة",
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )

            val readingCols = remember(state.useArabicDigits) {
                listOf(
                    ImdTableColumn<FuelTankReadingEntity>(
                        key = "date",
                        header = "التاريخ",
                        width = 110.dp,
                        cellText = { it.readingDate },
                    ),
                    ImdTableColumn<FuelTankReadingEntity>(
                        key = "dip",
                        header = "المسطرة (سم)",
                        width = 110.dp,
                        isNumeric = true,
                        cellText = { ImdFormat.formatNum(it.dipCm, 1, state.useArabicDigits) },
                    ),
                    ImdTableColumn<FuelTankReadingEntity>(
                        key = "vol",
                        header = "الحجم المعادل (لتر)",
                        width = 140.dp,
                        isNumeric = true,
                        cellText = { ImdFormat.formatNum(it.volumeLiters, 0, state.useArabicDigits) },
                    ),
                    ImdTableColumn<FuelTankReadingEntity>(
                        key = "by",
                        header = "المسؤول",
                        width = 160.dp,
                        cellText = { it.measuredBy },
                    ),
                )
            }
            ImdTable(
                rows = state.fuelTankReadings,
                columns = readingCols,
                keySelector = { it.id },
            )
        }
    }

    ImdPanel(
        title = "سجل الصيانة الدورية للخزانات والرمبات (fuel_maintenances)",
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                ImdTextField(
                    label = "وصف أعمال الصيانة",
                    value = maintDesc,
                    onValueChange = { maintDesc = it },
                    modifier = Modifier.weight(2f),
                )
                ImdTextField(
                    label = "التكلفة",
                    value = maintCostText,
                    onValueChange = { maintCostText = it },
                    isNumeric = true,
                    modifier = Modifier.weight(1f),
                )
            }
            ImdButton(
                text = "توثيق عملية صيانة خزان / محطة",
                icon = Icons.Default.Build,
                variant = ImdButtonVariant.Orange,
                onClick = {
                    viewModel.recordFuelMaintenance(
                        stationId = defaultStationId,
                        maintenanceType = "calibration",
                        description = maintDesc,
                        costAmount = maintCostText.toDoubleOrNull() ?: 0.0,
                        performedBy = "الفريق الهندسي",
                        nextDueDate = "2026-09-30",
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )

            val maintCols = remember(state.useArabicDigits) {
                listOf(
                    ImdTableColumn<FuelMaintenanceEntity>(
                        key = "date",
                        header = "التاريخ",
                        width = 110.dp,
                        cellText = { it.maintenanceDate },
                    ),
                    ImdTableColumn<FuelMaintenanceEntity>(
                        key = "desc",
                        header = "البيان",
                        width = 220.dp,
                        cellText = { it.description },
                    ),
                    ImdTableColumn<FuelMaintenanceEntity>(
                        key = "cost",
                        header = "التكلفة",
                        width = 110.dp,
                        isNumeric = true,
                        cellText = { ImdFormat.formatNum(it.costAmount, 2, state.useArabicDigits) },
                    ),
                )
            }
            ImdTable(
                rows = state.fuelMaintenances,
                columns = maintCols,
                keySelector = { it.id },
            )
        }
    }
}

@Composable
fun AuditComposeScreen(state: ImdadUiState) {
    ImdPanel(
        title = "سجل التدقيق الجنائي المتسلسل بالبصمة (SHA-256 Hash-Chained Audit Log)",
        subtitle = "كل عملية مرتبطة ببصمة السجل السابق لكشف أي تلاعب في القاعدة المحلية",
    ) {
        val cols = remember {
            listOf(
                ImdTableColumn<AuditLogEntity>(
                    key = "date",
                    header = "التاريخ",
                    width = 110.dp,
                    cellText = { it.logDate },
                ),
                ImdTableColumn<AuditLogEntity>(
                    key = "action",
                    header = "العملية",
                    width = 140.dp,
                    cellText = { it.action },
                ),
                ImdTableColumn<AuditLogEntity>(
                    key = "summary",
                    header = "التفاصيل",
                    width = 240.dp,
                    cellText = { it.summary },
                ),
                ImdTableColumn<AuditLogEntity>(
                    key = "hash",
                    header = "البصمة (SHA-256)",
                    width = 140.dp,
                    isNumeric = true,
                    cellText = { it.entryHash.take(12) },
                ),
            )
        }
        ImdTable(
            rows = state.auditLogs,
            columns = cols,
            keySelector = { it.id },
        )
    }
}
