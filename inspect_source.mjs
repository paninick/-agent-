import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "D:/Downloads/生产管理进度一览表.xlsx";
const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 12000,
  tableMaxRows: 8,
  tableMaxCols: 20,
  tableMaxCellChars: 80,
});

console.log(summary.ndjson);
