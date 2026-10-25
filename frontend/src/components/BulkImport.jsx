import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Reusable template-download + import toolbar for bulk insert/update.
 * Template downloads as Excel (.xlsx); import accepts either that file back
 * or a CSV.
 *
 * Props:
 *  - columns:   array of header names for the template (order preserved)
 *  - sample:    optional array-of-arrays of example rows (values aligned to columns)
 *  - fileName:  base name for the downloaded template
 *  - onImport:  async (rows) => { inserted, updated, failed, errors }
 *               where rows is an array of objects keyed by the header names
 *  - onDone:    optional callback fired after a successful import (e.g. reload list)
 *  - note:      optional helper text shown under the buttons
 *  - dropdowns: optional { [columnName]: string[] } \u2014 columns listed here get
 *               a real Excel in-cell dropdown (data validation) restricted to
 *               those values, for ~500 rows. The allowed lists live on a
 *               hidden "Lists" sheet (referenced by range) rather than inline
 *               in the validation formula, since Excel's inline list formula
 *               has a ~255-character limit that a 20+ option list can exceed.
 */
export default function BulkImport({ columns, sample = [], fileName = 'template', onImport, onDone, note, variant = 'panel', dropdowns }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const DATA_ROWS = 500;

  // Loaded on demand so neither library is in every page's initial bundle.
  // Only ever writes our own known-safe columns/sample/dropdown data \u2014
  // never parses untrusted input, so these libraries' unpatched
  // file-*parsing* vulnerabilities never come into play on this path.
  const downloadTemplate = async () => {
    if (dropdowns && Object.keys(dropdowns).length > 0) {
      const mod = await import('exceljs');
      const ExcelJS = mod.default?.Workbook ? mod.default : mod;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Template');
      sheet.addRow(columns);
      sheet.getRow(1).font = { bold: true };
      sample.forEach((r) => sheet.addRow(r));

      const listsSheet = workbook.addWorksheet('Lists');
      listsSheet.state = 'veryHidden';

      Object.entries(dropdowns).forEach(([colName, values], listIdx) => {
        if (!values?.length) return;
        const colIndex = columns.indexOf(colName);
        if (colIndex === -1) return;

        const listCol = listsSheet.getColumn(listIdx + 1);
        values.forEach((v, i) => { listsSheet.getCell(i + 1, listIdx + 1).value = v; });
        const listRange = `Lists!$${listCol.letter}$1:$${listCol.letter}$${values.length}`;

        const col = sheet.getColumn(colIndex + 1);
        for (let row = 2; row <= DATA_ROWS; row++) {
          sheet.getCell(row, colIndex + 1).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [listRange],
          };
        }
        col.width = Math.max(col.width || 10, colName.length + 2);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}_template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([columns, ...sample]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Template');
    XLSX.writeFile(workbook, `${fileName}_template.xlsx`);
  };

  const processRows = async (rows) => {
    try {
      const usableRows = rows.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''));
      if (usableRows.length === 0) {
        setResult({ error: 'The file has no data rows.' });
        return;
      }
      const res = await onImport(usableRows);
      setResult(res);
      if ((res.inserted || 0) + (res.updated || 0) > 0) onDone?.();
    } catch (err) {
      setResult({ error: err.response?.data?.error || err.message || 'Import failed' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setBusy(true);

    if (/\.(xlsx|xls)$/i.test(file.name)) {
      try {
        // Same trust boundary as any other data this authenticated user
        // uploads to their own account (a filled-in copy of our own template).
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        await processRows(rows);
      } catch (err) {
        setResult({ error: err.message || 'Could not read that Excel file' });
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (parsed) => processRows(parsed.data || []),
      error: (err) => {
        setResult({ error: err.message });
        setBusy(false);
      },
    });
  };

  const buttons = (
    <>
      <button type="button" className="btn-secondary" onClick={downloadTemplate} disabled={busy} title={note || 'Download Excel template'}>
        <Download size={16} /> Template
      </button>
      <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()} disabled={busy} title="Upload a filled-in CSV or Excel (.xlsx) file">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        {busy ? 'Importing...' : 'Import'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleFile}
      />
    </>
  );

  const resultBlock = result && (
    result.error ? (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>{result.error}</span>
      </div>
    ) : (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 font-medium text-emerald-800">
          <CheckCircle2 size={16} />
          Imported: {result.inserted} inserted, {result.updated} updated
          {result.failed > 0 && `, ${result.failed} failed`}
        </div>
        {result.failed > 0 && result.errors?.length > 0 && (
          <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-xs text-red-600">
            {result.errors.slice(0, 20).map((e, idx) => (
              <li key={idx}>Row {e.row}: {e.error}</li>
            ))}
          </ul>
        )}
      </div>
    )
  );

  // Inline mode: just the two buttons (for placing in a header). The result
  // shows as a dismissable fixed notice so it never disrupts the header layout.
  if (variant === 'inline') {
    return (
      <>
        <div className="flex flex-wrap gap-2">{buttons}</div>
        {result && (
          <div className="fixed bottom-6 right-6 z-[60] w-80 max-w-[90vw] animate-fade-in rounded-xl bg-white p-3 shadow-elevated">
            {resultBlock}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-700">Bulk Insert / Update</p>
          <p className="text-xs text-ink-400">
            {note || 'Download the template, fill it in, then import. Rows with an ID are updated; rows without are inserted.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">{buttons}</div>
      </div>
      {result && <div className="mt-3">{resultBlock}</div>}
    </div>
  );
}
