package com.imdad.erp.core.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.ViewAgenda
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imdad.erp.core.theme.ImdBp
import com.imdad.erp.core.theme.ImdFormat
import com.imdad.erp.core.theme.ImdTheme

enum class ImdButtonVariant { Primary, Secondary, Orange, Danger, Ghost }
enum class ImdStatusTone { Success, Danger, Warn, Info, Muted }

@Composable
fun ImdButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ImdButtonVariant = ImdButtonVariant.Secondary,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    val colors = ImdTheme.colors
    val density = ImdTheme.density
    val radius = if (ImdTheme.isClassicFlat) 2.dp else 6.dp

    val (bg, fg, borderCol) = when (variant) {
        ImdButtonVariant.Primary -> Triple(colors.accent, colors.onAccent, colors.accent)
        ImdButtonVariant.Orange -> Triple(Color(0xFFF39C12), Color(0xFF2B1A00), Color(0xFFE08E0B))
        ImdButtonVariant.Danger -> Triple(colors.danger, Color.White, colors.danger)
        ImdButtonVariant.Secondary -> Triple(colors.surface, colors.text, colors.lineStrong)
        ImdButtonVariant.Ghost -> Triple(Color.Transparent, colors.text2, Color.Transparent)
    }

    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(radius),
        border = BorderStroke(1.dp, borderCol),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = bg,
            contentColor = fg,
            disabledContainerColor = bg.copy(alpha = 0.45f),
            disabledContentColor = fg.copy(alpha = 0.45f),
        ),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp),
        modifier = modifier.heightIn(min = density.controlHeight),
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.width(6.dp))
        }
        Text(
            text = text,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
    }
}

@Composable
fun ImdTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    isNumeric: Boolean = false,
    enabled: Boolean = true,
    trailingIcon: (@Composable () -> Unit)? = null,
) {
    val colors = ImdTheme.colors
    val density = ImdTheme.density
    val radius = if (ImdTheme.isClassicFlat) 2.dp else 6.dp

    Column(modifier = modifier) {
        if (label.isNotEmpty()) {
            Text(
                text = label,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = colors.text2,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }
        Box(
            contentAlignment = Alignment.CenterStart,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = density.controlHeight)
                .background(colors.fieldFill, RoundedCornerShape(radius))
                .border(1.dp, colors.lineStrong, RoundedCornerShape(radius))
                .padding(horizontal = 10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    if (value.isEmpty() && placeholder.isNotEmpty()) {
                        Text(
                            text = placeholder,
                            fontSize = 13.sp,
                            color = colors.muted,
                        )
                    }
                    BasicTextField(
                        value = value,
                        onValueChange = { raw ->
                            onValueChange(if (isNumeric) ImdFormat.normalizeDigits(raw) else raw)
                        },
                        enabled = enabled,
                        singleLine = true,
                        textStyle = TextStyle(
                            color = colors.text,
                            fontSize = 13.sp,
                            fontFamily = if (isNumeric) FontFamily.Monospace else FontFamily.SansSerif,
                        ),
                        cursorBrush = SolidColor(colors.accent),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = if (isNumeric) KeyboardType.Decimal else KeyboardType.Text
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                if (trailingIcon != null) {
                    trailingIcon()
                }
            }
        }
    }
}

@Composable
fun ImdBarcodeField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    onOpenCameraScanner: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        ImdTextField(
            label = label,
            value = value,
            onValueChange = onValueChange,
            placeholder = "امسح بالكاميرا أو أدخل الباركود...",
            modifier = Modifier.weight(1f),
        )
        ImdButton(
            text = "كاميرا",
            icon = Icons.Default.QrCodeScanner,
            variant = ImdButtonVariant.Secondary,
            onClick = onOpenCameraScanner,
        )
    }
}

@Composable
fun ImdPanel(
    title: String? = null,
    subtitle: String? = null,
    headerRight: (@Composable () -> Unit)? = null,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val colors = ImdTheme.colors
    val radius = if (ImdTheme.isClassicFlat) 2.dp else 10.dp

    Surface(
        color = colors.surface,
        shape = RoundedCornerShape(radius),
        border = BorderStroke(1.dp, colors.line),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column {
            if (title != null || headerRight != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colors.panelFill)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        if (title != null) {
                            Text(
                                text = title,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = colors.text,
                            )
                        }
                        if (subtitle != null) {
                            Text(
                                text = subtitle,
                                fontSize = 11.sp,
                                color = colors.muted,
                            )
                        }
                    }
                    if (headerRight != null) {
                        headerRight()
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(colors.line)
                )
            }
            Column(modifier = Modifier.padding(14.dp)) {
                content()
            }
        }
    }
}

