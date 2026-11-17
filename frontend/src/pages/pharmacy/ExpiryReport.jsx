import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Printer, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, pharmacyReportApi } from '../../api/client.js';
import { exportExcel, money, qty, mmyy } from './reportExport.js';

// Tabs: what each one keeps, by days left to expiry (negative = expired).
const TABS = [
  { key: 'expired', label: 'Expired', keep: (d) => d < 0 },
  { key: '30', label: '30 days', keep: (d) => d >= 0 && d <= 30 },
  { key: '60', label: '60 days', keep: (d) => d >= 0 && d <= 60 },
  { key: '90', label: '90 days', keep: (d) => d >= 0 && d <= 90 },
];

const COLUMNS = [
  { key: 'ItemCode', label: 'Item Code' },
  { key: 'Name', label: 'Item Name', width: 30 },
  { key: 'Batch', label: 'Batch' },
  { key: 'Exp', label: 'Exp', value: (r) => mmyy(r.ExpiryDate) },
  { key: 'DaysLeft', label: 'Days Left', type: 'qty' },
  { key: 'Stock', label: 'Stock', type: 'qty' },
  { key: 'MRP', label: 'MRP', type: 'money' },
  { key: 'StockValue', label: 'Stock Value', type: 'money' },
  { key: 'VendorName', label: 'Last Vendor', width: 24 },
];

// Pharmacy > Report > Expiry: batches with stock left that have expired or
// expire soon, earliest first. Expired rows red, 30 days or less amber.
export default function ExpiryReport() {
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('30');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    pharmacyItemApi.list()
      .then((items) => setCategories([...new Set(items.map((i) => i.Category).filter(Boolean))].sort()))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await pharmacyReportApi.expiry({ category }));
    } catch {
      show('Failed to load the expiry report', 'error');
    } finally {
      setLoading(false);
    }
  }, [category, show]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, rows.filter((r) => t.keep(r.DaysLeft)).length])), [rows]);
  const shown = useMemo(() => rows.filter((r) => TABS.find((t) => t.key === tab).keep(r.DaysLeft)), [rows, tab]);
  const totals = useMemo(() => ({
    Stock: shown.reduce((s, r) => s + r.Stock, 0),
    StockValue: shown.reduce((s, r) => s + r.StockValue, 0),
  }), [shown]);
  const tabLabel = TABS.find((t) => t.key === tab).label;

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={CalendarClock}
          title="Expiry Report"
          subtitle={`${shown.length} batch(es) · ${tab === 'expired' ? 'already expired' : `expiring within ${tabLabel}`} · Stock value ₹${money(totals.StockValue)}`}
          actions={(
            <div className="no-print flex flex-wrap items-center gap-2">
              <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" className="btn-secondary" title="Reload" onClick={load}><RefreshCw size={15} /></button>
              <button type="button" className="btn-secondary" disabled={!shown.length} onClick={() => exportExcel(`Expiry-${tab}`, `Expiry ${tabLabel}`, COLUMNS, shown, totals)}>
                <FileSpreadsheet size={15} /> Excel
              </button>
              <button type="button" className="btn-secondary" disabled={!shown.length} onClick={() => window.print()}><Printer size={15} /> Print</button>
            </div>
          )}
        />

        <div className="no-print mb-2 inline-flex rounded-lg bg-ink-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${tab === t.key ? `bg-white shadow-sm ${t.key === 'expired' ? 'text-red-600' : 'text-brand-700'}` : 'text-ink-500 hover:text-ink-700'}`}
            >
              {t.label} <span className="text-xs text-ink-400">({counts[t.key] || 0})</span>
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : shown.length === 0 ? (
          <EmptyState message={tab === 'expired' ? 'No expired batches with stock.' : `Nothing expires within ${tabLabel}.`} />
        ) : (
          <div className="ph-wrap">
            <table className="ph-table min-w-[900px]">
              <colgroup>
                <col className="w-[9%]" /><col className="w-[27%]" /><col className="w-[11%]" /><col className="w-[6%]" /><col className="w-[7%]" />
                <col className="w-[7%]" /><col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="ph-mid">Item Code</th><th>Item Name</th><th className="ph-mid">Batch</th><th className="ph-mid">Exp</th>
                  <th className="ph-num">Days Left</th><th className="ph-num">Stock</th><th className="ph-num">MRP</th><th className="ph-num">Stock Value</th><th>Last Vendor</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const tone = r.DaysLeft < 0 ? 'bg-red-50 text-red-700' : r.DaysLeft <= 30 ? 'bg-amber-50 text-amber-900' : '';
                  return (
                    <tr key={`${r.ItemId}|${r.Batch}`} className={tone}>
                      <td className="ph-mid">{r.ItemCode}</td>
                      <td className="truncate font-medium" title={r.Name}>{r.Name}</td>
                      <td className="ph-mid">{r.Batch || '-'}</td>
                      <td className="ph-mid font-semibold">{mmyy(r.ExpiryDate)}</td>
                      <td className="ph-num">{r.DaysLeft < 0 ? `${-r.DaysLeft} ago` : r.DaysLeft}</td>
                      <td className="ph-num">{qty(r.Stock)}</td>
                      <td className="ph-num">{r.MRP == null ? '-' : money(r.MRP)}</td>
                      <td className="ph-num">{money(r.StockValue)}</td>
                      <td className="truncate" title={r.VendorName || ''}>{r.VendorName || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="text-right" colSpan={5}>Total ({shown.length} batches)</td>
                  <td className="ph-num">{qty(totals.Stock)}</td>
                  <td />
                  <td className="ph-num">{money(totals.StockValue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
