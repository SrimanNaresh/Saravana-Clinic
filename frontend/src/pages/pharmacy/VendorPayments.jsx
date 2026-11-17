import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, ChevronRight, ChevronDown, X, Trash2 } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyReportApi, stockInApi, stockReturnApi, stockInwardApi, purchaseReturnApi } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');

// Where a line opens. Older Stock Inward entries and Purchase Returns have no
// screen any more, so their lines don't open anything.
const DOC_PAGE = { 'stock-in': '/pharmacy/stock-in-list', return: '/pharmacy/return-list' };
// Lines an Admin can delete from here (soft delete; the server checks the
// role and refuses a Stock In / Stock Inward whose stock has been used).
const DOC_DELETE = {
  'stock-in': { api: stockInApi, kind: 'Stock In', note: 'Its stock is taken off.' },
  return: { api: stockReturnApi, kind: 'Return', note: 'The returned quantity goes back into stock.' },
  'stock-inward': { api: stockInwardApi, kind: 'Stock Inward', note: 'Its stock is taken off.' },
  'purchase-return': { api: purchaseReturnApi, kind: 'Purchase Return', note: 'The returned quantity goes back into stock.' },
};

// One vendor's Stock Ins and Returns, shown under its row. onDeleted runs
// after a line is deleted so the vendor totals reload.
function VendorDocs({ vendorId, from, to, isAdmin, show, onDeleted }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => {
    pharmacyReportApi.vendorDocs(vendorId, { from, to }).then(setRows).catch(() => setRows([]));
  }, [vendorId, from, to]);
  useEffect(() => { load(); }, [load]);

  const remove = async (d) => {
    const del = DOC_DELETE[d.Type];
    const { kind } = del;
    if (!confirm(`Delete ${kind} ${d.DocNo} (₹${money(d.Total)})?\n\n${del.note}`)) return;
    try {
      await del.api.remove(d.DocId);
      show(`${kind} ${d.DocNo} deleted`, 'success');
      load();
      onDeleted();
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  if (!rows) return <Spinner />;
  if (!rows.length) return <p className="px-3 py-2 text-sm text-ink-400">Nothing in this period.</p>;
  return (
    <table className="ph-table bg-white text-[12px]">
      <colgroup>
        <col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[9%]" />
        <col className={isAdmin ? 'w-[26%]' : 'w-[31%]'} /><col className="w-[5%]" /><col className="w-[7%]" /><col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[10%]" />
        {isAdmin && <col className="w-[5%]" />}
      </colgroup>
      <thead>
        <tr>
          <th className="ph-mid">Date</th>
          <th className="ph-mid">Type</th>
          <th className="ph-mid">No</th>
          <th className="ph-mid">Against</th>
          <th>Item Name(s)</th>
          <th className="ph-num">Items</th>
          <th className="ph-num">Quantity</th>
          <th className="ph-num">Amount</th>
          <th className="ph-num">GST</th>
          <th className="ph-num">Total</th>
          {isAdmin && <th className="ph-mid">Delete</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          const ret = d.Type === 'return' || d.Type === 'purchase-return';
          const sign = ret ? '−' : '';
          return (
            <tr
              key={`${d.Type}-${d.DocId}`}
              className={DOC_PAGE[d.Type] ? 'cursor-pointer' : ''}
              title={DOC_PAGE[d.Type] ? "Open this document's list" : ''}
              onClick={() => DOC_PAGE[d.Type] && navigate(DOC_PAGE[d.Type], { state: { search: d.DocNo } })}
            >
              <td className="ph-mid whitespace-nowrap">{dateLabel(d.DocDate)}</td>
              <td className="ph-mid">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ret ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{ret ? 'Return' : 'Stock In'}</span>
              </td>
              <td className="ph-mid font-medium text-brand-700">{d.DocNo}</td>
              <td className="ph-mid">{d.Against || '-'}</td>
              <td className="truncate" title={d.ItemNames}>{d.ItemNames}</td>
              <td className="ph-num">{d.Items}</td>
              <td className="ph-num">{sign}{Number(d.Qty)}</td>
              <td className={`ph-num ${ret ? 'text-red-600' : ''}`}>{sign}{money(d.Amount)}</td>
              <td className={`ph-num ${ret ? 'text-red-600' : ''}`}>{sign}{money(d.GST)}</td>
              <td className={`ph-num font-medium ${ret ? 'text-red-600' : ''}`}>{sign}{money(d.Total)}</td>
              {isAdmin && (
                <td className="ph-mid">
                  {DOC_DELETE[d.Type] && (
                    <button
                      type="button" className="ph-icon-del" title={`Delete ${d.DocNo} (Admin only)`}
                      onClick={(e) => { e.stopPropagation(); remove(d); }}
                    ><Trash2 size={13} /></button>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Pharmacy > Report > Vendor Payments: what is owed to each vendor —
// Stock In Total less Return Total — for a period (empty dates = all time).
export default function VendorPayments() {
  const { toast, show } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await pharmacyReportApi.vendorPayments({ from, to }));
    } catch {
      show('Failed to load vendor payments', 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, show]);

  useEffect(() => { load(); }, [load]);

  const keys = ['StockInCount', 'StockInAmount', 'StockInGST', 'StockInTotal', 'ReturnCount', 'ReturnTotal', 'NetPayable'];
  const totals = useMemo(() => Object.fromEntries(keys.map((k) => [k, rows.reduce((s, r) => s + Number(r[k] || 0), 0)])), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const td = '';

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Wallet}
          title="Vendor Payments"
          subtitle={from || to ? `${from ? dateLabel(from) : 'Start'} – ${to ? dateLabel(to) : 'today'}` : 'All time'}
          actions={
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="text-ink-500">From</label>
              <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
              <label className="text-ink-500">To</label>
              <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
              {(from || to) && (
                <button type="button" className="btn-ghost px-2 py-1" title="Clear dates" onClick={() => { setFrom(''); setTo(''); }}><X size={15} /></button>
              )}
            </div>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No Stock Ins or Returns in this period." />
        ) : (
          <div className="ph-wrap">
            <table className="ph-table min-w-[860px]">
              <colgroup><col className="w-[30%]" /><col className="w-[8%]" /><col className="w-[11%]" /><col className="w-[10%]" /><col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[12%]" /></colgroup>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className="ph-num">Stock In</th>
                  <th className="ph-num">Amount</th>
                  <th className="ph-num">GST</th>
                  <th className="ph-num">Stock In Total</th>
                  <th className="ph-num">Returns</th>
                  <th className="ph-num">Return Total</th>
                  <th className="ph-num">Net Payable</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = openId === r.VendorId;
                  return (
                    <Fragment key={r.VendorId}>
                      <tr className="cursor-pointer" onClick={() => setOpenId(open ? null : r.VendorId)}>
                        <td className="truncate">
                          {open ? <ChevronDown size={14} className="mr-1 inline" /> : <ChevronRight size={14} className="mr-1 inline" />}
                          <span className="font-medium text-ink-800">{r.VendorName}</span>
                          {r.MobileNo && <span className="text-ink-400"> · {r.MobileNo}</span>}
                        </td>
                        <td className={`ph-num`}>{r.StockInCount}</td>
                        <td className={`ph-num`}>{money(r.StockInAmount)}</td>
                        <td className={`ph-num`}>{money(r.StockInGST)}</td>
                        <td className={`ph-num font-semibold`}>{money(r.StockInTotal)}</td>
                        <td className={`ph-num`}>{r.ReturnCount}</td>
                        <td className={`ph-num font-semibold text-red-600`}>{money(r.ReturnTotal)}</td>
                        <td className={`ph-num font-bold text-brand-700`}>{money(r.NetPayable)}</td>
                      </tr>
                      {open && (
                        <tr className="!bg-ink-50">
                          <td colSpan={8} className="px-4 py-2"><VendorDocs vendorId={r.VendorId} from={from} to={to} isAdmin={isAdmin} show={show} onDeleted={load} /></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total ({rows.length} vendors)</td>
                  <td className={`ph-num`}>{totals.StockInCount}</td>
                  <td className={`ph-num`}>{money(totals.StockInAmount)}</td>
                  <td className={`ph-num`}>{money(totals.StockInGST)}</td>
                  <td className={`ph-num`}>{money(totals.StockInTotal)}</td>
                  <td className={`ph-num`}>{totals.ReturnCount}</td>
                  <td className={`ph-num`}>{money(totals.ReturnTotal)}</td>
                  <td className={`ph-num`}>{money(totals.NetPayable)}</td>
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