@Composable
fun ImdKpiCard(
    label: String,
    value: String,
    meta: String? = null,
    tone: ImdStatusTone = ImdStatusTone.Success,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val colors = ImdTheme.colors
    val radius = if (ImdTheme.isClassicFlat) 2.dp else 10.dp
    val accentColor = when (tone) {
        ImdStatusTone.Success -> colors.accent
        ImdStatusTone.Danger -> colors.danger
        ImdStatusTone.Warn -> colors.warn
        ImdStatusTone.Info -> colors.info
        ImdStatusTone.Muted -> colors.text
    }

    Surface(
        color = colors.surface,
        shape = RoundedCornerShape(radius),
        border = BorderStroke(1.dp, colors.line),
        modifier = modifier
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = label,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = colors.muted,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = value,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                color = accentColor,
            )
            if (meta != null) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = meta,
                    fontSize = 11.sp,
                    color = colors.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * Zero-Pill Semantic Status Indicator (Plain bold colored text, never a rounded capsule/pill)
 */
@Composable
fun ImdStatusText(
    label: String,
    tone: ImdStatusTone = ImdStatusTone.Muted,
) {
    val colors = ImdTheme.colors
    val fg = when (tone) {
        ImdStatusTone.Success -> colors.success
        ImdStatusTone.Danger -> colors.danger
        ImdStatusTone.Warn -> colors.warn
        ImdStatusTone.Info -> colors.info
        ImdStatusTone.Muted -> colors.muted
    }
    Text(
        text = label,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        color = fg,
    )
}

/**
 * Column specification for ImdTable (Sticky Header + Sorting + Automatic Table/Card switching at 900.dp)
 */
data class ImdTableColumn<T>(
    val key: String,
    val header: String,
    val width: Dp = 130.dp,
    val isNumeric: Boolean = false,
    val sortExtractor: ((T) -> Comparable<*>)? = null,
    val cellText: (T) -> String,
    val cellContent: (@Composable (T) -> Unit)? = null,
)

enum class SortOrder { Asc, Desc }

/**
 * ImdTable in Jetpack Compose:
 * - Supports Sticky Header (stickyHeader in LazyColumn)
 * - Supports ascending/descending column sorting
 * - Automatically switches between Table View (> 900.dp Android Tablet) and Touch Card View (<= 900.dp Android Phone)
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun <T> ImdTable(
    rows: List<T>,
    columns: List<ImdTableColumn<T>>,
    keySelector: (T) -> Any,
    modifier: Modifier = Modifier,
    searchPlaceholder: String = "بحث سريع في السجلات...",
    onRowClick: ((T) -> Unit)? = null,
) {
    val colors = ImdTheme.colors
    val density = ImdTheme.density
    val radius = if (ImdTheme.isClassicFlat) 2.dp else 8.dp

    var searchQuery by remember { mutableStateOf("") }
    var sortColKey by remember { mutableStateOf<String?>(null) }
    var sortOrder by remember { mutableStateOf(SortOrder.Asc) }
    var manualCardOverride by remember { mutableStateOf<Boolean?>(null) }

    val filteredAndSorted = remember(rows, searchQuery, sortColKey, sortOrder, columns) {
        val q = searchQuery.trim().lowercase()
        val matched = if (q.isEmpty()) {
            rows
        } else {
            rows.filter { row ->
                columns.any { col -> col.cellText(row).lowercase().contains(q) }
            }
        }

        val activeCol = columns.find { it.key == sortColKey }
        val extractor = activeCol?.sortExtractor
        if (extractor == null) {
            matched
        } else {
            @Suppress("UNCHECKED_CAST")
            val comparator = Comparator<T> { a, b ->
                val va = extractor(a) as Comparable<Any>
                val vb = extractor(b) as Comparable<Any>
                va.compareTo(vb)
            }
            if (sortOrder == SortOrder.Asc) matched.sortedWith(comparator)
            else matched.sortedWith(comparator.reversed())
        }
    }

    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        val isCompactPhone = ImdBp.isPhone(maxWidth)
        val renderAsCards = manualCardOverride ?: isCompactPhone

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // Toolbar: Search + Count + Manual Table/Card Toggle
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                ImdTextField(
                    label = "",
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = searchPlaceholder,
                    trailingIcon = {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            tint = colors.muted,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                    modifier = Modifier.weight(1f),
                )

                IconButton(
                    onClick = { manualCardOverride = !renderAsCards },
                    modifier = Modifier
                        .size(density.controlHeight)
                        .border(1.dp, colors.lineStrong, RoundedCornerShape(radius))
                        .background(colors.surface, RoundedCornerShape(radius)),
                ) {
                    Icon(
                        imageVector = if (renderAsCards) Icons.Default.TableChart else Icons.Default.ViewAgenda,
                        contentDescription = "تبديل عرض الجدول / البطاقات",
                        tint = colors.text2,
                    )
                }
            }

            if (renderAsCards) {
                // Android Phone Card Layout (<= 900.dp)
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 540.dp),
                ) {
                    itemsIndexed(
                        items = filteredAndSorted,
                        key = { _, item -> keySelector(item) },
                    ) { _, row ->
                        Surface(
                            color = colors.surface,
                            shape = RoundedCornerShape(radius),
                            border = BorderStroke(1.dp, colors.lineStrong),
                            modifier = Modifier
                                .fillMaxWidth()
                                .then(
                                    if (onRowClick != null) Modifier.clickable { onRowClick(row) }
                                    else Modifier
                                ),
                        ) {
                            Column(
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.padding(12.dp),
                            ) {
                                columns.forEachIndexed { idx, col ->
                                    Row(
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text(
                                            text = col.header,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = colors.muted,
                                        )
                                        if (col.cellContent != null) {
                                            col.cellContent.invoke(row)
                                        } else {
                                            Text(
                                                text = col.cellText(row),
                                                fontSize = if (idx == 0) 13.sp else 12.sp,
                                                fontWeight = if (idx == 0) FontWeight.Bold else FontWeight.SemiBold,
                                                fontFamily = if (col.isNumeric) FontFamily.Monospace else FontFamily.SansSerif,
                                                color = colors.text,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // Android Tablet Sticky-Header Table Layout (> 900.dp)
                val hScroll = rememberScrollState()
                Surface(
                    color = colors.surface,
                    shape = RoundedCornerShape(radius),
                    border = BorderStroke(1.dp, colors.lineStrong),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 540.dp)
                            .horizontalScroll(hScroll),
                    ) {
                        stickyHeader {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .background(colors.tableHead)
                                    .border(BorderStroke(0.5.dp, colors.lineStrong))
                                    .padding(vertical = density.cellPadV, horizontal = 8.dp),
                            ) {
                                columns.forEach { col ->
                                    val isSorted = sortColKey == col.key
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier
                                            .width(col.width)
                                            .clickable(enabled = col.sortExtractor != null) {
                                                if (sortColKey == col.key) {
                                                    sortOrder =
                                                        if (sortOrder == SortOrder.Asc) SortOrder.Desc else SortOrder.Asc
                                                } else {
                                                    sortColKey = col.key
                                                    sortOrder = SortOrder.Asc
                                                }
                                            }
                                            .padding(horizontal = 6.dp),
                                    ) {
                                        Text(
                                            text = col.header,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isSorted) colors.accent else colors.text2,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        if (isSorted) {
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Icon(
                                                imageVector = if (sortOrder == SortOrder.Asc)
                                                    Icons.Default.ArrowUpward
                                                else
                                                    Icons.Default.ArrowDownward,
                                                contentDescription = null,
                                                tint = colors.accent,
                                                modifier = Modifier.size(13.dp),
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        itemsIndexed(
                            items = filteredAndSorted,
                            key = { _, item -> keySelector(item) },
                        ) { index, row ->
                            val rowBg = if (index % 2 == 0) colors.surface else colors.panelFill
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .background(rowBg)
                                    .then(
                                        if (onRowClick != null) Modifier.clickable { onRowClick(row) }
                                        else Modifier
                                    )
                                    .padding(vertical = density.cellPadV, horizontal = 8.dp),
                            ) {
                                columns.forEach { col ->
                                    Box(
                                        modifier = Modifier
                                            .width(col.width)
                                            .padding(horizontal = 6.dp),
                                    ) {
                                        if (col.cellContent != null) {
                                            col.cellContent.invoke(row)
                                        } else {
                                            Text(
                                                text = col.cellText(row),
                                                fontSize = 12.sp,
                                                fontFamily = if (col.isNumeric) FontFamily.Monospace else FontFamily.SansSerif,
                                                color = colors.text,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
