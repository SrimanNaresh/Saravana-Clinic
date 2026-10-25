import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Undo2, Trash2, Pencil, ChevronDown, ChevronRight, X, Search } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { purchaseReturnApi } from '../../api/client.js';

function formatExpiry(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}
// Matches codeExpr in _transactionFactory.js — PurchaseInvoiceId comes
// through as a raw id, not a pre-formatted code, so format it the same way.
const invoiceCode = (id) => `PINV${String(id).padStart(6, '0')}`;

// Default view: last 15 days only. Picking an explicit From/To date overrides
// this — "Clear filters" returns to the 15-day default, not to "show everything".
function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 15);
  return d.toISOString().slice(0, 10);
}

export default function PurchaseReturnList() {
  const { toast, show } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await purchaseReturnApi.list(q));
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

  const filteredRows = useMemo(() => rows.filter((r) => {
    const d = r.TransDate.slice(0, 10);
    return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  }), [rows, fromDate, toDate]);

  const activeFilterCount = (fromDate !== defaultFromDate() ? 1 : 0) + (toDate ? 1 : 0);
  const clearFilters = () => { setFromDate(defaultFromDate()); setToDate(''); };

  const toggleExpand = async (row) => {
    const id = row.PurchaseReturnId;
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setExpandedLoading(true);
    try {
      setExpandedItems(await purchaseReturnApi.items(id));
    } catch {
      setExpandedItems([]);
    } finally {
      setExpandedLoading(false);
    }
  };

  // Hands the saved row off to the entry page via navigation state — it loads
  // the source invoice + saved quantities back into the grid and switches to
  // Update mode.
  const editRow = (row) => navigate('/pharmacy/purchase-return', { state: { editReturn: row } });

  const remove = async (row) => {
    if (!confirm(`Delete ${row.Code}?`)) return;
    try {
      await purchaseReturnApi.remove(row.PurchaseReturnId);
      show('Deleted', 'success');
      if (expandedId === row.PurchaseReturnId) setExpandedId(null);
      load();
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Undo2}
          title="Purchase Return List"
          subtitle="Saved purchase return entries"
          actions={
            <div className="relative w-full sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="Search supplier..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
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
                  <th className="px-3 py-1.5">Supplier</th>
                  <th className="px-3 py-1.5">Against Invoice</th>
                  <th className="px-3 py-1.5">Total</th>
                  <th className="rounded-r-lg px-3 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <Fragment key={r.PurchaseReturnId}>
                    <tr className="table-row">
                      <td className="px-3 py-1.5">
                        <button type="button" className="btn-ghost px-1.5 py-1" onClick={() => toggleExpand(r)}>
                          {expandedId === r.PurchaseReturnId ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{r.Code}</td>
                      <td className="px-3 py-1.5 text-slate-500">{new Date(r.TransDate).toLocaleDateString()}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{r.SupplierName || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.PurchaseInvoiceId ? invoiceCode(r.PurchaseInvoiceId) : '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{Number(r.TotalAmount).toFixed(2)}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1">
                          <button type="button" className="btn-ghost px-2 py-1 text-brand-600 hover:bg-brand-50" title="Edit" onClick={() => editRow(r)}><Pencil size={15} /></button>
                          <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete" onClick={() => remove(r)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === r.PurchaseReturnId && (
                      <tr>
                        <td colSpan={7} className="bg-ink-50/50 px-3 py-2">
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

      <Toast toast={toast} />
    </div>
  );
}
