import { useState, useEffect, useCallback, Fragment } from 'react';
import { Boxes, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyStockApi } from '../../api/client.js';

function formatExpiry(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}
// Flags an expiry inside the next 30 days so it stands out before it's a problem.
function expirySoon(iso) {
  if (!iso) return false;
  const days = (new Date(iso) - new Date()) / 86400000;
  return days <= 30;
}

// Item-wise stock = Purchased - Purchase Returned - Sold + Sales Returned, a
// net quantity per item (not a batch-by-batch ledger — Sales isn't tracked
// per-batch). Nearest Expiry is the soonest upcoming expiry among that
// item's purchased batches, for a quick at-a-glance warning.
export default function Stock() {
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await pharmacyStockApi.list(q));
    } catch {
      show('Failed to load stock', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const toggleExpand = async (row) => {
    const id = row.ItemId;
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setBatchesLoading(true);
    try {
      setBatches(await pharmacyStockApi.batches(id));
    } catch {
      setBatches([]);
    } finally {
      setBatchesLoading(false);
    }
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Boxes}
          title="Stock"
          subtitle="Item-wise stock count and expiry, from Purchase Invoice, Purchase Return and Sales"
          actions={
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No items yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-1.5" />
                  <th className="px-3 py-1.5">Item</th>
                  <th className="px-3 py-1.5">Type</th>
                  <th className="px-3 py-1.5">Purchased</th>
                  <th className="px-3 py-1.5">Purchase Returned</th>
                  <th className="px-3 py-1.5">Sold</th>
                  <th className="px-3 py-1.5">Sales Returned</th>
                  <th className="px-3 py-1.5">Net Stock</th>
                  <th className="rounded-r-lg px-3 py-1.5">Nearest Expiry</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.ItemId}>
                    <tr className="table-row">
                      <td className="px-3 py-1.5">
                        <button type="button" className="btn-ghost px-1.5 py-1" onClick={() => toggleExpand(r)}>
                          {expandedId === r.ItemId ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{r.ItemName}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.ItemTypeName || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.PurchasedQty}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.PurchaseReturnQty}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.SoldQty}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.SalesReturnQty}</td>
                      <td className={`px-3 py-1.5 font-semibold ${r.NetStock <= 0 ? 'text-red-600' : 'text-ink-700'}`}>{r.NetStock}</td>
                      <td className={`px-3 py-1.5 ${expirySoon(r.NearestExpiry) ? 'font-medium text-amber-600' : 'text-slate-500'}`}>
                        {formatExpiry(r.NearestExpiry)}
                      </td>
                    </tr>
                    {expandedId === r.ItemId && (
                      <tr>
                        <td colSpan={9} className="bg-ink-50/50 px-3 py-2">
                          {batchesLoading ? (
                            <Spinner />
                          ) : batches.length === 0 ? (
                            <p className="text-xs text-ink-400">No purchased batches.</p>
                          ) : (
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="text-ink-400">
                                  <th className="px-2 py-1">Batch</th>
                                  <th className="px-2 py-1">Expiry</th>
                                  <th className="px-2 py-1">Purchased Qty</th>
                                  <th className="px-2 py-1">Returned Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {batches.map((b, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-1">{b.Batch || '-'}</td>
                                    <td className={expirySoon(b.ExpiryDate) ? 'px-2 py-1 font-medium text-amber-600' : 'px-2 py-1'}>{formatExpiry(b.ExpiryDate)}</td>
                                    <td className="px-2 py-1">{b.PurchasedQty}</td>
                                    <td className="px-2 py-1">{b.ReturnedQty}</td>
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
