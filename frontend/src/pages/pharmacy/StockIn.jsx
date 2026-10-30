import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PackagePlus, Save, X, List, ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import SearchPick from '../../components/grid/SearchPick.jsx';
import { gridKeys } from '../../components/grid/gridKeys.js';
import { useToast } from '../../hooks/useToast.js';
import { stockInApi, vendorApi } from '../../api/client.js';
import { selAmount } from '../../utils/purchaseCalc.js';

const pad = (n) => String(n).padStart(2, '0');
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthOf = (iso) => (iso ? String(iso).slice(0, 7) : '');
const money = (n) => (Number(n) || 0).toFixed(2);
const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB');
const numStr = (v) => (v == null || v === '' ? '' : String(Number(v)));

// One table row per order line: the order's figures plus what's typed here.
const rowFromLine = (l, saved) => ({
  ...l, ticked: false,
  batchNo: saved?.BatchNo || '', mfg: monthOf(saved?.MfgDate), exp: monthOf(saved?.ExpDate),
  qty: saved ? numStr(saved.Quantity) : String(l.Due || 0),
  sales: saved ? numStr(saved.SalesPercent) : '', disc: saved ? numStr(saved.DiscPercent) : '',
  savedMfg: monthOf(saved?.MfgDate), savedExp: monthOf(saved?.ExpDate),
});

// A row's problem (the server checks the same), or null. Rows at 0 are skipped.
function rowProblem(r) {
  const qty = Number(r.qty || 0);
  if (qty === 0) return null;
  if (!(qty > 0)) return { qty: 'Must be more than 0' };
  if (qty > r.Due) return { qty: `Only ${r.Due} due` };
  if (!r.batchNo.trim()) return { batchNo: 'Required' };
  const now = thisMonth();
  if (!r.exp) return { exp: 'Required' };
  if (r.exp < now && r.exp !== r.savedExp) return { exp: 'Past month' };
  if (r.mfg && r.mfg > now && r.mfg !== r.savedMfg) return { mfg: 'Future month' };
  if (r.mfg && r.exp <= r.mfg) return { exp: 'Must be after Mf.Date' };
  const d = Number(r.disc || 0);
  if (!(Number(r.sales || 0) >= 0)) return { sales: '0 or more' };
  if (!(d >= 0 && d <= 100)) return { disc: '0–100' };
  if (selAmount({ rate: r.Rate, salesPercent: r.sales, discPercent: r.disc }) > Number(r.MRP)) return { sel: 'Above MRP' };
  return null;
}

const emptyFill = { batchNo: '', mfg: '', exp: '', sales: '', disc: '' };

