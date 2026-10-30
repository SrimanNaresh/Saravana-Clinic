import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Trash2, Save, X, List, ChevronRight, ChevronLeft, ListPlus, Search } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import SearchPick from '../../components/grid/SearchPick.jsx';
import { gridKeys } from '../../components/grid/gridKeys.js';
import { useToast } from '../../hooks/useToast.js';
import { itemMasterApi, purchaseOrderApi, vendorApi } from '../../api/client.js';
import { purchaseLine, purchaseTotal } from '../../utils/purchaseCalc.js';

const MAX_GST = 28;
const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => (Number(n) || 0).toFixed(2);
const numStr = (v) => (v == null || v === '' ? '' : String(Number(v)));

let nextKey = 1;
const emptyLine = () => ({
  key: nextKey++, lineId: null, itemId: '', generic: '', manufacturer: '', hsn: '', category: '', pack: '',
  mrp: '', disc: '', qty: '', cgst: '', sgst: '',
});

// A new line for an item, with its details filled from the item.
const lineFromItem = (it) => ({
  ...emptyLine(), itemId: String(it.ItemId), generic: it.GenericName || '', manufacturer: it.ManufacturerName || '',
  hsn: it.HSNCode || '', category: it.Category || '', pack: it.Pack || '', mrp: numStr(it.MRP),
  cgst: numStr(it.CGSTPercent), sgst: numStr(it.SGSTPercent), qty: '1', disc: '',
});

// The vendor's address block for the Details box.
function vendorDetails(v) {
  if (!v) return '';
  const statePin = [v.State, v.Pincode].filter(Boolean).join(' – ');
  const phones = [v.ContactNo && `Mobile: ${v.ContactNo}`, v.AlternateNo && `Phone: ${v.AlternateNo}`].filter(Boolean).join(', ');
  const dl = [v.DLNo, v.DLNo2].filter(Boolean).join(', ');
  return [v.Address, statePin, phones, v.Email && `Email: ${v.Email}`, v.GSTNo && `GSTIN: ${v.GSTNo}`, dl && `DL No: ${dl}`]
    .filter(Boolean).join('\n');
}

const calcOf = (l) => purchaseLine({ mrp: l.mrp, discPercent: l.disc, quantity: l.qty, cgstPercent: l.cgst, sgstPercent: l.sgst });

// A line's problem on screen (the server checks the same), or null.
function lineProblem(l) {
  if (!l.itemId) return null;
  if (!(Number(l.qty) > 0)) return 'Quantity must be more than 0';
  if (!(Number(l.mrp) > 0)) return 'MRP must be more than 0';
  const d = Number(l.disc || 0);
  if (!(d >= 0 && d <= 100)) return 'Disc % must be 0–100';
  const c = Number(l.cgst || 0);
  const s = Number(l.sgst || 0);
  if (!(c >= 0 && s >= 0) || c + s > MAX_GST) return `CGST + SGST must be 0–${MAX_GST}%`;
  return null;
}

