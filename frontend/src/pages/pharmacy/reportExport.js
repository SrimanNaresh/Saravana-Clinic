// Excel export for the Pharmacy reports. columns: [{ key, label, type? }]
// where type 'money' / 'qty' are written as numbers; rows are plain objects;
// totals (optional) is one more row in bold. ExcelJS loads only when used.
export async function exportExcel(fileName, sheetName, columns, rows, totals = null) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default?.Workbook ? mod.default : mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(10, c.label.length + 2, c.width || 0) }));
  ws.getRow(1).font = { bold: true };
  const cell = (c, v) => (c.type === 'money' || c.type === 'qty' ? (v == null || v === '' ? null : Number(v)) : v ?? '');
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, cell(c, c.value ? c.value(r) : r[c.key])])));
  if (totals) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.key in totals ? cell(c, totals[c.key]) : '']))).font = { bold: true };
  columns.forEach((c, i) => { if (c.type === 'money') ws.getColumn(i + 1).numFmt = '0.00'; });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const mmyy = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
};
