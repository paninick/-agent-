import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const source = JSON.parse(await fs.readFile("source_orders.json", "utf8"));
const outputDir = path.resolve("outputs", "knitwear_warehouse");
const outputPath = path.join(outputDir, "针织服装企业仓库出入库与库存预警表.xlsx");

const wb = Workbook.create();

const sheets = {
  dashboard: wb.worksheets.add("库存看板"),
  orders: wb.worksheets.add("订单主数据"),
  materials: wb.worksheets.add("物料档案"),
  bom: wb.worksheets.add("BOM用料"),
  in: wb.worksheets.add("入库明细"),
  out: wb.worksheets.add("出库明细"),
  stock: wb.worksheets.add("库存总账"),
  units: wb.worksheets.add("单位换算"),
  mapping: wb.worksheets.add("字段关联说明"),
};

const palette = {
  navy: "#17324D",
  teal: "#0F766E",
  teal2: "#D9F0EC",
  blue: "#EAF2F8",
  orange: "#F59E0B",
  red: "#DC2626",
  green: "#16A34A",
  gray: "#F3F4F6",
  border: "#D1D5DB",
  text: "#111827",
  white: "#FFFFFF",
};

function title(sheet, range, text) {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[text]];
  r.format = {
    fill: palette.navy,
    font: { bold: true, color: palette.white, size: 16 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  r.format.rowHeightPx = 34;
}

function section(sheet, range, text) {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[text]];
  r.format = {
    fill: palette.teal2,
    font: { bold: true, color: palette.navy },
    horizontalAlignment: "left",
  };
}