// Pharmacy > Purchase / Order > Master: an order placed with a vendor. It
// doesn't change stock. Amounts use the same formulas as the server.
export default function PurchaseOrder() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [details, setDetails] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [orderDate, setOrderDate] = useState(today());
  const [lines, setLines] = useState([emptyLine()]);
  const [showOptional, setShowOptional] = useState(false);
  const [editing, setEditing] = useState(null); // { id, no }
  const [saving, setSaving] = useState(false);
  // Inline "+ Add vendor" form: null or { name, address, mobile }.
  const [newVendor, setNewVendor] = useState(null);
  // Bulk add panel: null or { search, category, manufacturer, ticked: Set }.
  const [bulk, setBulk] = useState(null);

  useEffect(() => {
    itemMasterApi.list({ status: 'Active' }).then(setItems).catch(() => show('Failed to load items', 'error'));
    vendorApi.list().then(setVendors).catch(() => show('Failed to load vendors', 'error'));
  }, [show]);

  const itemById = useMemo(() => new Map(items.map((i) => [String(i.ItemId), i])), [items]);
  const itemOptions = useMemo(() => items.map((i) => ({ value: String(i.ItemId), label: i.Name })), [items]);
  const vendorOptions = useMemo(
    () => vendors.filter((v) => v.Status !== 'Inactive' || String(v.VendorId) === vendorId)
      .map((v) => ({ value: String(v.VendorId), label: v.VendorName })),
    [vendors, vendorId],
  );

  // An order opened from the list.
  useEffect(() => {
    const id = location.state?.editOrderId;
    if (!id) return;
    navigate(location.pathname, { replace: true, state: null });
    purchaseOrderApi.get(id).then((o) => {
      setEditing({ id: o.PurchaseOrderId, no: o.OrderNo });
      setVendorId(String(o.VendorId));
      setDetails(o.VendorDetails || '');
      setOrderDate(String(o.OrderDate).slice(0, 10));
      setLines(o.lines.map((l) => ({
        ...emptyLine(), lineId: l.LineId, itemId: String(l.ItemId), generic: l.GenericName || '', manufacturer: l.Manufacturer || '',
        hsn: l.HSNCode || '', category: l.Category || '', pack: l.Pack || '', mrp: numStr(l.MRP), disc: numStr(l.DiscPercent),
        qty: numStr(l.Quantity), cgst: numStr(l.CGSTPercent), sgst: numStr(l.SGSTPercent),
      })));
    }).catch(() => show('Failed to load the order', 'error'));
  }, [location.state, location.pathname, navigate, show]);

  const pickVendor = (id) => {
    setVendorId(id);
    setDetails(vendorDetails(vendors.find((v) => String(v.VendorId) === id)));
  };

  const saveNewVendor = async () => {
    const { name, address, mobile } = newVendor;
    if (!name.trim() || !address.trim() || !mobile.trim()) return show('Vendor name, Address and Mobile are all required', 'error');
    try {
      const v = await vendorApi.create({ vendorName: name, address, contactNo: mobile });
      setVendors((all) => [v, ...all]);
      setVendorId(String(v.VendorId));
      setDetails(vendorDetails(v));
      setNewVendor(null);
      show(`Added vendor ${v.VendorName}`, 'success');
    } catch (err) {
      show(err.response?.data?.error || 'Could not add the vendor', 'error');
    }
  };

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLineAfter = (key) => setLines((ls) => {
    const i = ls.findIndex((l) => l.key === key);
    return [...ls.slice(0, i + 1), emptyLine(), ...ls.slice(i + 1)];
  });
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [emptyLine()]));
  const pickItem = (key, itemId) => {
    const it = itemById.get(itemId);
    if (it) setLines((ls) => ls.map((l) => (l.key === key ? { ...lineFromItem(it), key, lineId: null } : l)));
  };

  // Bulk add panel.
  const inTable = useMemo(() => new Set(lines.map((l) => l.itemId).filter(Boolean)), [lines]);
  const bulkCategories = useMemo(() => [...new Set(items.map((i) => i.Category).filter(Boolean))].sort(), [items]);
  const bulkManufacturers = useMemo(() => [...new Set(items.map((i) => i.ManufacturerName).filter(Boolean))].sort(), [items]);
  const bulkShown = useMemo(() => {
    if (!bulk) return [];
    const q = bulk.search.trim().toLowerCase();
    return items.filter((i) => (!bulk.category || i.Category === bulk.category)
      && (!bulk.manufacturer || i.ManufacturerName === bulk.manufacturer)
      && (!q || i.Name.toLowerCase().includes(q) || (i.GenericName || '').toLowerCase().includes(q)));
  }, [items, bulk]);
  const bulkPickable = bulkShown.filter((i) => !inTable.has(String(i.ItemId)));
  const toggleTick = (id) => setBulk((b) => {
    const ticked = new Set(b.ticked);
    if (ticked.has(id)) ticked.delete(id); else ticked.add(id);
    return { ...b, ticked };
  });
  const allTicked = bulkPickable.length > 0 && bulkPickable.every((i) => bulk.ticked.has(String(i.ItemId)));
  const tickAll = () => setBulk((b) => {
    const ticked = new Set(b.ticked);
    for (const i of bulkPickable) { if (allTicked) ticked.delete(String(i.ItemId)); else ticked.add(String(i.ItemId)); }
    return { ...b, ticked };
  });
  const addTicked = () => {
    const toAdd = items.filter((i) => bulk.ticked.has(String(i.ItemId)) && !inTable.has(String(i.ItemId)));
    setLines((ls) => [...ls.filter((l) => l.itemId), ...toAdd.map(lineFromItem)]);
    show(`Added ${toAdd.length} item(s)`, 'success');
    setBulk(null);
  };

  const filled = lines.filter((l) => l.itemId);
  const problems = new Map(filled.map((l) => [l.key, lineProblem(l)]).filter(([, p]) => p));
  const total = purchaseTotal(filled.map((l) => ({ mrp: l.mrp, discPercent: l.disc, quantity: l.qty, cgstPercent: l.cgst, sgstPercent: l.sgst })));

  const reset = () => {
    setEditing(null); setVendorId(''); setDetails(''); setShowDetails(false); setOrderDate(today()); setLines([emptyLine()]);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!vendorId) return show('Vendor Name is required', 'error');
    if (!orderDate) return show('Date is required', 'error');
    if (!filled.length) return show('Add at least one item', 'error');
    if (problems.size) return show('Fix the rows marked in red first', 'error');
    setSaving(true);
    try {
      const body = {
        vendorId: Number(vendorId), orderDate, vendorDetails: details,
        lines: filled.map((l) => ({
          lineId: l.lineId, itemId: Number(l.itemId), mrp: l.mrp, discPercent: l.disc, quantity: l.qty, cgstPercent: l.cgst, sgstPercent: l.sgst,
        })),
      };
      if (editing) {
        await purchaseOrderApi.update(editing.id, body);
        navigate('/pharmacy/purchase-order-list', { state: { flash: `Order ${editing.no} updated` } });
      } else {
        const r = await purchaseOrderApi.create(body);
        show(`Saved order ${r.OrderNo} · ₹${money(r.TotalAmount)}`, 'success');
        reset();
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cell = 'border border-ink-200 px-1 py-0.5';
  const box = 'w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] focus:border-brand-400 focus:bg-white focus:outline-none';
  const numBox = `${box} no-spin text-right`;
  const opt = 'bg-amber-50 text-amber-900';
  const optCols = showOptional ? 4 : 0;

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={ShoppingCart}
            title={editing ? `Edit Order · ${editing.no}` : 'Purchase / Order'}
            subtitle={editing ? 'Update this order' : 'Order items from a vendor — this does not change stock'}
            actions={
              <button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/purchase-order-list')}>
                <List size={16} /> View List
              </button>
            }
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-80">
              <label className="label">Vendor Name *</label>
              <div className="flex gap-1">
                <div className="flex-1">
                  <SearchPick
                    className="input" placeholder="Search vendor..." options={vendorOptions} value={vendorId}
                    onChange={(v) => pickVendor(v)}
                    footer={{ label: '+ Add vendor', onClick: (typed) => setNewVendor({ name: typed, address: '', mobile: '' }) }}
                  />
                </div>
                <button
                  type="button" className="btn-secondary px-2" title={showDetails ? 'Hide details' : 'Show vendor details'}
                  onClick={() => setShowDetails((s) => !s)}
                >
                  {showDetails ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
          </div>

          {newVendor && (
            <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-brand-100 bg-brand-50/50 p-2">
              <div className="w-48"><label className="label">Vendor name *</label><input autoFocus className="input" value={newVendor.name} onChange={(e) => setNewVendor((v) => ({ ...v, name: e.target.value }))} /></div>
              <div className="min-w-[14rem] flex-1"><label className="label">Address *</label><input className="input" value={newVendor.address} onChange={(e) => setNewVendor((v) => ({ ...v, address: e.target.value }))} /></div>
              <div className="w-40"><label className="label">Mobile *</label><input type="tel" className="input" value={newVendor.mobile} onChange={(e) => setNewVendor((v) => ({ ...v, mobile: e.target.value }))} /></div>
              <button type="button" className="btn-primary" onClick={saveNewVendor}><Save size={15} /> Add vendor</button>
              <button type="button" className="btn-secondary" onClick={() => setNewVendor(null)}><X size={15} /></button>
            </div>
          )}

          {showDetails && (
            <div className="mt-2 sm:w-[28rem]">
              <label className="label">Details</label>
              <textarea className="input text-xs" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Pick a vendor to fill this in" />
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <button type="button" className="btn-secondary py-1" onClick={() => setBulk(bulk ? null : { search: '', category: '', manufacturer: '', ticked: new Set() })}>
              <ListPlus size={15} /> Bulk add items
            </button>
            <span className="text-xs text-ink-400">← → move between boxes · ↑ ↓ move between rows</span>
          </div>

          {bulk && (
            <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50/50 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-56">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input autoFocus className="input py-1 pl-8" placeholder="Search items..." value={bulk.search} onChange={(e) => setBulk((b) => ({ ...b, search: e.target.value }))} />
                </div>
                <select className="input w-auto py-1" value={bulk.category} onChange={(e) => setBulk((b) => ({ ...b, category: e.target.value }))}>
                  <option value="">All categories</option>
                  {bulkCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="input w-auto py-1" value={bulk.manufacturer} onChange={(e) => setBulk((b) => ({ ...b, manufacturer: e.target.value }))}>
                  <option value="">All manufacturers</option>
                  {bulkManufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-sm text-ink-600">
                  <input type="checkbox" checked={allTicked} onChange={tickAll} disabled={!bulkPickable.length} /> Select all ({bulkPickable.length})
                </label>
                <div className="ml-auto flex gap-2">
                  <button type="button" className="btn-primary py-1" disabled={!bulk.ticked.size} onClick={addTicked}>Add {bulk.ticked.size} item(s)</button>
                  <button type="button" className="btn-secondary py-1" onClick={() => setBulk(null)}><X size={15} /></button>
                </div>
              </div>
              <div className="mt-2 grid max-h-56 grid-cols-1 gap-x-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {bulkShown.slice(0, 300).map((i) => {
                  const added = inTable.has(String(i.ItemId));
                  return (
                    <label key={i.ItemId} className={`flex items-center gap-2 rounded px-1.5 py-0.5 text-sm ${added ? 'text-ink-400' : 'cursor-pointer text-ink-700 hover:bg-white'}`}>
                      <input type="checkbox" checked={added || bulk.ticked.has(String(i.ItemId))} disabled={added} onChange={() => toggleTick(String(i.ItemId))} />
                      <span className="truncate">{i.Name}</span>
                      {added && <span className="text-[11px] italic">already added</span>}
                    </label>
                  );
                })}
                {bulkShown.length > 300 && <p className="col-span-full px-1.5 py-1 text-xs text-ink-400">Showing the first 300 — narrow the search to see more.</p>}
                {!bulkShown.length && <p className="col-span-full px-1.5 py-1 text-xs text-ink-400">No items match.</p>}
              </div>
            </div>
          )}

          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left text-[13px]" {...gridKeys}>
              <thead>
                <tr className="bg-brand-50 font-bold text-brand-700">
                  <th className={`${cell} w-8 text-center`}>#</th>
                  <th className={`${cell} min-w-[200px]`}>
                    <div className="flex items-center justify-between">
                      Item Name
                      <button type="button" className="rounded px-1 text-brand-600 hover:bg-white" title={showOptional ? 'Hide Generic, Manufacturer, HSN, Category' : 'Show Generic, Manufacturer, HSN, Category'} onClick={() => setShowOptional((s) => !s)}>
                        {showOptional ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>
                  </th>
                  {showOptional && ['Generic Name', 'Manufacturer', 'HSN Code', 'Category'].map((h) => <th key={h} className={`${cell} ${opt}`}>{h}</th>)}
                  <th className={`${cell} w-16`}>Pack</th>
                  <th className={`${cell} w-24 min-w-[5.5rem] text-right`}>MRP</th>
                  <th className={`${cell} w-20 text-right`}>Disc %</th>
                  <th className={`${cell} w-20 text-right`}>Cur.Rate</th>
                  <th className={`${cell} w-20 text-right`}>Quantity</th>
                  <th className={`${cell} w-24 text-right`}>Amount</th>
                  <th className={`${cell} w-14 text-right`}>GST %</th>
                  <th className={`${cell} w-16 text-right`}>CGST %</th>
                  <th className={`${cell} w-16 text-right`}>SGST %</th>
                  <th className={`${cell} w-20 text-right`}>GST Amount</th>
                  <th className={`${cell} w-24 text-right`}>Total Amount</th>
                  <th className={`${cell} w-14`} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, r) => {
                  const c = calcOf(l);
                  const bad = problems.get(l.key);
                  const ro = 'px-1.5 text-right text-ink-600';
                  return (
                    <tr key={l.key} className={bad ? 'bg-red-50' : ''} title={bad || ''}>
                      <td className={`${cell} text-center text-ink-400`}>{r + 1}</td>
                      <td className={cell}>
                        <SearchPick className={box} data-r={r} data-c={0} placeholder="Search item..." options={itemOptions} value={l.itemId} onChange={(v) => pickItem(l.key, v)} />
                        {bad && <p className="px-1.5 text-[11px] text-red-600">{bad}</p>}
                      </td>
                      {showOptional && [l.generic, l.manufacturer, l.hsn, l.category].map((v, i) => <td key={i} className={`${cell} ${opt} px-1.5`}>{v}</td>)}
                      <td className={`${cell} px-1.5`}>{l.pack}</td>
                      <td className={cell}><input type="number" min="0" step="0.01" data-r={r} data-c={1} className={numBox} value={l.mrp} disabled={!l.itemId} onChange={(e) => setLine(l.key, { mrp: e.target.value })} /></td>
                      <td className={cell}><input type="number" min="0" max="100" step="0.01" data-r={r} data-c={2} className={numBox} value={l.disc} disabled={!l.itemId} onChange={(e) => setLine(l.key, { disc: e.target.value })} /></td>
                      <td className={`${cell} ${ro}`}>{l.itemId ? money(c.rate) : ''}</td>
                      <td className={cell}><input type="number" min="0" step="any" data-r={r} data-c={3} className={numBox} value={l.qty} disabled={!l.itemId} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></td>
                      <td className={`${cell} ${ro}`}>{l.itemId ? money(c.amount) : ''}</td>
                      <td className={`${cell} ${ro}`}>{l.itemId ? c.gstPercent : ''}</td>
                      <td className={cell}><input type="number" min="0" max={MAX_GST} step="0.01" data-r={r} data-c={4} className={numBox} value={l.cgst} disabled={!l.itemId} onChange={(e) => setLine(l.key, { cgst: e.target.value })} /></td>
                      <td className={cell}><input type="number" min="0" max={MAX_GST} step="0.01" data-r={r} data-c={5} className={numBox} value={l.sgst} disabled={!l.itemId} onChange={(e) => setLine(l.key, { sgst: e.target.value })} /></td>
                      <td className={`${cell} ${ro}`}>{l.itemId ? money(c.gstAmount) : ''}</td>
                      <td className={`${cell} ${ro} font-semibold text-ink-800`}>{l.itemId ? money(c.total) : ''}</td>
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
                  <td className={`${cell} px-2 text-right`} colSpan={12 + optCols}>Sum of Total</td>
                  <td className={`${cell} px-1.5 text-right text-ink-900`}>{money(total)}</td>
                  <td className={cell} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => (editing ? navigate('/pharmacy/purchase-order-list') : reset())}>
              <X size={16} /> Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : editing ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
