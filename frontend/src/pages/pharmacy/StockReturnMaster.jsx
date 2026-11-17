import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Undo2, Save, X, List } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import SearchPick from '../../components/grid/SearchPick.jsx';
import { gridKeys } from '../../components/grid/gridKeys.js';
import { useToast } from '../../hooks/useToast.js';
import { stockReturnApi, vendorApi } from '../../api/client.js';
import { round2 } from '../../utils/purchaseCalc.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => (Number(n) || 0).toFixed(2);
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');
const monthLabel = (iso) => (iso ? `${MONTHS[Number(String(iso).slice(5, 7)) - 1]} ${String(iso).slice(0, 4)}` : '-');
const numStr = (v) => (v == null || v === '' ? '' : String(Number(v)));

// Pharmacy > Return > Master: goods sent back to the vendor from one Stock
// In. A line can return at most what it received less earlier returns.
export default function StockReturnMaster() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [stockIns, setStockIns] = useState([]);
  const [stockInId, setStockInId] = useState('');
  const [returnDate, setReturnDate] = useState(today());
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // { id, no }
  const [saving, setSaving] = useState(false);

  useEffect(() => { vendorApi.list().then(setVendors).catch(() => show('Failed to load vendors', 'error')); }, [show]);
  const vendorOptions = useMemo(
    () => vendors.filter((v) => v.Status !== 'Inactive' || String(v.VendorId) === vendorId).map((v) => ({ value: String(v.VendorId), label: v.VendorName })),
    [vendors, vendorId],
  );

  const loadStockIns = async (vid) => {
    setStockIns([]);
    if (!vid) return;
    try { setStockIns(await stockReturnApi.stockIns(vid)); } catch { show('Failed to load Stock Ins', 'error'); }
  };
  const loadLines = async (sid, ret) => {
    setRows([]);
    if (!sid) return;
    try {
      const lines = await stockReturnApi.stockInLines(sid, ret?.StockReturnId);
      const saved = new Map((ret?.lines || []).map((l) => [l.StockInLineId, l]));
      setRows(lines.map((l) => ({ ...l, qty: numStr(saved.get(l.StockInLineId)?.Quantity) })));
    } catch { show('Failed to load the Stock In lines', 'error'); }
  };

  const pickVendor = (vid) => { setVendorId(vid); setStockInId(''); setRows([]); loadStockIns(vid); };
  const pickStockIn = (sid) => { setStockInId(sid); loadLines(sid); };

  useEffect(() => {
    const id = location.state?.editReturnId;
    if (!id) return;
    navigate(location.pathname, { replace: true, state: null });
    stockReturnApi.get(id).then(async (r) => {
      setEditing({ id: r.StockReturnId, no: r.ReturnNo });
      setVendorId(String(r.VendorId));
      setReturnDate(String(r.ReturnDate).slice(0, 10));
      await loadStockIns(String(r.VendorId));
      setStockInId(String(r.StockInId));
      await loadLines(r.StockInId, r);
    }).catch(() => show('Failed to load the return', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const setQty = (i, qty) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, qty } : r)));
  const problemOf = (r) => {
    const q = Number(r.qty || 0);
    if (q === 0) return null;
    if (!(q > 0)) return 'Must be more than 0';
    if (q > r.Left) return `Only ${r.Left} can be returned`;
    return null;
  };
  const problems = rows.map(problemOf);
  const returning = rows.filter((r) => Number(r.qty || 0) > 0);
  const total = round2(returning.reduce((t, r) => t + round2(Number(r.qty) * Number(r.Rate)), 0));

  const reset = () => { setEditing(null); setVendorId(''); setStockIns([]); setStockInId(''); setRows([]); setReturnDate(today()); };

  const save = async (e) => {
    e.preventDefault();
    if (!vendorId) return show('Vendor Name is required', 'error');
    if (!stockInId) return show('Stock In No is required', 'error');
    if (!returnDate) return show('Date is required', 'error');
    if (!returning.length) return show('Enter a Return Qty on at least one line', 'error');
    if (problems.some(Boolean)) return show('Fix the boxes marked in red first', 'error');
    setSaving(true);
    try {
      const body = { vendorId: Number(vendorId), stockInId: Number(stockInId), returnDate, lines: rows.map((r) => ({ stockInLineId: r.StockInLineId, quantity: r.qty })) };
      if (editing) {
        await stockReturnApi.update(editing.id, body);
        navigate('/pharmacy/return-list', { state: { flash: `${editing.no} updated` } });
      } else {
        const r = await stockReturnApi.create(body);
        show(`Saved ${r.ReturnNo} · ₹${money(r.TotalAmount)} — stock reduced`, 'success');
        reset();
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Shared Pharmacy grid look (index.css .ph-table / .ph-box).
  const cell = '';
  const ro = 'ph-num text-ink-600';
  const box = 'ph-box';

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={Undo2}
            title={editing ? `Edit Return · ${editing.no}` : 'Return'}
            subtitle="Goods sent back to the vendor from one Stock In — reduces stock"
            actions={<button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/return-list')}><List size={16} /> View List</button>}
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-72">
              <label className="label">Vendor Name *</label>
              <SearchPick className="input" placeholder="Search vendor..." options={vendorOptions} value={vendorId} onChange={pickVendor} disabled={!!editing} />
            </div>
            <div className="w-full sm:w-80">
              <label className="label">Stock In No *</label>
              <select className="input" value={stockInId} disabled={!vendorId || !!editing} onChange={(e) => pickStockIn(e.target.value)}>
                <option value="">{vendorId ? (stockIns.length ? 'Pick a Stock In' : 'No Stock Ins for this vendor') : 'Pick a vendor first'}</option>
                {stockIns.map((s) => <option key={s.StockInId} value={s.StockInId}>{`${s.StockInNo} · ${dateLabel(s.InDate)} · ${s.OrderNo}`}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </div>
          </div>

          <div className="ph-wrap mt-3">
            <table className="ph-table min-w-[860px]" {...gridKeys}>
              <colgroup><col className="w-[26%]" /><col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[10%]" /></colgroup>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th className="ph-mid">Batch No</th>
                  <th className="ph-mid">Mf.Date</th>
                  <th className="ph-mid">Exp.Date</th>
                  <th className="ph-num">Cur.Rate</th>
                  <th className="ph-num">Received</th>
                  <th className="ph-num">Returned</th>
                  <th className="ph-num">Return Qty</th>
                  <th className="ph-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td className={`${cell} px-3 py-4 text-center text-ink-400`} colSpan={9}>{stockInId ? 'Loading…' : 'Pick a vendor and a Stock In to list its batches.'}</td></tr>
                )}
                {rows.map((r, i) => {
                  const none = r.Left <= 0 && !Number(r.qty);
                  const p = problems[i];
                  return (
                    <tr key={r.StockInLineId} className={none ? 'text-ink-400' : ''} title={none ? 'Nothing left to return on this line' : p || ''}>
                      <td className={`${cell} px-1.5 font-medium`}>{r.ItemName}{p && <p className="text-[11px] font-normal text-red-600">{p}</p>}</td>
                      <td className="ph-mid">{r.BatchNo}</td>
                      <td className="ph-mid">{monthLabel(r.MfgDate)}</td>
                      <td className="ph-mid">{monthLabel(r.ExpDate)}</td>
                      <td className={`${cell} ${ro}`}>{money(r.Rate)}</td>
                      <td className={`${cell} ${ro}`}>{r.Received}</td>
                      <td className={`${cell} ${ro}`}>{r.Returned}</td>
                      <td className={cell}>
                        <input
                          type="number" min="0" max={r.Left} step="any" data-r={i} data-c={0} disabled={none}
                          className={`${box} no-spin text-right tabular-nums ${p ? 'border-red-400 bg-red-50 text-red-700' : ''}`}
                          value={r.qty} placeholder={none ? '' : `max ${r.Left}`} onChange={(e) => setQty(i, e.target.value)}
                        />
                      </td>
                      <td className={`${cell} ${ro} font-semibold text-ink-800`}>{Number(r.qty) > 0 ? money(Number(r.qty) * Number(r.Rate)) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="text-right" colSpan={8}>Sum of Total</td>
                  <td className="ph-num">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => (editing ? navigate('/pharmacy/return-list') : reset())}><X size={16} /> Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Saving...' : editing ? 'Update' : 'Save'}</button>
          </div>
        </form>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
