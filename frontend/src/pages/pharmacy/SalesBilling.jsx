import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Receipt, Plus, Trash2, Save, X, List, Printer } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import SalesBillReceipt from './SalesBillReceipt.jsx';
import SearchPick from '../../components/grid/SearchPick.jsx';
import { gridKeys } from '../../components/grid/gridKeys.js';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, salesBillingApi, clinicApi } from '../../api/client.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => (Number(n) || 0).toFixed(2);
const round2 = (n) => Math.round(n * 100) / 100;
const expLabel = (iso) => (iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : 'No expiry');
const batchLabel = (b) => `${b.Batch || 'No batch'} · Exp ${expLabel(b.ExpiryDate)} · ${b.AvailableQty}`;

let nextKey = 1;
const emptyLine = () => ({ key: nextKey++, itemId: '', batches: [], batch: null, qty: '', price: '', loading: false });

// Pharmacy > Sales > Master: a counter sale. Each line is sold from one batch
// (only batches with stock left, earliest expiry first); the server re-checks
// every quantity, price and total.
export default function SalesBilling() {
  const { toast, show } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [transDate, setTransDate] = useState(today());
  const [customerName, setCustomerName] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [clinic, setClinic] = useState(null);
  // The bill just saved, offered for printing above the form.
  const [printBill, setPrintBill] = useState(null);

  useEffect(() => { pharmacyItemApi.list().then(setCatalog).catch(() => show('Failed to load items', 'error')); }, [show]);
  useEffect(() => { clinicApi.get().then(setClinic).catch(() => setClinic(null)); }, []);

  const itemById = useMemo(() => new Map(catalog.map((i) => [String(i.ItemId), i])), [catalog]);
  const itemOptions = useMemo(() => catalog.map((i) => ({ value: String(i.ItemId), label: i.Name })), [catalog]);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLineAfter = (key) => setLines((ls) => {
    const i = ls.findIndex((l) => l.key === key);
    return [...ls.slice(0, i + 1), emptyLine(), ...ls.slice(i + 1)];
  });
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [emptyLine()]));

  const defaultPrice = (item) => item?.SellPrice ?? item?.MRP ?? '';

  const pickItem = async (key, itemId) => {
    const item = itemById.get(itemId);
    setLine(key, { itemId, batches: [], batch: null, price: defaultPrice(item), qty: '1', loading: true });
    try {
      const batches = await salesBillingApi.batches(itemId, editingId || undefined);
      // The earliest-expiring batch is chosen to start with.
      setLine(key, { batches, batch: batches[0]?.Batch ?? null, loading: false });
    } catch {
      show('Failed to load batches for this item', 'error');
      setLine(key, { loading: false });
    }
  };

  // Stock of each line's batch, and how much all lines together take from it.
  const batchOfLine = (l) => l.batches.find((b) => b.Batch === l.batch);
  const used = new Map();
  for (const l of lines) {
    if (l.itemId && l.batch != null) {
      const k = `${l.itemId}|${l.batch}`;
      used.set(k, (used.get(k) || 0) + (Number(l.qty) || 0));
    }
  }
  const problemOf = (l) => {
    if (!l.itemId) return null;
    const b = batchOfLine(l);
    if (!b) return { qty: 'No stock' };
    if (used.get(`${l.itemId}|${l.batch}`) > b.AvailableQty) return { qty: `Only ${b.AvailableQty} in stock` };
    const mrp = Number(itemById.get(l.itemId)?.MRP);
    if (mrp > 0 && Number(l.price) > mrp) return { price: `Above MRP ${money(mrp)}` };
    return null;
  };
  const filled = lines.filter((l) => l.itemId);
  const hasProblem = filled.some((l) => problemOf(l) || !(Number(l.qty) > 0) || !(Number(l.price) > 0));
  const total = round2(filled.reduce((s, l) => s + round2((Number(l.qty) || 0) * (Number(l.price) || 0)), 0));

  const resetForm = () => {
    setEditingId(null);
    setLines([emptyLine()]);
    setCustomerName('');
    setMobileNo('');
    setTransDate(today());
  };

  // A sale opened from the list: its lines get their batch lists with this
  // sale's own quantities counted as still available.
  const startEdit = async (id) => {
    try {
      const sale = await salesBillingApi.get(id);
      const built = await Promise.all(sale.lines.map(async (l) => {
        let batches = [];
        try { batches = await salesBillingApi.batches(l.ItemId, id); } catch { /* keeps the saved batch only */ }
        const batch = l.Batch || '';
        if (!batches.some((b) => b.Batch === batch)) batches = [...batches, { Batch: batch, ExpiryDate: l.ExpiryDate, AvailableQty: 0 }];
        return { ...emptyLine(), itemId: String(l.ItemId), batches, batch, qty: String(Number(l.Quantity)), price: String(Number(l.Rate)) };
      }));
      setEditingId(id);
      setTransDate(String(sale.TransDate).slice(0, 10));
      setCustomerName(sale.CustomerName || '');
      setMobileNo(sale.MobileNo || '');
      setLines(built.length ? built : [emptyLine()]);
    } catch {
      show('Failed to load sale for editing', 'error');
    }
  };

  useEffect(() => {
    const id = location.state?.editSale?.SalesBillingId;
    if (id) {
      startEdit(id);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!transDate) return show('Date is required', 'error');
    if (!customerName.trim()) return show('Customer Name is required', 'error');
    if (mobileNo && !/^\+?[0-9][0-9\s-]*$/.test(mobileNo.trim())) return show('Mobile No must contain numbers only', 'error');
    if (!filled.length) return show('Add at least one item', 'error');
    if (hasProblem) return show('Fix the rows marked in red first', 'error');
    setSaving(true);
    try {
      const payload = {
        transDate, customerName, mobileNo,
        items: filled.map((l) => ({ itemId: Number(l.itemId), batch: l.batch, quantity: Number(l.qty), rate: Number(l.price) })),
      };
      if (editingId) {
        await salesBillingApi.update(editingId, payload);
        navigate('/pharmacy/sales-billing-list', { state: { flash: 'Sale updated' } });
      } else {
        const saved = await salesBillingApi.create(payload);
        show(`Saved ${saved.Code}`, 'success');
        setPrintBill({
          code: saved.Code, transDate, customerName,
          lines: filled.map((l) => ({
            itemName: itemById.get(l.itemId)?.Name || '', batch: l.batch,
            qty: Number(l.qty), rate: Number(l.price), amount: round2(Number(l.qty) * Number(l.price)),
          })),
          total: Number(saved.TotalAmount),
        });
        resetForm();
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cell = 'border border-ink-200 px-1.5 py-1';
  const box = 'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm focus:border-brand-400 focus:bg-white focus:outline-none';

  return (
    <div>
      <div className="card no-print">
        <form onSubmit={save}>
          <CardHeader
            icon={Receipt}
            title={editingId ? 'Edit Sale' : 'Sales'}
            subtitle={editingId ? 'Update this sale' : 'Counter sale from a batch'}
            actions={
              <button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/sales-billing-list')}>
                <List size={16} /> View List
              </button>
            }
          />

          {printBill && (
            <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm">
              <span>Saved <b>{printBill.code}</b> · {printBill.customerName} · ₹{money(printBill.total)}</span>
              <button type="button" className="btn-secondary py-1" onClick={() => window.print()}><Printer size={14} /> Print</button>
              <button type="button" className="ml-auto text-ink-400 hover:text-ink-600" title="Close" onClick={() => setPrintBill(null)}><X size={16} /></button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <label className="label">Customer Name *</label>
              <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <label className="label">Mobile No</label>
              <input type="tel" inputMode="numeric" className="input" value={mobileNo} onChange={(e) => setMobileNo(e.target.value)} placeholder="e.g. 98765 43210" />
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm" {...gridKeys}>
              <thead>
                <tr className="bg-brand-50 font-bold text-brand-700">
                  <th className={`${cell} w-8 text-center`}>#</th>
                  <th className={`${cell} min-w-[220px]`}>Item Name</th>
                  <th className={`${cell} w-60`}>Batch</th>
                  <th className={`${cell} w-16`}>Rack</th>
                  <th className={`${cell} w-16`}>Box</th>
                  <th className={`${cell} w-16 text-right`}>Stock</th>
                  <th className={`${cell} w-24 text-right`}>Sale Price</th>
                  <th className={`${cell} w-24 text-right`}>Quantity</th>
                  <th className={`${cell} w-24 text-right`}>Amount</th>
                  <th className={`${cell} w-16`} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, r) => {
                  const item = itemById.get(l.itemId);
                  const b = batchOfLine(l);
                  const problem = problemOf(l);
                  return (
                    <tr key={l.key} className="align-top">
                      <td className={`${cell} text-center text-ink-400`}>{r + 1}</td>
                      <td className={cell}>
                        <SearchPick
                          className={box} data-r={r} data-c={0} placeholder="Search item..."
                          options={itemOptions} value={l.itemId} onChange={(v) => pickItem(l.key, v)}
                        />
                      </td>
                      <td className={cell}>
                        <select
                          className={box} data-r={r} data-c={1}
                          disabled={!l.itemId || l.loading || !l.batches.length}
                          value={l.batch ?? ''}
                          onChange={(e) => setLine(l.key, { batch: e.target.value })}
                        >
                          {!l.itemId && <option value="">Pick an item first</option>}
                          {l.itemId && l.loading && <option value="">Loading…</option>}
                          {l.itemId && !l.loading && !l.batches.length && <option value="">No stock</option>}
                          {l.batches.map((bt) => <option key={bt.Batch} value={bt.Batch}>{batchLabel(bt)}</option>)}
                        </select>
                      </td>
                      <td className={`${cell} font-bold text-brand-700`}>{item?.Rack || ''}</td>
                      <td className={`${cell} font-bold text-brand-700`}>{item?.BoxNo || ''}</td>
                      <td className={`${cell} text-right text-ink-600`}>{b ? b.AvailableQty : ''}</td>
                      <td className={cell}>
                        <input
                          type="number" step="0.01" min="0" data-r={r} data-c={2}
                          className={`${box} text-right ${problem?.price ? 'border-red-400 bg-red-50 text-red-700' : ''}`}
                          value={l.price} disabled={!l.itemId}
                          onChange={(e) => setLine(l.key, { price: e.target.value })}
                        />
                        {problem?.price && <p className="px-1 text-[11px] text-red-600">{problem.price}</p>}
                      </td>
                      <td className={cell}>
                        <input
                          type="number" step="1" min="0" data-r={r} data-c={3}
                          className={`${box} text-right ${problem?.qty ? 'border-red-400 bg-red-50 text-red-700' : ''}`}
                          value={l.qty} disabled={!l.itemId}
                          onChange={(e) => setLine(l.key, { qty: e.target.value })}
                        />
                        {problem?.qty && <p className="px-1 text-[11px] text-red-600">{problem.qty}</p>}
                      </td>
                      <td className={`${cell} text-right`}>{l.itemId ? money((Number(l.qty) || 0) * (Number(l.price) || 0)) : ''}</td>
                      <td className={cell}>
                        <div className="flex justify-center gap-0.5">
                          <button type="button" className="rounded p-1 text-brand-600 hover:bg-brand-50" title="Add a row below" onClick={() => addLineAfter(l.key)}><Plus size={14} /></button>
                          <button type="button" className="rounded p-1 text-red-500 hover:bg-red-50" title="Delete row" onClick={() => removeLine(l.key)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50 font-semibold">
                  <td className={`${cell} text-right`} colSpan={8}>Total</td>
                  <td className={`${cell} text-right`}>{money(total)}</td>
                  <td className={cell} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => (editingId ? navigate('/pharmacy/sales-billing-list') : resetForm())}>
              <X size={16} /> Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving || hasProblem}>
              <Save size={16} /> {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <SalesBillReceipt clinic={clinic} bill={printBill} />

      <Toast toast={toast} />
    </div>
  );
}
