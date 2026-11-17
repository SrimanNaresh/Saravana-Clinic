import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageX, Printer, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, pharmacyReportApi } from '../../api/client.js';
import { exportExcel, money, qty } from './reportExport.js';

const COLUMNS = [
  { key: 'ItemCode', label: 'Item Code' },
  { key: 'Name', label: 'Item Name', width: 30 },
  { key: 'Category', label: 'Category', width: 16 },
  { key: 'Pack', label: 'Pack' },
  { key: 'Stock', label: 'Stock', type: 'qty' },
  { key: 'Level', label: 'Re-order Level', type: 'qty' },
  { key: 'ShortBy', label: 'Short by', type: 'qty' },
  { key: 'VendorName', label: 'Last Vendor', width: 24 },
  { key: 'LastPRate', label: 'Last P.Rate', type: 'money' },
];

// Pharmacy > Report > Low Stock: active items at or below their Re-order
// Level (5 packs when the item has none). Works as an order list.
export default function LowStockReport() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [all, setAll] = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    pharmacyItemApi.list()
      .then((items) => setCategories([...new Set(items.map((i) => i.Category).filter(Boolean))].sort()))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await pharmacyReportApi.lowStock({ category, all: all ? '1' : '' }));
    } catch {
      show('Failed to load the low stock list', 'error');
    } finally {
      setLoading(false);
    }
  }, [category, all, show]);
  useEffect(() => { load(); }, [load]);

  const outCount = useMemo(() => rows.filter((r) => r.Stock <= 0).length, [rows]);

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={PackageX}
          title="Low Stock"
          subtitle={`${rows.length} item(s) at or below their Re-order Level · ${outCount} out of stock`}
          actions={(
            <div className="no-print flex flex-wrap items-center gap-2">
              <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-ink-600" title="Also list items that were never in stock">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Never stocked too
              </label>
              <button type="button" className="btn-secondary" title="Reload" onClick={load}><RefreshCw size={15} /></button>
              <button type="button" className="btn-secondary" disabled={!rows.length} onClick={() => exportExcel('Low-Stock', 'Low Stock', COLUMNS, rows)}>
                <FileSpreadsheet size={15} /> Excel
              </button>
              <button type="button" className="btn-secondary" disabled={!rows.length} onClick={() => window.print()}><Printer size={15} /> Print</button>
            </div>
          )}
        />
        <p className="no-print mb-2 text-xs text-ink-500">Set an item&apos;s Re-order Level on Item Master or Bulk Update (empty = 5 packs). Click a row to open the item.</p>

        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState message="No item is low on stock." /> : (
          <div className="ph-wrap">
            <table className="ph-table min-w-[900px]">
              <colgroup>
                <col className="w-[9%]" /><col className="w-[26%]" /><col className="w-[12%]" /><col className="w-[7%]" /><col className="w-[7%]" />
                <col className="w-[8%]" /><col className="w-[7%]" /><col className="w-[16%]" /><col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="ph-mid">Item Code</th><th>Item Name</th><th>Category</th><th className="ph-mid">Pack</th><th className="ph-num">Stock</th>
                  <th className="ph-num" title="Empty on the item = 5">Re-order Level</th><th className="ph-num">Short by</th><th>Last Vendor</th><th className="ph-num">Last P.Rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ItemId} className="cursor-pointer" title="Open the item" onClick={() => navigate('/pharmacy/item', { state: { editItemId: r.ItemId } })}>
                    <td className="ph-mid text-ink-500">{r.ItemCode}</td>
                    <td className="truncate font-medium text-ink-800" title={r.Name}>{r.Name}</td>
                    <td className="truncate">{r.Category || '-'}</td>
                    <td className="ph-mid">{r.Pack || '-'}</td>
                    <td className={`ph-num font-semibold ${r.Stock <= 0 ? 'text-red-600' : 'text-amber-700'}`}>{qty(r.Stock)}</td>
                    <td className="ph-num">{qty(r.Level)}{r.ReorderLevel == null && <span className="text-ink-400">*</span>}</td>
                    <td className="ph-num">{qty(r.ShortBy)}</td>
                    <td className="truncate" title={r.VendorName || ''}>{r.VendorName || '-'}</td>
                    <td className="ph-num">{r.LastPRate == null ? '-' : money(r.LastPRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-ink-400">* default level (the item has none set)</p>
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
