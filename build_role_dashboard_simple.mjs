import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const source = JSON.parse(await fs.readFile("source_orders.json", "utf8"));
const outputDir = path.resolve("outputs", "knitwear_warehouse");
const outputPath = path.join(outputDir, "针织服装企业仓库出入库五角色直观看板.xlsx");

const wb = Workbook.create();
const dashboard = wb.worksheets.add("五角色看板");
const detail = wb.worksheets.add("简版明细");
const settings = wb.worksheets.add("基础设置");

const colors = {
  navy: "#17324D",
  teal: "#0F766E",
  mint: "#D9F0EC",
  pale: "#F8FAFC",
  amber: "#F59E0B",
  red: "#DC2626",
  green: "#16A34A",
  gray: "#E5E7EB",
  white: "#FFFFFF",
  text: "#111827",
};

function title(sheet, range, text) {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[text]];
  r.format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white, size: 16 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  r.format.rowHeightPx = 36;
}

function band(sheet, range, text, fill = colors.mint) {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[text]];
  r.format = {
    fill,
    font: { bold: true, color: colors.navy },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
}

function styleBlock(sheet, range) {
  sheet.getRange(range).format.borders = { preset: "all", style: "thin", color: "#CBD5E1" };
}

function setWidths(sheet, widths) {
  widths.forEach((w, c) => {
    sheet.getRangeByIndexes(0, c, 1, 1).format.columnWidthPx = w;
  });
}