// Pharmacy > Stock In > Master: goods received against a purchase order.
// Saving adds the quantities to stock and sets each item's selling price to
// its Sel.Amount (Cur.Rate + Sales %, less Discount %).
export default function StockIn() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [inDate, setInDate] = useState(today());
  const [rows, setRows] = useState([]);
  const [showOptional, setShowOptional] = useState(false);
  const [fill, setFill] = useState(emptyFill);
  const [editing, setEditing] = useState(null); // { id, no, locked }
  const [saving, setSaving] = useState(false);

  useEffect(() => { vendorApi.list().then(setVendors).catch(() => show('Failed to load vendors', 'error')); }, [show]);
  const vendorOptions = useMemo(
    () => vendors.filter((v) => v.Status !== 'Inactive' || String(v.VendorId) === vendorId).map((v) => ({ value: String(v.VendorId), label: v.VendorName })),
    [vendors, vendorId],
  );

  const loadOrders = async (vid) => {
    setOrders([]);
    if (!vid) return;
    try { setOrders(await stockInApi.orders(vid)); } catch { show('Failed to load orders', 'error'); }
  };
  const loadLines = async (oid, stockIn) => {
    setRows([]);
    if (!oid) return;
    try {
      const lines = await stockInApi.orderLines(oid, stockIn?.StockInId);
      const saved = new Map((stockIn?.lines || []).map((l) => [l.PoLineId, l]));
      setRows(lines.map((l) => rowFromLine(l, stockIn ? saved.get(l.PoLineId) || { Quantity: 0 } : null)));
    } catch { show('Failed to load the order lines', 'error'); }
  };

  const pickVendor = (vid) => { setVendorId(vid); setOrderId(''); setRows([]); loadOrders(vid); };
  const pickOrder = (oid) => { setOrderId(oid); loadLines(oid); };

  // A Stock In opened from the list.
  useEffect(() => {
    const id = location.state?.editStockInId;
    if (!id) return;
    navigate(location.pathname, { replace: true, state: null });
    stockInApi.get(id).then(async (s) => {
      setEditing({ id: s.StockInId, no: s.StockInNo, locked: s.locked });
      setVendorId(String(s.VendorId));
      setInDate(String(s.InDate).slice(0, 10));
      await loadOrders(String(s.VendorId));
      setOrderId(String(s.PurchaseOrderId));
      await loadLines(s.PurchaseOrderId, s);
    }).catch(() => show('Failed to load the Stock In', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const ticked = rows.filter((r) => r.ticked).length;
  const allTicked = rows.length > 0 && ticked === rows.length;
  const tickAll = () => setRows((rs) => rs.map((r) => ({ ...r, ticked: !allTicked })));
  // Only the boxes filled in the bar are applied.
  const applyFill = () => {
    const patch = Object.fromEntries(Object.entries(fill).filter(([, v]) => v !== ''));
    setRows((rs) => rs.map((r) => (r.ticked ? { ...r, ...patch } : r)));
    show(`Applied to ${ticked} row(s)`, 'success');
    setFill(emptyFill);
  };

  const problems = rows.map(rowProblem);
  const hasProblem = problems.some(Boolean);
  const receiving = rows.filter((r) => Number(r.qty || 0) > 0);

  const reset = () => { setEditing(null); setVendorId(''); setOrders([]); setOrderId(''); setRows([]); setInDate(today()); setFill(emptyFill); };

  const save = async (e) => {
    e.preventDefault();
    if (!vendorId) return show('Vendor Name is required', 'error');
    if (!orderId) return show('Purchase No is required', 'error');
    if (!inDate) return show('Date is required', 'error');
    if (!receiving.length) return show('Enter a Quantity on at least one line', 'error');
    if (hasProblem) return show('Fix the boxes marked in red first', 'error');
    setSaving(true);
    try {
      const body = {
        vendorId: Number(vendorId), purchaseOrderId: Number(orderId), inDate,
        lines: rows.map((r) => ({ poLineId: r.PoLineId, batchNo: r.batchNo, mfgMonth: r.mfg, expMonth: r.exp, quantity: r.qty, salesPercent: r.sales, discPercent: r.disc })),
      };
      if (editing) {
        await stockInApi.update(editing.id, body);
        navigate('/pharmacy/stock-in-list', { state: { flash: `${editing.no} updated` } });
      } else {
        const r = await stockInApi.create(body);
        show(`Saved ${r.StockInNo} — stock and selling prices updated`, 'success');
        reset();
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const locked = editing?.locked;
  const cell = 'border border-ink-200 px-1 py-0.5';
  const box = 'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] focus:border-brand-400 focus:bg-white focus:outline-none';
  const bad = 'border-red-400 bg-red-50 text-red-700';
  const opt = 'bg-amber-50 text-amber-900';
  const ro = 'px-1.5 text-right text-ink-600';

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={PackagePlus}
            title={editing ? `Edit Stock In · ${editing.no}` : 'Stock In'}
            subtitle="Goods received against a purchase order — adds stock and sets the selling price"
            actions={<button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/stock-in-list')}><List size={16} /> View List</button>}
          />

          {locked && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
              <Lock size={14} /> {locked}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-72">
              <label className="label">Vendor Name *</label>
              <SearchPick className="input" placeholder="Search vendor..." options={vendorOptions} value={vendorId} onChange={pickVendor} disabled={!!editing} />
            </div>
            <div className="w-full sm:w-80">
              <label className="label">Purchase No *</label>
              <select className="input" value={orderId} disabled={!vendorId || !!editing} onChange={(e) => pickOrder(e.target.value)}>
                <option value="">{vendorId ? (orders.length ? 'Pick an order' : 'No orders for this vendor') : 'Pick a vendor first'}</option>
                {orders.map((o) => <option key={o.PurchaseOrderId} value={o.PurchaseOrderId}>{`${o.OrderNo} · ${dateLabel(o.OrderDate)} · ₹${money(o.TotalAmount)}`}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={inDate} onChange={(e) => setInDate(e.target.value)} />
            </div>
          </div>

          {ticked > 0 && (
            <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-brand-100 bg-brand-50/50 p-2">
              <span className="self-center text-sm font-medium text-brand-700">Fill the ticked rows</span>
              <div className="w-28"><label className="label">Batch No</label><input className="input" value={fill.batchNo} onChange={(e) => setFill((f) => ({ ...f, batchNo: e.target.value }))} /></div>
              <div className="w-36"><label className="label">Mf.Date</label><input type="month" className="input" value={fill.mfg} onChange={(e) => setFill((f) => ({ ...f, mfg: e.target.value }))} /></div>
              <div className="w-36"><label className="label">Exp.Date</label><input type="month" className="input" value={fill.exp} onChange={(e) => setFill((f) => ({ ...f, exp: e.target.value }))} /></div>
              <div className="w-20"><label className="label">Sales %</label><input type="number" min="0" step="0.01" className="input no-spin" value={fill.sales} onChange={(e) => setFill((f) => ({ ...f, sales: e.target.value }))} /></div>
              <div className="w-20"><label className="label">Discount %</label><input type="number" min="0" max="100" step="0.01" className="input no-spin" value={fill.disc} onChange={(e) => setFill((f) => ({ ...f, disc: e.target.value }))} /></div>
              <button type="button" className="btn-primary py-1" onClick={applyFill}>Apply to {ticked} row(s)</button>
            </div>
          )}

          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse text-left text-[13px]" {...gridKeys}>
              <thead>
                <tr className="bg-brand-50 font-bold text-brand-700">
                  <th className={`${cell} w-8 text-center`}><input type="checkbox" checked={allTicked} onChange={tickAll} disabled={!rows.length} title="Tick all" /></th>
                  <th className={`${cell} min-w-[180px]`}>
                    <div className="flex items-center justify-between">
                      Item Name
                      <button type="button" className="rounded px-1 text-brand-600 hover:bg-white" title={showOptional ? 'Hide Generic, Manufacturer, HSN, Category' : 'Show Generic, Manufacturer, HSN, Category'} onClick={() => setShowOptional((s) => !s)}>
                        {showOptional ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>
                  </th>
                  {showOptional && ['Generic Name', 'Manufacturer', 'HSN Code', 'Category'].map((h) => <th key={h} className={`${cell} ${opt}`}>{h}</th>)}
                  <th className={`${cell} w-14`}>Pack</th>
                  <th className={`${cell} w-16 text-right`}>MRP</th>
                  <th className={`${cell} w-16 text-right`}>Cur.Rate</th>
                  <th className={`${cell} w-14 text-right`}>Ordered</th>
                  <th className={`${cell} w-16 text-right`}>Received</th>
                  <th className={`${cell} w-24`}>Batch No</th>
                  <th className={`${cell} w-32`}>Mf.Date</th>
                  <th className={`${cell} w-32`}>Exp.Date</th>
                  <th className={`${cell} w-16 text-right`}>Quantity</th>
                  <th className={`${cell} w-16 text-right`}>Sales %</th>
                  <th className={`${cell} w-16 text-right`}>Discount %</th>
                  <th className={`${cell} w-20 text-right`}>Sel.Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td className={`${cell} px-3 py-4 text-center text-ink-400`} colSpan={14 + (showOptional ? 4 : 0)}>{orderId ? 'Loading the order…' : 'Pick a vendor and a purchase order to list its items.'}</td></tr>
                )}
                {rows.map((r, i) => {
                  const p = problems[i] || {};
                  const sel = selAmount({ rate: r.Rate, salesPercent: r.sales, discPercent: r.disc });
                  const skipped = Number(r.qty || 0) === 0;
                  const msg = Object.values(p)[0];
                  return (
                    <tr key={r.PoLineId} className={skipped ? 'text-ink-400' : ''} title={msg || (skipped ? 'Quantity 0 — this row is skipped' : '')}>
                      <td className={`${cell} text-center`}><input type="checkbox" checked={r.ticked} onChange={() => setRow(i, { ticked: !r.ticked })} /></td>
                      <td className={`${cell} px-1.5 font-medium ${skipped ? '' : 'text-ink-800'}`}>
                        {r.ItemName}
                        {msg && <p className="text-[11px] font-normal text-red-600">{msg}</p>}
                      </td>
                      {showOptional && [r.GenericName, r.Manufacturer, r.HSNCode, r.Category].map((v, k) => <td key={k} className={`${cell} ${opt} px-1.5`}>{v}</td>)}
                      <td className={`${cell} px-1.5`}>{r.Pack}</td>
                      <td className={`${cell} ${ro}`}>{money(r.MRP)}</td>
                      <td className={`${cell} ${ro}`}>{money(r.Rate)}</td>
                      <td className={`${cell} ${ro}`}>{r.Ordered}</td>
                      <td className={`${cell} ${ro}`}>{r.Received}</td>
                      <td className={cell}><input data-r={i} data-c={0} className={`${box} ${p.batchNo ? bad : ''}`} value={r.batchNo} onChange={(e) => setRow(i, { batchNo: e.target.value })} /></td>
                      <td className={cell}><input type="month" data-r={i} data-c={1} className={`${box} ${p.mfg ? bad : ''}`} value={r.mfg} onChange={(e) => setRow(i, { mfg: e.target.value })} /></td>
                      <td className={cell}><input type="month" data-r={i} data-c={2} className={`${box} ${p.exp ? bad : ''}`} value={r.exp} onChange={(e) => setRow(i, { exp: e.target.value })} /></td>
                      <td className={cell}><input type="number" min="0" step="any" data-r={i} data-c={3} className={`${box} no-spin text-right ${p.qty ? bad : ''}`} value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} /></td>
                      <td className={cell}><input type="number" min="0" step="0.01" data-r={i} data-c={4} className={`${box} no-spin text-right ${p.sales ? bad : ''}`} value={r.sales} onChange={(e) => setRow(i, { sales: e.target.value })} /></td>
                      <td className={cell}><input type="number" min="0" max="100" step="0.01" data-r={i} data-c={5} className={`${box} no-spin text-right ${p.disc ? bad : ''}`} value={r.disc} onChange={(e) => setRow(i, { disc: e.target.value })} /></td>
                      <td className={`${cell} px-1.5 text-right font-semibold ${p.sel ? 'bg-red-50 text-red-700' : 'text-ink-800'}`}>{money(sel)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-500">
              Quantity starts at what's still due; rows left at 0 are skipped. Sel.Amount = Cur.Rate + Sales %, less Discount % — it can't be above MRP.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => (editing ? navigate('/pharmacy/stock-in-list') : reset())}><X size={16} /> Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving || !!locked}><Save size={16} /> {saving ? 'Saving...' : editing ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </form>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