function writeTable(sheet, startCell, headers, rows, name, widths = []) {
  const start = sheet.getRange(startCell);
  const startRow = start.rowIndex;
  const startCol = start.columnIndex;
  const rowCount = Math.max(rows.length + 1, 2);
  const colCount = headers.length;
  const range = sheet.getRangeByIndexes(startRow, startCol, rowCount, colCount);
  const data = [headers, ...rows];
  while (data.length < rowCount) data.push(headers.map(() => ""));
  range.values = data;
  range.format.borders = { preset: "all", style: "thin", color: palette.border };
  const header = sheet.getRangeByIndexes(startRow, startCol, 1, colCount);
  header.format = {
    fill: palette.teal,
    font: { bold: true, color: palette.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
  header.format.rowHeightPx = 30;
  const body = sheet.getRangeByIndexes(startRow + 1, startCol, rowCount - 1, colCount);
  body.format = { font: { color: palette.text }, verticalAlignment: "center", wrapText: true };
  for (let c = 0; c < colCount; c++) {
    const width = widths[c] || 120;
    sheet.getRangeByIndexes(0, startCol + c, 1, 1).format.columnWidthPx = width;
  }
  const tableRange = sheet.getRangeByIndexes(startRow, startCol, rowCount, colCount);
  const table = sheet.tables.add(tableRange.address, true, name);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  sheet.freezePanes.freezeRows(startRow + 1);
  sheet.showGridLines = false;
  return { startRow, startCol, rowCount, colCount };
}

function setFormats(sheet, specs) {
  for (const [range, format] of specs) {
    sheet.getRange(range).format = format;
  }
}

function safe(v) {
  return v === undefined || v === null ? "" : v;
}

const orderHeaders = [
  "来源表", "业务员", "登记日期", "客户", "品牌", "合同/销售单号", "品番", "样品款号",
  "款式", "素材", "供应商", "订单数量", "船期", "材料采购状态", "原料到库日期",
  "辅料到库日期", "横机/毛衫工厂", "缝制/服装工厂", "后道工厂", "备注"
];
const orderRows = source.orders.map(o => [
  o.source_sheet, o.business, o.register_date, o.customer, o.brand, o.order_no, o.style_no,
  o.sample_no, o.style_name, o.material_summary, o.supplier, o.order_qty || "", o.ship_date,
  o.purchase_status, o.yarn_in_date, o.accessory_in_date, o.factory_knit, o.factory_sew,
  o.factory_finish, ""
]);
title(sheets.orders, "A1:T1", "订单主数据 - 从生产管理进度表承接");
section(sheets.orders, "A3:T3", "保留生产进度表的订单、款号、素材、供应商、数量、船期和工厂字段，供 BOM/入库/出库引用");
writeTable(sheets.orders, "A4", orderHeaders, orderRows, "OrdersTable",
  [90, 80, 95, 80, 70, 130, 130, 130, 160, 220, 100, 90, 95, 120, 100, 100, 120, 120, 100, 130]);
sheets.orders.getRange("C5:C84").setNumberFormat("yyyy-mm-dd");
sheets.orders.getRange("L5:L84").setNumberFormat("0");
sheets.orders.getRange("M5:P84").setNumberFormat("yyyy-mm-dd");

const uniqueMaterials = new Map();
for (const row of source.bom) {
  if (!row.material_code || uniqueMaterials.has(row.material_code)) continue;
  const stockUnit = row.material_type === "纱线" ? "KG" : row.material_type === "面料" ? "M" : "PCS";
  uniqueMaterials.set(row.material_code, {
    code: row.material_code,
    name: row.material_name || row.style_name || row.material_code,
    type: row.material_type,
    spec: row.spec,
    color: row.color,
    supplier: row.supplier,
    stockUnit,
    safeQty: row.material_type === "纱线" ? 30 : row.material_type === "面料" ? 80 : 100,
    leadDays: row.material_type === "纱线" ? 20 : row.material_type === "面料" ? 15 : 10,
    location: row.material_type === "纱线" ? "纱线仓-A区" : row.material_type === "面料" ? "面料仓-B区" : "辅料仓-C区",
  });
}
const materialRows = [...uniqueMaterials.values()].slice(0, 240).map(m => [
  m.code, m.name, m.type, m.spec, m.color, m.supplier, m.stockUnit, m.safeQty, m.leadDays,
  m.location, "启用", "", ""
]);
title(sheets.materials, "A1:M1", "物料档案 - 纱线 / 面料 / 辅料统一编码");
section(sheets.materials, "A3:M3", "库存主单位是所有出入库折算后的核算单位；卷、包等非固定单位可在单位换算表维护系数");
writeTable(sheets.materials, "A4",
  ["物料编码", "物料名称", "物料类型", "规格/纱支/门幅", "颜色/缸号", "默认供应商", "库存主单位", "安全库存", "采购提前期(天)", "默认库位", "状态", "替代料", "备注"],
  materialRows, "MaterialsTable",
  [90, 220, 80, 130, 100, 110, 90, 90, 110, 120, 70, 120, 150]);
sheets.materials.getRange("H5:I244").setNumberFormat("0");
sheets.materials.getRange("C5:C244").dataValidation = { rule: { type: "list", values: ["纱线", "面料", "辅料", "半成品", "成衣"] } };
sheets.materials.getRange("G5:G244").dataValidation = { rule: { type: "list", values: ["KG", "G", "M", "Y", "PCS", "件", "卷", "包"] } };
sheets.materials.getRange("K5:K244").dataValidation = { rule: { type: "list", values: ["启用", "停用"] } };

const bomRows = source.bom.slice(0, 240).map((b, idx) => [
  b.bom_id, b.order_no, b.style_no, b.style_name, b.material_code, b.material_name, b.material_type,
  b.spec, b.color, b.usage_unit, b.unit_consumption || "", b.order_qty || "", b.loss_rate,
  "", b.source_required_qty || "", b.supplier, "生产进度表拆分", idx < 12 ? "示例：素材/数量/单耗含 + 时已拆成多行" : ""
]);
title(sheets.bom, "A1:R1", "BOM用料 - 订单需求与损耗计算");
section(sheets.bom, "A3:R3", "计划用量 = 订单数量 × 单耗 × (1 + 损耗率)；若源表已有原料数量，可放在“源表需求量”做核对");
writeTable(sheets.bom, "A4",
  ["BOM编号", "合同/销售单号", "品番", "款式", "物料编码", "物料名称", "物料类型", "规格", "颜色", "用量单位", "单耗", "订单数量", "损耗率", "计划用量", "源表需求量", "供应商", "来源", "备注"],
  bomRows, "BomTable",
  [95, 130, 120, 160, 90, 220, 80, 100, 80, 80, 80, 90, 80, 95, 95, 100, 100, 220]);
sheets.bom.getRange("K5:N244").setNumberFormat("0.000");
sheets.bom.getRange("M5:M244").setNumberFormat("0.0%");
sheets.bom.getRange("N5").formulas = [["=IF(OR(K5=\"\",L5=\"\"),\"\",K5*L5*(1+M5))"]];
sheets.bom.getRange("N5:N244").fillDown();
sheets.bom.getRange("G5:G244").dataValidation = { rule: { type: "list", values: ["纱线", "面料", "辅料", "半成品", "成衣"] } };

const unitRows = [
  ["KG", "KG", "KG|KG", 1, "纱线主单位"],
  ["G", "KG", "G|KG", 0.001, "克转千克"],
  ["M", "M", "M|M", 1, "面料米数主单位"],
  ["Y", "M", "Y|M", 0.9144, "码转米"],
  ["PCS", "PCS", "PCS|PCS", 1, "件数主单位"],
  ["件", "PCS", "件|PCS", 1, "中文件数"],
  ["包", "PCS", "包|PCS", 100, "按每包 100 件示例，可修改"],
  ["卷", "M", "卷|M", 50, "按每卷 50 米示例，可按物料修改"],
  ["筒", "KG", "筒|KG", 1, "纱线筒重不固定时，在入库行手工填 KG"],
];
title(sheets.units, "A1:E1", "单位换算 - 原单位折算为库存主单位");
section(sheets.units, "A3:E3", "出入库数量 × 换算系数 = 主单位数量；若卷/包规格不固定，建议入库时直接填实际 KG/M/PCS");
writeTable(sheets.units, "A4", ["原单位", "库存主单位", "换算键", "换算系数", "说明"], unitRows, "UnitTable",
  [90, 100, 110, 90, 260]);
sheets.units.getRange("D5:D30").setNumberFormat("0.0000");

const inRows = source.bom.slice(0, 20).map((b, idx) => {
  const mainUnit = uniqueMaterials.get(b.material_code)?.stockUnit || b.usage_unit || "KG";
  const qty = b.source_required_qty || (b.unit_consumption && b.order_qty ? b.unit_consumption * b.order_qty : "");
  return [
    `IN-${String(idx + 1).padStart(4, "0")}`, "2026-06-16", idx % 3 === 0 ? "采购入库" : "生产进度到料",
    b.supplier, b.order_no, b.style_no, b.material_code, b.material_name, b.material_type, "",
    b.usage_unit || mainUnit, qty, mainUnit, "", "", uniqueMaterials.get(b.material_code)?.location || "",
    "待检", ""
  ];
});
title(sheets.in, "A1:R1", "入库明细 - 采购/退料/调拨/盘盈");
section(sheets.in, "A3:R3", "填原单位和数量，系统按物料档案的库存主单位与单位换算表折算；质检不合格可不计可用库存");
writeTable(sheets.in, "A4",
  ["入库单号", "入库日期", "入库类型", "来源/供应商", "合同/销售单号", "品番", "物料编码", "物料名称", "物料类型", "批次/色号", "原单位", "入库数量", "库存主单位", "换算系数", "主单位数量", "库位", "质检状态", "备注"],
  inRows, "InTable",
  [95, 95, 110, 120, 130, 120, 90, 220, 80, 100, 80, 90, 90, 80, 100, 120, 90, 160]);
sheets.in.getRange("B5:B204").setNumberFormat("yyyy-mm-dd");
sheets.in.getRange("L5:O204").setNumberFormat("0.000");
sheets.in.getRange("C5:C204").dataValidation = { rule: { type: "list", values: ["采购入库", "生产进度到料", "退料入库", "调拨入库", "盘盈"] } };
sheets.in.getRange("Q5:Q204").dataValidation = { rule: { type: "list", values: ["待检", "合格", "让步接收", "不合格", "退货"] } };
sheets.in.getRange("N5").formulas = [["=IFERROR(XLOOKUP(K5&\"|\"&M5,'单位换算'!$C$5:$C$30,'单位换算'!$D$5:$D$30),1)"]];
sheets.in.getRange("N5:N204").fillDown();
sheets.in.getRange("O5").formulas = [["=IF(L5=\"\",\"\",L5*N5)"]];
sheets.in.getRange("O5:O204").fillDown();

const processCycle = ["横机领料", "裁剪领料", "缝制辅料", "后道领料", "样衣领料"];
const outRows = source.bom.slice(0, 18).map((b, idx) => {
  const mainUnit = uniqueMaterials.get(b.material_code)?.stockUnit || b.usage_unit || "KG";
  const qty = b.unit_consumption && b.order_qty ? Math.round((b.unit_consumption * b.order_qty * 0.45) * 1000) / 1000 : "";
  return [
    `OUT-${String(idx + 1).padStart(4, "0")}`, "2026-06-16", processCycle[idx % processCycle.length],
    idx % 2 === 0 ? "横机车间" : "裁剪/缝制车间", b.order_no, b.style_no, b.material_code,
    b.material_name, b.material_type, "", b.usage_unit || mainUnit, qty, mainUnit, "", "",
    idx % 2 === 0 ? "按订单领料" : "裁片/辅料领用", "", ""
  ];
});
title(sheets.out, "A1:R1", "出库明细 - 横机 / 裁剪 / 缝制 / 后道领料");
section(sheets.out, "A3:R3", "按工序登记领料；纱线多为横机领料，面料多为裁剪领料，辅料多为缝制/后道领料");
writeTable(sheets.out, "A4",
  ["出库单号", "出库日期", "领用工序", "去向/工厂", "合同/销售单号", "品番", "物料编码", "物料名称", "物料类型", "批次/色号", "原单位", "出库数量", "库存主单位", "换算系数", "主单位数量", "用途/裁片/床次", "负责人", "备注"],
  outRows, "OutTable",
  [95, 95, 110, 120, 130, 120, 90, 220, 80, 100, 80, 90, 90, 80, 100, 140, 90, 160]);
sheets.out.getRange("B5:B204").setNumberFormat("yyyy-mm-dd");
sheets.out.getRange("L5:O204").setNumberFormat("0.000");
sheets.out.getRange("C5:C204").dataValidation = { rule: { type: "list", values: processCycle } };
sheets.out.getRange("N5").formulas = [["=IFERROR(XLOOKUP(K5&\"|\"&M5,'单位换算'!$C$5:$C$30,'单位换算'!$D$5:$D$30),1)"]];
sheets.out.getRange("N5:N204").fillDown();
sheets.out.getRange("O5").formulas = [["=IF(L5=\"\",\"\",L5*N5)"]];
sheets.out.getRange("O5:O204").fillDown();

const stockRows = [...uniqueMaterials.values()].slice(0, 160).map(m => [
  m.code, m.name, m.type, m.stockUnit, m.safeQty, "", "", "", "", "", "", "", m.leadDays, m.location, m.supplier
]);
title(sheets.stock, "A1:O1", "库存总账 - 自动汇总库存、订单需求和预警");
section(sheets.stock, "A3:O3", "可用库存 = 合格入库 - 出库；预警综合负库存、安全库存、订单缺料和采购提前期");
writeTable(sheets.stock, "A4",
  ["物料编码", "物料名称", "物料类型", "库存主单位", "安全库存", "订单需求", "合格入库", "已出库", "账面库存", "可用缺口", "预警状态", "建议补货量", "采购提前期(天)", "库位", "默认供应商"],
  stockRows, "StockTable",
  [90, 220, 80, 90, 90, 100, 100, 100, 100, 100, 120, 100, 110, 120, 120]);
sheets.stock.getRange("E5:J164").setNumberFormat("0.000");
sheets.stock.getRange("L5:M164").setNumberFormat("0");
sheets.stock.getRange("F5").formulas = [["=SUMIFS('BOM用料'!$N$5:$N$244,'BOM用料'!$E$5:$E$244,A5)"]];
sheets.stock.getRange("G5").formulas = [["=SUMIFS('入库明细'!$O$5:$O$204,'入库明细'!$G$5:$G$204,A5,'入库明细'!$Q$5:$Q$204,\"<>不合格\",'入库明细'!$Q$5:$Q$204,\"<>退货\")"]];
sheets.stock.getRange("H5").formulas = [["=SUMIFS('出库明细'!$O$5:$O$204,'出库明细'!$G$5:$G$204,A5)"]];
sheets.stock.getRange("I5").formulas = [["=G5-H5"]];
sheets.stock.getRange("J5").formulas = [["=I5-F5"]];
sheets.stock.getRange("K5").formulas = [["=IF(I5<0,\"负库存\",IF(I5<E5,\"低于安全库存\",IF(J5<0,\"订单缺料\",\"正常\")))"]];
sheets.stock.getRange("L5").formulas = [["=IF(K5=\"正常\",0,MAX(E5+F5-I5,0))"]];
sheets.stock.getRange("F5:L164").fillDown();
const warningRange = sheets.stock.getRange("K5:K164");
warningRange.conditionalFormats.add("containsText", { text: "负库存", format: { fill: "#FEE2E2", font: { color: palette.red, bold: true } } });
warningRange.conditionalFormats.add("containsText", { text: "订单缺料", format: { fill: "#FEF3C7", font: { color: "#92400E", bold: true } } });
warningRange.conditionalFormats.add("containsText", { text: "低于安全库存", format: { fill: "#FFEDD5", font: { color: "#9A3412", bold: true } } });
warningRange.conditionalFormats.add("containsText", { text: "正常", format: { fill: "#DCFCE7", font: { color: palette.green } } });

title(sheets.mapping, "A1:F1", "字段关联说明 - 生产进度表到仓库表");
const mappingRows = [
  ["生产进度表字段", "进入仓库表", "用途", "是否必填", "说明", "建议"],
  ["合同/销售单号", "订单主数据、BOM、入库、出库", "订单级关联键", "建议必填", "没有销售单号时可临时用品番/样品款号", "后续最好统一生成订单号"],
  ["大货款号/品番", "订单主数据、BOM、出入库", "款式级关联键", "必填", "同一订单多款时靠品番区分", "保持与生产进度表一致"],
  ["素材", "BOM用料、物料档案", "拆分纱线/面料/辅料", "必填", "含 + 时拆成多行物料", "建议后续维护标准物料编码"],
  ["供应商", "物料档案、入库明细", "采购来源", "建议必填", "支持多供应商时写默认供应商", "入库时可覆盖"],
  ["原料数量", "BOM源表需求量、入库参考", "采购/到料核对", "建议必填", "源表中 980+10 会拆成多行", "与计划用量对比差异"],
  ["单位", "BOM用量单位、出入库原单位", "单位换算", "必填", "支持 KG/M/Y/PCS/件/卷/包", "不固定包装用实际主单位录入"],
  ["订单数量", "BOM计划用量", "需求计算", "必填", "计划用量=订单数量*单耗*(1+损耗率)", "损耗率按物料类型默认可改"],
  ["单耗", "BOM计划用量", "材料需求", "必填", "含 + 时跟素材拆分", "纱线、罗纹、主面料分别维护"],
  ["原料到库日期/辅料到库日期", "入库计划与预警", "到料跟踪", "建议必填", "可用于延期预警", "后续可增加 ETA 与逾期天数"],
  ["毛衫工厂/服装工厂/后道工厂", "出库去向", "工序领料", "建议必填", "横机、裁剪、缝制、后道对应领料去向", "利于追踪外发库存"],
];
sheets.mapping.getRange("A3:F13").values = mappingRows;
sheets.mapping.getRange("A3:F3").format = { fill: palette.teal, font: { bold: true, color: palette.white }, horizontalAlignment: "center" };
sheets.mapping.getRange("A3:F13").format.borders = { preset: "all", style: "thin", color: palette.border };
for (let c = 0; c < 6; c++) sheets.mapping.getRangeByIndexes(0, c, 1, 1).format.columnWidthPx = [150, 170, 130, 80, 220, 220][c];
sheets.mapping.showGridLines = false;

title(sheets.dashboard, "A1:N1", "针织服装企业库存看板");
section(sheets.dashboard, "A3:N3", "自动汇总纱线、面料、辅料库存与预警；适用于横机、裁剪、缝制、后道领料");
const cardLabels = [["物料总数", "预警物料", "订单缺料", "负库存"]];
const cardFormulas = [["=COUNTA('库存总账'!$A$5:$A$164)", "=COUNTIF('库存总账'!$K$5:$K$164,\"<>正常\")", "=COUNTIF('库存总账'!$K$5:$K$164,\"订单缺料\")", "=COUNTIF('库存总账'!$K$5:$K$164,\"负库存\")"]];
sheets.dashboard.getRange("A5:D5").values = cardLabels;
sheets.dashboard.getRange("A6:D6").formulas = cardFormulas;
sheets.dashboard.getRange("A5:D5").format = { fill: palette.teal2, font: { bold: true, color: palette.navy }, horizontalAlignment: "center" };
sheets.dashboard.getRange("A6:D6").format = { fill: palette.white, font: { bold: true, color: palette.navy, size: 16 }, horizontalAlignment: "center" };
sheets.dashboard.getRange("A5:D6").format.borders = { preset: "all", style: "thin", color: palette.border };

section(sheets.dashboard, "A8:F8", "按物料类型汇总");
sheets.dashboard.getRange("A9:F12").values = [
  ["物料类型", "订单需求", "合格入库", "已出库", "账面库存", "预警数"],
  ["纱线", "", "", "", "", ""],
  ["面料", "", "", "", "", ""],
  ["辅料", "", "", "", "", ""],
];
sheets.dashboard.getRange("B10").formulas = [["=SUMIFS('库存总账'!$F$5:$F$164,'库存总账'!$C$5:$C$164,A10)"]];
sheets.dashboard.getRange("C10").formulas = [["=SUMIFS('库存总账'!$G$5:$G$164,'库存总账'!$C$5:$C$164,A10)"]];
sheets.dashboard.getRange("D10").formulas = [["=SUMIFS('库存总账'!$H$5:$H$164,'库存总账'!$C$5:$C$164,A10)"]];
sheets.dashboard.getRange("E10").formulas = [["=SUMIFS('库存总账'!$I$5:$I$164,'库存总账'!$C$5:$C$164,A10)"]];
sheets.dashboard.getRange("F10").formulas = [["=COUNTIFS('库存总账'!$C$5:$C$164,A10,'库存总账'!$K$5:$K$164,\"<>正常\")"]];
sheets.dashboard.getRange("B10:F12").fillDown();
sheets.dashboard.getRange("A9:F9").format = { fill: palette.teal, font: { bold: true, color: palette.white }, horizontalAlignment: "center" };
sheets.dashboard.getRange("A9:F12").format.borders = { preset: "all", style: "thin", color: palette.border };
sheets.dashboard.getRange("B10:E12").setNumberFormat("0.000");
sheets.dashboard.getRange("F10:F12").setNumberFormat("0");

section(sheets.dashboard, "H8:N8", "预警清单 Top 20");
sheets.dashboard.getRange("H9:N9").values = [["物料编码", "物料名称", "类型", "库存", "订单需求", "预警状态", "建议补货"]];
sheets.dashboard.getRange("H9:N9").format = { fill: palette.teal, font: { bold: true, color: palette.white }, horizontalAlignment: "center" };
for (let i = 0; i < 20; i++) {
  const src = 5 + i;
  const dest = 10 + i;
  sheets.dashboard.getRange(`H${dest}`).formulas = [[`=IF('库存总账'!$K${src}="正常","",'库存总账'!$A${src})`]];
  sheets.dashboard.getRange(`I${dest}`).formulas = [[`=IF('库存总账'!$K${src}="正常","",'库存总账'!$B${src})`]];
  sheets.dashboard.getRange(`J${dest}`).formulas = [[`=IF('库存总账'!$K${src}="正常","",'库存总账'!$C${src})`]];
  sheets.dashboard.getRange(`K${dest}`).formulas = [[`=IF('库存总账'!$K${src}="正常","",'库存总账'!$I${src})`]];
  sheets.dashboard.getRange(`L${dest}`).formulas = [[`=IF('库存总账'!$K${src}="正常","",'库存总账'!$F${src})`]];
  sheets.dashboard.getRange(`M${dest}`).formulas = [[`=IF('库存总账'!$K${src}="正常","",'库存总账'!$K${src})`]];
  sheets.dashboard.getRange(`N${dest}`).formulas = [[`=IF('库存总账'!$K${src}="正常","",'库存总账'!$L${src})`]];
}
sheets.dashboard.getRange("H9:N29").format.borders = { preset: "all", style: "thin", color: palette.border };
sheets.dashboard.getRange("K10:L29").setNumberFormat("0.000");
sheets.dashboard.getRange("N10:N29").setNumberFormat("0");
sheets.dashboard.showGridLines = false;
for (let c = 0; c < 14; c++) sheets.dashboard.getRangeByIndexes(0, c, 1, 1).format.columnWidthPx = [100, 100, 100, 100, 100, 100, 20, 90, 220, 70, 90, 90, 100, 90][c] || 100;

const chart = sheets.dashboard.charts.add("bar", sheets.dashboard.getRange("A9:F12"));
chart.title = "订单需求、入库、出库与库存";
chart.hasLegend = true;
chart.setPosition("A15", "F30");

await fs.mkdir(outputDir, { recursive: true });

const scan = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "formula error scan before export",
});
console.log(scan.ndjson);

for (const sheetName of Object.keys(sheets).map(k => sheets[k].name)) {
  try {
    const preview = await wb.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    await fs.writeFile(path.join(outputDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
  } catch (error) {
    console.log(`render skipped ${sheetName}: ${error.message}`);
  }
}

const out = await SpreadsheetFile.exportXlsx(wb);
await out.save(outputPath);
console.log(outputPath);