function parseNum(v) {
  if (v === "" || v == null) return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

function makeRows() {
  const processes = {
    "纱线": "横机",
    "面料": "裁剪",
    "辅料": "缝制/后道",
  };
  const rows = [];
  for (const b of source.bom.slice(0, 90)) {
    const order = source.orders.find(o => o.order_no === b.order_no || o.style_no === b.style_no) || {};
    const plan = parseNum(b.unit_consumption) && parseNum(b.order_qty)
      ? Math.round(parseNum(b.unit_consumption) * parseNum(b.order_qty) * (1 + Number(b.loss_rate || 0.03)) * 1000) / 1000
      : parseNum(b.source_required_qty) || "";
    const inQty = plan ? Math.round(plan * (rows.length % 5 === 0 ? 0.25 : rows.length % 4 === 0 ? 0.55 : 1) * 1000) / 1000 : "";
    const outQty = inQty ? Math.round(inQty * (rows.length % 3 === 0 ? 0.45 : 0.15) * 1000) / 1000 : "";
    rows.push([
      b.order_no,
      b.style_no,
      b.style_name,
      order.customer || "",
      b.material_type,
      b.material_name,
      b.usage_unit || (b.material_type === "纱线" ? "KG" : b.material_type === "面料" ? "M" : "PCS"),
      parseNum(b.order_qty),
      parseNum(b.unit_consumption),
      Number(b.loss_rate || 0.03),
      "",
      inQty,
      outQty,
      "",
      inQty >= plan ? "已到齐" : inQty > 0 ? "部分到料" : "未到料",
      rows.length % 11 === 0 ? "待检" : rows.length % 17 === 0 ? "不合格" : "合格",
      processes[b.material_type] || "后道",
      order.ship_date || "",
      b.material_type === "纱线" ? "生产/横机" : b.material_type === "面料" ? "仓库/裁剪" : "仓库/辅料",
      "",
      "",
    ]);
  }
  return rows;
}

title(detail, "A1:U1", "简版明细 - 一行看懂一个订单物料");
band(detail, "A3:U3", "只保留各部门共同需要的字段：订单、物料、数量、状态、预警、下一步");
const headers = [
  "合同/销售单号", "品番", "款式", "客户", "物料类型", "物料名称", "单位", "订单数", "单耗",
  "损耗率", "计划用量", "已入库", "已出库", "可用库存", "采购状态", "质检状态", "生产工序",
  "船期", "责任部门", "预警", "下一步",
];
const rows = makeRows();
detail.getRange("A4:U94").values = [headers, ...rows];
detail.getRange("A4:U4").format = {
  fill: colors.teal,
  font: { bold: true, color: colors.white },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
detail.getRange("A4:U94").format.borders = { preset: "all", style: "thin", color: "#CBD5E1" };
detail.getRange("A5:U94").format = { wrapText: true, verticalAlignment: "center" };
detail.tables.add("A4:U94", true, "SimpleDetailTable").style = "TableStyleMedium2";
detail.freezePanes.freezeRows(4);
detail.showGridLines = false;
setWidths(detail, [130, 120, 170, 90, 80, 210, 70, 80, 70, 70, 90, 90, 90, 90, 90, 90, 90, 95, 110, 100, 170]);
detail.getRange("H5:N94").setNumberFormat("0.000");
detail.getRange("J5:J94").setNumberFormat("0.0%");
detail.getRange("R5:R94").setNumberFormat("yyyy-mm-dd");
detail.getRange("K5").formulas = [["=IF(OR(H5=\"\",I5=\"\"),\"\",H5*I5*(1+J5))"]];
detail.getRange("K5:K94").fillDown();
detail.getRange("N5").formulas = [["=IF(L5=\"\",\"\",L5-M5)"]];
detail.getRange("N5:N94").fillDown();
detail.getRange("T5").formulas = [["=IF(P5=\"不合格\",\"质检异常\",IF(N5<0,\"负库存\",IF(N5<K5,\"缺料\",IF(AND(R5<>\"\",R5<=DATE(2026,7,16),O5<>\"已到齐\"),\"船期风险\",\"正常\"))))"]];
detail.getRange("T5:T94").fillDown();
detail.getRange("U5").formulas = [["=IF(T5=\"缺料\",\"采购确认到料/替代料\",IF(T5=\"质检异常\",\"质检判定/退换货\",IF(T5=\"负库存\",\"仓库复盘库存\",IF(T5=\"船期风险\",\"生产排产复核\",\"按计划执行\"))))"]];
detail.getRange("U5:U94").fillDown();
detail.getRange("E5:E94").dataValidation = { rule: { type: "list", values: ["纱线", "面料", "辅料"] } };
detail.getRange("O5:O94").dataValidation = { rule: { type: "list", values: ["未下单", "已下单", "未到料", "部分到料", "已到齐", "退换货"] } };
detail.getRange("P5:P94").dataValidation = { rule: { type: "list", values: ["待检", "合格", "不合格", "让步接收"] } };
detail.getRange("Q5:Q94").dataValidation = { rule: { type: "list", values: ["横机", "裁剪", "缝制/后道", "样衣"] } };
detail.getRange("T5:T94").conditionalFormats.add("containsText", { text: "正常", format: { fill: "#DCFCE7", font: { color: colors.green } } });
detail.getRange("T5:T94").conditionalFormats.add("containsText", { text: "缺料", format: { fill: "#FEF3C7", font: { color: "#92400E", bold: true } } });
detail.getRange("T5:T94").conditionalFormats.add("containsText", { text: "船期风险", format: { fill: "#FFEDD5", font: { color: "#9A3412", bold: true } } });
detail.getRange("T5:T94").conditionalFormats.add("containsText", { text: "质检异常", format: { fill: "#FEE2E2", font: { color: colors.red, bold: true } } });
detail.getRange("T5:T94").conditionalFormats.add("containsText", { text: "负库存", format: { fill: "#FEE2E2", font: { color: colors.red, bold: true } } });

title(settings, "A1:E1", "基础设置");
band(settings, "A3:E3", "少量下拉项，后续可按企业习惯修改");
settings.getRange("A4:E12").values = [
  ["物料类型", "单位", "采购状态", "质检状态", "生产工序"],
  ["纱线", "KG", "未下单", "待检", "横机"],
  ["面料", "M", "已下单", "合格", "裁剪"],
  ["辅料", "PCS", "未到料", "不合格", "缝制/后道"],
  ["", "Y", "部分到料", "让步接收", "样衣"],
  ["", "件", "已到齐", "", ""],
  ["", "卷", "退换货", "", ""],
  ["", "包", "", "", ""],
  ["", "G", "", "", ""],
];
settings.getRange("A4:E4").format = { fill: colors.teal, font: { bold: true, color: colors.white }, horizontalAlignment: "center" };
styleBlock(settings, "A4:E12");
settings.showGridLines = false;
setWidths(settings, [100, 100, 110, 110, 120]);

title(dashboard, "A1:O1", "针织服装企业五角色直观看板");
band(dashboard, "A3:O3", "一张表给总经理、生产、仓库、采购、质检同时看：红黄绿预警 + 下一步动作");
setWidths(dashboard, [90, 95, 95, 95, 95, 20, 100, 95, 150, 150, 90, 85, 95, 150, 120]);
dashboard.showGridLines = false;

dashboard.getRange("A5:E5").values = [["总订单/物料行", "异常行数", "缺料", "船期风险", "质检异常"]];
dashboard.getRange("A6:E6").formulas = [[
  "=COUNTA('简版明细'!$A$5:$A$94)",
  "=COUNTIF('简版明细'!$T$5:$T$94,\"<>正常\")",
  "=COUNTIF('简版明细'!$T$5:$T$94,\"缺料\")",
  "=COUNTIF('简版明细'!$T$5:$T$94,\"船期风险\")",
  "=COUNTIF('简版明细'!$T$5:$T$94,\"质检异常\")",
]];
dashboard.getRange("A5:E5").format = { fill: colors.mint, font: { bold: true, color: colors.navy }, horizontalAlignment: "center" };
dashboard.getRange("A6:E6").format = { font: { bold: true, size: 16, color: colors.navy }, horizontalAlignment: "center" };
styleBlock(dashboard, "A5:E6");

const roleBlocks = [
  ["A8:E13", "总经理", [
    ["看什么", "异常总数", "缺料款", "船期风险", "质检异常"],
    ["数量", "=B6", "=C6", "=D6", "=E6"],
    ["判断", "是否影响交期/客户", "是否要换料/加急", "是否要调整排产", "是否要退换/让步"],
    ["动作", "每日例会看红黄项", "采购给到料日期", "生产重排计划", "质检当天判定"],
  ]],
  ["G8:K13", "生产", [
    ["看什么", "横机缺料", "裁剪缺料", "缝制后道缺料", "船期风险"],
    ["数量", "=COUNTIFS('简版明细'!$Q$5:$Q$94,\"横机\",'简版明细'!$T$5:$T$94,\"缺料\")", "=COUNTIFS('简版明细'!$Q$5:$Q$94,\"裁剪\",'简版明细'!$T$5:$T$94,\"缺料\")", "=COUNTIFS('简版明细'!$Q$5:$Q$94,\"缝制/后道\",'简版明细'!$T$5:$T$94,\"缺料\")", "=D6"],
    ["判断", "横机能否开机", "裁床能否开裁", "辅料是否齐套", "是否影响船期"],
    ["动作", "只排可开工款", "缺料款不裁", "辅料到齐再上线", "调整优先级"],
  ]],
  ["A16:E21", "仓库", [
    ["看什么", "可发料", "缺料", "负库存", "待复盘"],
    ["数量", "=COUNTIFS('简版明细'!$T$5:$T$94,\"正常\")", "=C6", "=COUNTIF('简版明细'!$T$5:$T$94,\"负库存\")", "=COUNTIF('简版明细'!$U$5:$U$94,\"仓库复盘库存\")"],
    ["判断", "哪些可直接发", "哪些不能发", "账实是否异常", "是否要盘点"],
    ["动作", "按工序发料", "反馈采购/生产", "当天复盘", "补录批次库位"],
  ]],
  ["G16:K21", "采购", [
    ["看什么", "未到料", "部分到料", "缺料", "退换货"],
    ["数量", "=COUNTIF('简版明细'!$O$5:$O$94,\"未到料\")", "=COUNTIF('简版明细'!$O$5:$O$94,\"部分到料\")", "=C6", "=COUNTIF('简版明细'!$O$5:$O$94,\"退换货\")"],
    ["判断", "供应商是否延迟", "是否能先开工", "是否要加急/替代", "是否影响交期"],
    ["动作", "确认 ETA", "分批入库", "找替代料", "跟进退换"],
  ]],
  ["A24:E29", "质检", [
    ["看什么", "待检", "合格", "不合格", "让步接收"],
    ["数量", "=COUNTIF('简版明细'!$P$5:$P$94,\"待检\")", "=COUNTIF('简版明细'!$P$5:$P$94,\"合格\")", "=COUNTIF('简版明细'!$P$5:$P$94,\"不合格\")", "=COUNTIF('简版明细'!$P$5:$P$94,\"让步接收\")"],
    ["判断", "是否卡住入库", "是否可发料", "是否要退换", "是否需经理确认"],
    ["动作", "当天检完", "放行", "开异常单", "记录让步原因"],
  ]],
];

for (const [range, role, table] of roleBlocks) {
  const [start, end] = range.split(":");
  const startRow = Number(start.match(/\d+$/)[0]);
  const endCol = end.match(/^[A-Z]+/)[0];
  const col = start.match(/^[A-Z]+/)[0];
  band(dashboard, `${col}${startRow}:${endCol}${startRow}`, role, colors.mint);
  const row = startRow + 1;
  dashboard.getRange(`${col}${row}:${endCol}${row + table.length - 1}`).values = table;
  dashboard.getRange(`${col}${row}:${endCol}${row}`).format = { fill: colors.teal, font: { bold: true, color: colors.white }, horizontalAlignment: "center" };
  dashboard.getRange(`${col}${row + 1}:${endCol}${row + 1}`).format = { font: { bold: true, color: colors.navy }, horizontalAlignment: "center" };
  styleBlock(dashboard, range);
}

band(dashboard, "G24:O24", "红黄预警清单：各部门每天只处理这些行");
dashboard.getRange("G25:O25").values = [["订单号", "品番", "款式", "物料", "工序", "船期", "预警", "下一步", "责任部门"]];
dashboard.getRange("G25:O25").format = { fill: colors.teal, font: { bold: true, color: colors.white }, horizontalAlignment: "center" };
for (let i = 0; i < 20; i++) {
  const src = 5 + i;
  const dst = 26 + i;
  dashboard.getRange(`G${dst}`).formulas = [[`=IF('简版明细'!$T${src}="正常","",'简版明细'!$A${src})`]];
  dashboard.getRange(`H${dst}`).formulas = [[`=IF('简版明细'!$T${src}="正常","",'简版明细'!$B${src})`]];
  dashboard.getRange(`I${dst}`).formulas = [[`=IF('简版明细'!$T${src}="正常","",'简版明细'!$C${src})`]];
  dashboard.getRange(`J${dst}`).formulas = [[`=IF('简版明细'!$T${src}="正常","",'简版明细'!$F${src})`]];
  dashboard.getRange(`K${dst}`).formulas = [[`=IF('简版明细'!$T${src}="正常","",'简版明细'!$Q${src})`]];
  dashboard.getRange(`L${dst}`).formulas = [[`=IF('简版明细'!$T${src}="正常","",'简版明细'!$R${src})`]];
  dashboard.getRange(`M${dst}`).formulas = [[`=IF('简版明细'!$T${src}="正常","",'简版明细'!$T${src})`]];
  dashboard.getRange(`N${dst}`).formulas = [[`=IF('简版明细'!$T${src}="正常","",'简版明细'!$U${src})`]];
  dashboard.getRange(`O${dst}`).formulas = [[`=IF('简版明细'!$T${src}="正常","",'简版明细'!$S${src})`]];
}
dashboard.getRange("G25:O45").format.borders = { preset: "all", style: "thin", color: "#CBD5E1" };
dashboard.getRange("L26:L45").setNumberFormat("yyyy-mm-dd");
dashboard.getRange("M26:M45").conditionalFormats.add("containsText", { text: "缺料", format: { fill: "#FEF3C7", font: { color: "#92400E", bold: true } } });
dashboard.getRange("M26:M45").conditionalFormats.add("containsText", { text: "质检异常", format: { fill: "#FEE2E2", font: { color: colors.red, bold: true } } });
dashboard.getRange("M26:M45").conditionalFormats.add("containsText", { text: "船期风险", format: { fill: "#FFEDD5", font: { color: "#9A3412", bold: true } } });

band(dashboard, "M5:O5", "今日拍板事项");
dashboard.getRange("M6:O13").values = [
  ["1", "缺料", "采购给明确到料日或替代料"],
  ["2", "船期", "生产确认是否调优先级"],
  ["3", "质检", "不合格当天判定退换/让步"],
  ["4", "仓库", "负库存和账实不符先复盘"],
  ["", "", ""],
  ["看板原则", "红色先处理", "黄色每日跟进"],
  ["录入入口", "简版明细", "只改状态和数量"],
  ["会议节奏", "10分钟", "只看预警清单"],
];
dashboard.getRange("M6:O13").format = { wrapText: true, verticalAlignment: "center" };
dashboard.getRange("M6:M13").format = { font: { bold: true, color: colors.navy }, horizontalAlignment: "center" };
styleBlock(dashboard, "M5:O13");

await fs.mkdir(outputDir, { recursive: true });
const errors = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

for (const sheetName of ["五角色看板", "简版明细", "基础设置"]) {
  const preview = await wb.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `${sheetName}-简版.png`), new Uint8Array(await preview.arrayBuffer()));
}

const out = await SpreadsheetFile.exportXlsx(wb);
await out.save(outputPath);
console.log(outputPath);
