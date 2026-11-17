import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Search, ChevronRight, ChevronDown } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, pharmacyReportApi } from '../../api/client.js';

const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const money = (n) => (n == null ? '-' : Number(n).toFixed(2));
const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const KINDS = {
  opening: ['Opening', 'bg-slate-100 text-slate-700'],
  purchase: ['Stock In', 'bg-emerald-100 text-emerald-700'],
  return: ['Return', 'bg-red-100 text-red-700'],
  issue: ['Sold', 'bg-red-100 text-red-700'],
  'sales-return': ['Sales Return', 'bg-emerald-100 text-emerald-700'],
  adjustment: ['Adjustment', 'bg-amber-100 text-amber-700'],
};

// One item's stock history, shown under its row.
function History({ itemId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    pharmacyReportApi.history(itemId).then(setRows).catch(() => setRows([]));
  }, [itemId]);
  if (!rows) return <Spinner />;
  if (!rows.length) return <p className="px-3 py-2 text-sm text-ink-400">No stock changes yet.</p>;
  // Newest first, as it's read top-down.
  return (
    <table className="ph-table bg-white text-[12px]">
      <colgroup><col className="w-[15%]" /><col className="w-[11%]" /><col className="w-[33%]" /><col className="w-[16%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[9%]" /></colgroup>
      <thead>
        <tr>
          <th className="ph-mid">Date &amp; Time</th>
          <th className="ph-mid">Type</th>
          <th>Details</th>
          <th>Vendor</th>
          <th className="ph-num">Change</th>
          <th className="ph-num">Stock after</th>
          <th className="ph-mid">By</th>
        </tr>
      </thead>
      <tbody>
        {[...rows].reverse().map((e, i) => {
          const [label, tone] = KINDS[e.Kind] || [e.Kind, 'bg-slate-100 text-slate-700'];
          const change = Number(e.Qty);
          return (
            <tr key={i}>
              <td className="ph-mid whitespace-nowrap">{when(e.At)}</td>
              <td className="ph-mid"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span></td>
              <td className="truncate text-ink-600" title={e.Details}>{e.Details}</td>
              <td className="truncate text-ink-500">{e.VendorName || '-'}</td>
              <td className={`ph-num font-medium ${change < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{change > 0 ? '+' : ''}{qty(change)}</td>
              <td className="ph-num">{qty(e.BalanceAfter)}</td>
              <td className="ph-mid text-ink-500">{e.ByUser || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Pharmacy > Report > Stock Report: per item, Opening + Stock In - Return -
// Sold + Adjustment = Current Stock. Clicking an item opens its history.
export default function StockReport() {
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showWhat, setShowWhat] = useState('history');
  const [categories, setCategories] = useState([]);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    pharmacyItemApi.list()
      .then((items) => setCategories([...new Set(items.map((i) => i.Category).filter(Boolean))].sort()))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await pharmacyReportApi.stock({ search, category, show: showWhat }));
    } catch {
      show('Failed to load the stock report', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, category, showWhat, show]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const totals = useMemo(() => rows.reduce((t, r) => {
    for (const k of ['Opening', 'StockIn', 'Returned', 'Sold', 'Adjustment', 'CurrentStock', 'StockValue']) t[k] += Number(r[k] || 0);
    return t;
  }, { Opening: 0, StockIn: 0, Returned: 0, Sold: 0, Adjustment: 0, CurrentStock: 0, StockValue: 0 }), [rows]);

  const th = '';
  const td = '';

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={BarChart3}
          title="Stock Report"
          subtitle="Item-wise stock and its history"
          actions={
            <>
              <div className="relative w-full sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Name, code or generic..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input w-auto" value={showWhat} onChange={(e) => setShowWhat(e.target.value)}>
                <option value="history">Items with stock history</option>
                <option value="instock">In stock only</option>
                <option value="outofstock">Out of stock</option>
                <option value="all">All items</option>
              </select>
            </>
          }
        />

        <p className="mb-2 text-xs text-ink-500">
          Opening + Stock In − Return − Sold + Adjustment = Current Stock. Stock Value = Current Stock × Sell Price. Click an item to see its history.
        </p>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No items match." />
        ) : (
          <div className="ph-wrap">
            <table className="ph-table min-w-[960px]">
              <colgroup><col className="w-[9%]" /><col className="w-[21%]" /><col className="w-[10%]" /><col className="w-[6%]" /><col className="w-[6%]" /><col className="w-[6%]" /><col className="w-[6%]" /><col className="w-[6%]" /><col className="w-[7%]" /><col className="w-[7%]" /><col className="w-[7%]" /><col className="w-[9%]" /></colgroup>
              <thead>
                <tr>
                  <th className="ph-mid">Item Code</th>
                  <th className={th}>Item Name</th>
                  <th className={th}>Category</th>
                  <th className="ph-mid">Pack</th>
                  <th className={`ph-num`}>Opening</th>
                  <th className={`ph-num`}>Stock In</th>
                  <th className={`ph-num`}>Return</th>
                  <th className={`ph-num`}>Sold</th>
                  <th className={`ph-num`}>Adjustment</th>
                  <th className="ph-num !bg-brand-100">Current Stock</th>
                  <th className={`ph-num`}>Sell Price</th>
                  <th className="ph-num">Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const out = Number(r.CurrentStock) <= 0;
                  const open = openId === r.ItemId;
                  return (
                    <Fragment key={r.ItemId}>
                      <tr
                        className={`cursor-pointer ${out ? 'text-ink-400' : ''}`}
                        onClick={() => setOpenId(open ? null : r.ItemId)}
                      >
                        <td className="whitespace-nowrap">
                          {open ? <ChevronDown size={14} className="mr-1 inline" /> : <ChevronRight size={14} className="mr-1 inline" />}
                          {r.ItemCode}
                        </td>
                        <td className={`truncate font-medium ${out ? '' : 'text-ink-800'}`} title={r.ItemName}>{r.ItemName}</td>
                        <td className="truncate">{r.Category || '-'}</td>
                        <td className="ph-mid">{r.Pack || '-'}</td>
                        <td className={`ph-num`}>{qty(r.Opening)}</td>
                        <td className={`ph-num ${out ? '' : 'text-emerald-600'}`}>{qty(r.StockIn)}</td>
                        <td className={`ph-num ${out ? '' : 'text-red-600'}`}>{qty(r.Returned)}</td>
                        <td className={`ph-num ${out ? '' : 'text-red-600'}`}>{qty(r.Sold)}</td>
                        <td className={`ph-num`}>{qty(r.Adjustment)}</td>
                        <td className="ph-num bg-brand-50/70 font-semibold">{qty(r.CurrentStock)}</td>
                        <td className={`ph-num`}>{money(r.SellPrice)}</td>
                        <td className={`ph-num`}>{money(r.StockValue)}</td>
                      </tr>
                      {open && (
                        <tr className="!bg-ink-50">
                          <td colSpan={12} className="px-4 py-2"><History itemId={r.ItemId} /></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="text-right" colSpan={4}>Total ({rows.length} items)</td>
                  <td className={`ph-num`}>{qty(totals.Opening)}</td>
                  <td className={`ph-num`}>{qty(totals.StockIn)}</td>
                  <td className={`ph-num`}>{qty(totals.Returned)}</td>
                  <td className={`ph-num`}>{qty(totals.Sold)}</td>
                  <td className={`ph-num`}>{qty(totals.Adjustment)}</td>
                  <td className={`ph-num`}>{qty(totals.CurrentStock)}</td>
                  <td className={td} />
                  <td className={`ph-num`}>{money(totals.StockValue)}</td>
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
