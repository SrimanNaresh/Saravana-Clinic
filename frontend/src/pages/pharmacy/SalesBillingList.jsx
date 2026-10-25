import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Trash2, Pencil, ChevronDown, ChevronRight, Plus, Printer, Search, X } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { salesBillingApi, clinicApi } from '../../api/client.js';
import SalesBillReceipt from './SalesBillReceipt.jsx';

function formatExpiry(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}

// Default view: last 15 days only. Picking an explicit From/To date overrides
// this — "Clear filters" returns to the 15-day default, not to "show everything".
function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 15);
  return d.toISOString().slice(0, 10);
}

export default function SalesBillingList() {
  const { toast, show } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [clinic, setClinic] = useState(null);
  const [printBill, setPrintBill] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState('');

  useEffect(() => { clinicApi.get().then(setClinic).catch(() => setClinic(null)); }, []);

  // Render the hidden receipt first, then print once it's actually in the DOM
  // — printing immediately on click would fire before React commits it.
  useEffect(() => {
    if (!printBill) return;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [printBill]);
  useEffect(() => {
    const onAfterPrint = () => setPrintBill(null);
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  const printRow = async (row) => {
    setPrintingId(row.SalesBillingId);
    try {
      const items = await salesBillingApi.items(row.SalesBillingId);
      setPrintBill({
        code: row.Code, transDate: row.TransDate, customerName: row.CustomerName,
        lines: items.map((it) => ({ itemName: it.ItemName, batch: it.Batch, qty: it.Quantity, rate: Number(it.Rate), amount: Number(it.Amount) })),
        total: Number(row.TotalAmount),
      });
    } catch {
      show('Failed to load bill for printing', 'error');
    } finally {
      setPrintingId(null);
    }
  };

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await salesBillingApi.list(q));
    } catch {
      show('Failed to load records', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  // Date range narrows the already text-searched rows client-side — no extra
  // round trip, same approach as Item List's quick filters.
  const filteredRows = useMemo(() => rows.filter((r) => {
    const d = r.TransDate.slice(0, 10);
    return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  }), [rows, fromDate, toDate]);

  const activeFilterCount = (fromDate !== defaultFromDate() ? 1 : 0) + (toDate ? 1 : 0);
  const clearFilters = () => { setFromDate(defaultFromDate()); setToDate(''); };

  const toggleExpand = async (row) => {
    const id = row.SalesBillingId;
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setExpandedLoading(true);
    try {
      setExpandedItems(await salesBillingApi.items(id));
    } catch {
      setExpandedItems([]);
    } finally {
      setExpandedLoading(false);
    }
  };

  // Hands the saved row off to the entry page via navigation state — it loads
  // the saved lines (re-fetching each item's current batches) back into the
  // grid and switches to Update mode.
  const editRow = (row) => navigate('/pharmacy/sales-billing', { state: { editSale: row } });

  const remove = async (row) => {
    if (!confirm(`Delete ${row.Code}?`)) return;
    try {
      await salesBillingApi.remove(row.SalesBillingId);
      show('Deleted', 'success');
      if (expandedId === row.SalesBillingId) setExpandedId(null);
      load();
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card no-print">
        <CardHeader
          icon={Receipt}
          title="Sales Billing List"
          subtitle="Saved sales billing entries"
          actions={
            <>
              <div className="relative w-full sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button type="button" className="btn-primary" onClick={() => navigate('/pharmacy/sales-billing')}>
                <Plus size={16} /> Billing
              </button>
            </>
          }
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-500">
            From
            <input type="date" className="input w-auto" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-500">
            To
            <input type="date" className="input w-auto" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          {activeFilterCount > 0 ? (
            <button type="button" className="btn-ghost gap-1 text-xs" onClick={clearFilters}>
              <X size={14} /> Clear filter{activeFilterCount > 1 ? 's' : ''} ({activeFilterCount})
            </button>
          ) : (
            <p className="text-xs text-ink-400">Showing the last 15 days — pick dates above to look further back.</p>
          )}
        </div>

        {loading ? (
          <Spinner />
        ) : filteredRows.length === 0 ? (
          <EmptyState message={rows.length === 0 ? 'No records yet.' : 'No records match the selected filters.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-1.5" />
                  <th className="px-3 py-1.5">Code</th>
                  <th className="px-3 py-1.5">Date</th>
                  <th className="px-3 py-1.5">Customer</th>
                  <th className="px-3 py-1.5">Total</th>
                  <th className="rounded-r-lg px-3 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <Fragment key={r.SalesBillingId}>
                    <tr className="table-row">
                      <td className="px-3 py-1.5">
                        <button type="button" className="btn-ghost px-1.5 py-1" onClick={() => toggleExpand(r)}>
                          {expandedId === r.SalesBillingId ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{r.Code}</td>
                      <td className="px-3 py-1.5 text-slate-500">{new Date(r.TransDate).toLocaleDateString()}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{r.CustomerName || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{Number(r.TotalAmount).toFixed(2)}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1">
                          <button type="button" className="btn-ghost px-2 py-1 text-ink-500 hover:bg-ink-100" title="Print" disabled={printingId === r.SalesBillingId} onClick={() => printRow(r)}>
                            <Printer size={15} />
                          </button>
                          <button type="button" className="btn-ghost px-2 py-1 text-brand-600 hover:bg-brand-50" title="Edit" onClick={() => editRow(r)}><Pencil size={15} /></button>
                          <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete" onClick={() => remove(r)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === r.SalesBillingId && (
                      <tr>
                        <td colSpan={6} className="bg-ink-50/50 px-3 py-2">
                          {expandedLoading ? (
                            <Spinner />
                          ) : expandedItems.length === 0 ? (
                            <p className="text-xs text-ink-400">No line items.</p>
                          ) : (
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="text-ink-400">
                                  <th className="px-2 py-1">Item</th>
                                  <th className="px-2 py-1">Batch</th>
                                  <th className="px-2 py-1">Expiry</th>
                                  <th className="px-2 py-1">Quantity</th>
                                  <th className="px-2 py-1">Rate</th>
                                  <th className="px-2 py-1">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedItems.map((it) => (
                                  <tr key={it.LineId}>
                                    <td className="px-2 py-1">{it.ItemName}</td>
                                    <td className="px-2 py-1">{it.Batch || '-'}</td>
                                    <td className="px-2 py-1">{formatExpiry(it.ExpiryDate)}</td>
                                    <td className="px-2 py-1">{it.Quantity}</td>
                                    <td className="px-2 py-1">{it.Rate}</td>
                                    <td className="px-2 py-1">{it.Amount}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SalesBillReceipt clinic={clinic} bill={printBill} />

      <Toast toast={toast} />
    </div>
  );
}
