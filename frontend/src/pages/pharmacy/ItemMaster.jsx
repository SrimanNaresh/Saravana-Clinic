import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, Save, X, List } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { itemMasterApi } from '../../api/client.js';
import CellCombo from './CellCombo.jsx';
import { usePickLists } from './usePickLists.js';

const MAX_GST = 28;

const emptyForm = {
  name: '', unit: '', hsnCode: '', pack: '', quantity: '', mrp: '', cgstPercent: '', sgstPercent: '', rack: '', boxNo: '',
  generic: '', manufacturer: '', category: '', potency: '', schedule: 'None', status: 'Active',
};

const str = (v) => (v == null ? '' : String(v));
const numStr = (v) => (v == null ? '' : String(Number(v)));

const rowToForm = (r) => ({
  name: str(r.Name), unit: str(r.UnitName), hsnCode: str(r.HSNCode), pack: str(r.Pack), quantity: numStr(r.Stock),
  mrp: numStr(r.MRP), cgstPercent: numStr(r.CGSTPercent), sgstPercent: numStr(r.SGSTPercent),
  rack: str(r.Rack), boxNo: str(r.BoxNo), generic: str(r.GenericName), manufacturer: str(r.ManufacturerName),
  category: str(r.Category), potency: str(r.Potency), schedule: r.Schedule || 'None', status: r.Status || 'Active',
});

// Same checks the server runs; returns the first problem or null.
function validate(f) {
  if (!f.name.trim()) return 'Item Name is required';
  if (f.quantity !== '' && !(Number(f.quantity) >= 0)) return 'Quantity must be 0 or more';
  if (f.mrp !== '' && !(Number(f.mrp) >= 0)) return 'MRP must be 0 or more';
  const c = Number(f.cgstPercent || 0);
  const s = Number(f.sgstPercent || 0);
  if (!(c >= 0 && c <= MAX_GST) || !(s >= 0 && s <= MAX_GST)) return `CGST % and SGST % must be between 0 and ${MAX_GST}`;
  if (c + s > MAX_GST) return `CGST % + SGST % can't be more than ${MAX_GST}`;
  return null;
}

// Pharmacy > Item > Master: add or edit an item. On Add the Quantity is the
// opening stock; on Edit it shows the current stock, and changing it records
// an adjustment for the difference.
export default function ItemMaster() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const { handlersFor } = usePickLists((m) => show(m, 'error'));
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null); // { id, code, qty } while editing; qty = stock when loaded
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = location.state?.editItemId;
    if (!id) return;
    navigate(location.pathname, { replace: true, state: null });
    itemMasterApi.get(id)
      .then((r) => { const f = rowToForm(r); setForm(f); setEditing({ id: r.ItemId, code: r.ItemCode, qty: f.quantity }); })
      .catch(() => show('Failed to load the item', 'error'));
  }, [location.state, location.pathname, navigate, show]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const onInput = (key) => (e) => set(key)(e.target.value);

  const toList = (flash) => navigate('/pharmacy/item-list', flash ? { state: { flash } } : undefined);

  const save = async (e) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return show(problem, 'error');
    setSaving(true);
    try {
      if (editing) {
        // Quantity goes only when it was changed, so a sale made meanwhile isn't undone.
        await itemMasterApi.update(editing.id, { ...form, quantity: form.quantity === editing.qty ? '' : form.quantity });
        toList(`${form.name} updated`);
      } else {
        const r = await itemMasterApi.create(form);
        show(`Saved ${form.name} (${r.ItemCode})`, 'success');
        setForm(emptyForm);
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const gst = Number(form.cgstPercent || 0) + Number(form.sgstPercent || 0);
  const inp = 'input';
  const combo = inp;
  const field = (label, child, extra = '') => (
    <div className={extra}>
      <label className="label truncate whitespace-nowrap" title={label}>{label}</label>
      {child}
    </div>
  );

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={Package}
            title={editing ? `Edit Item · ${editing.code}` : 'Item Master'}
            subtitle={editing ? 'Update this item' : 'Add a new item — the code is given on save'}
            actions={
              <button type="button" className="btn-secondary" onClick={() => toList()}>
                <List size={16} /> Item List
              </button>
            }
          />

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 lg:grid-cols-[2.4fr_1fr_1.6fr_repeat(7,minmax(0,1fr))]">
            {field('Item Name *', <input className={inp} value={form.name} onChange={onInput('name')} placeholder="e.g. Arnica Montana" />, 'col-span-2 sm:col-span-2 lg:col-span-1')}
            {field('Pack', <input className={inp} value={form.pack} onChange={onInput('pack')} placeholder="10's" />)}
            {field('Type / Unit', <CellCombo className={combo} value={form.unit} onChange={set('unit')} placeholder="Pick or add" {...handlersFor('unit')} />)}
            {field('HSN', <input className={inp} value={form.hsnCode} onChange={onInput('hsnCode')} />)}
            {field(editing ? 'Quantity (stock)' : 'Quantity', (
              <input type="number" min="0" step="any" className={inp} value={form.quantity} onChange={onInput('quantity')} title={editing ? 'Changing it records a stock adjustment' : 'Opening stock'} />
            ))}
            {field('MRP', <input type="number" min="0" step="0.01" className={inp} value={form.mrp} onChange={onInput('mrp')} />)}
            {field('CGST %', <input type="number" min="0" max={MAX_GST} step="0.01" className={inp} value={form.cgstPercent} onChange={onInput('cgstPercent')} />)}
            {field('SGST %', <input type="number" min="0" max={MAX_GST} step="0.01" className={inp} value={form.sgstPercent} onChange={onInput('sgstPercent')} />)}
            {field('Rack', <input className={inp} value={form.rack} onChange={onInput('rack')} />)}
            {field('Box', <input className={inp} value={form.boxNo} onChange={onInput('boxNo')} />)}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
            {field('Generic Name', <CellCombo className={combo} value={form.generic} onChange={set('generic')} placeholder="Pick or add" {...handlersFor('generic')} />)}
            {field('Manufacturer', <CellCombo className={combo} value={form.manufacturer} onChange={set('manufacturer')} placeholder="Pick or add" {...handlersFor('manufacturer')} />)}
            {field('Category', <CellCombo className={combo} value={form.category} onChange={set('category')} placeholder="Pick or add" {...handlersFor('category')} />)}
            {field('Potency', <CellCombo className={combo} value={form.potency} onChange={set('potency')} placeholder="Pick or add" {...handlersFor('potency')} />)}
            {field('Schedule', (
              <select className={inp} value={form.schedule} onChange={onInput('schedule')}>
                <option value="None">None</option>
                <option value="H">H</option>
                <option value="H1">H1</option>
              </select>
            ))}
            {field('Status', (
              <select className={inp} value={form.status} onChange={onInput('status')}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className={`text-xs ${gst > MAX_GST ? 'text-red-600' : 'text-ink-500'}`}>
              GST for billing: <b>{gst}%</b> (CGST + SGST, max {MAX_GST}%)
              {!editing && ' · Selling price starts at the MRP; Stock In sets it later.'}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => (editing ? toList() : setForm(emptyForm))}>
                <X size={16} /> Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={16} /> {saving ? 'Saving...' : editing ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
