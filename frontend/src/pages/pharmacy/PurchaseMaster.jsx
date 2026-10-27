import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Save, Trash2, X } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, vendorApi, unitApi, manufacturerApi, purchaseMasterApi } from '../../api/client.js';
import { MasterPicker } from './itemFormParts.jsx';

const emptyForm = {
  itemId: '', hsnCode: '', manufacturerId: '', vendorId: '', quantity: '', unitId: '',
  oldPrice: '', currentPrice: '', gstPercent: '', discountPercent: '',
};

const rowToForm = (r) => ({
  itemId: r.ItemId ?? '', hsnCode: r.HSNCode ?? '', manufacturerId: r.ManufacturerId ?? '',
  vendorId: r.VendorId ?? '', quantity: r.Quantity ?? '', unitId: r.UnitId ?? '',
  oldPrice: r.OldPrice ?? '', currentPrice: r.CurrentPrice ?? '',
  gstPercent: r.GSTPercent ?? '', discountPercent: r.DiscountPercent ?? '',
});

// Net Price = Qty x Current Price, less Discount %, plus GST % on the
// discounted amount. Blank until Qty and Current Price are filled.
function netPriceOf({ quantity, currentPrice, gstPercent, discountPercent }) {
  const qty = Number(quantity);
  const price = Number(currentPrice);
  if (!(qty > 0) || currentPrice === '' || Number.isNaN(price)) return '';
  const afterDiscount = qty * price * (1 - (Number(discountPercent) || 0) / 100);
  return (afterDiscount * (1 + (Number(gstPercent) || 0) / 100)).toFixed(2);
}

const orBlank = (v) => (v === null || v === undefined ? '' : v);

export default function PurchaseMaster() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [form, setForm] = useState(emptyForm);
  // Set when Purchase Master List's Edit opened a record here; null while adding a new one.
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [units, setUnits] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  // Each item's latest purchased price ({ [ItemId]: price }), for Old Price.
  const [lastPrices, setLastPrices] = useState({});

  useEffect(() => {
    pharmacyItemApi.list().then((rows) => setItems(rows.map((r) => ({
      id: r.ItemId, name: r.Name, unitId: r.UnitId, hsnCode: r.HSNCode, manufacturerId: r.ManufacturerId,
      gstPercent: r.GSTPercent, discountPercent: r.DiscountPercent, purchaseRate: r.PurchaseRate,
    })))).catch(() => show('Failed to load items', 'error'));
    manufacturerApi.list().then((rows) => setManufacturers(rows.map((r) => ({ id: r.ManufacturerId, name: r.Name }))))
      .catch(() => show('Failed to load manufacturers', 'error'));
    // The list comes newest first, so the first price seen per item is its latest.
    purchaseMasterApi.list().then((rows) => {
      const prices = {};
      rows.forEach((r) => { if (prices[r.ItemId] === undefined && r.CurrentPrice != null) prices[r.ItemId] = r.CurrentPrice; });
      setLastPrices(prices);
    }).catch(() => {});
    vendorApi.list().then((rows) => setVendors(rows.map((r) => ({ id: r.VendorId, name: r.VendorName }))))
      .catch(() => show('Failed to load vendors', 'error'));
    unitApi.list().then((rows) => setUnits(rows.map((r) => ({ id: r.UnitId, name: r.Name }))))
      .catch(() => show('Failed to load units', 'error'));
  }, [show]);

  useEffect(() => {
    if (location.state?.editPurchase) {
      setForm(rowToForm(location.state.editPurchase));
      setEditingId(location.state.editPurchase.PurchaseMasterId);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const set = (key, value) => setForm((c) => ({ ...c, [key]: value }));

  // Picking an item fills in what Item Master knows about it (HSN,
  // manufacturer, unit, GST, discount) and its Old Price: the price it was
  // last purchased at, else its purchase rate. Everything stays editable.
  const pickItem = (id) => {
    const item = items.find((i) => String(i.id) === String(id));
    if (!item) return set('itemId', id);
    setForm((c) => ({
      ...c,
      itemId: id,
      hsnCode: orBlank(item.hsnCode) || c.hsnCode,
      manufacturerId: orBlank(item.manufacturerId) || c.manufacturerId,
      unitId: orBlank(item.unitId) || c.unitId,
      gstPercent: orBlank(item.gstPercent),
      discountPercent: orBlank(item.discountPercent),
      oldPrice: orBlank(lastPrices[id] ?? item.purchaseRate),
    }));
  };
  const netPrice = netPriceOf(form);
  const num = (key, placeholder = '0.00') => ({
    type: 'number', min: '0', step: 'any', inputMode: 'decimal', className: 'input', placeholder,
    value: form[key], onChange: (e) => set(key, e.target.value),
  });

  const backToList = () => navigate('/pharmacy/purchase-master-list');

  const cancel = () => {
    if (editingId) return backToList();
    setForm(emptyForm);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.itemId) return show('Select an item', 'error');
    if (!form.vendorId) return show('Select a vendor', 'error');
    if (!(Number(form.quantity) > 0)) return show('Qty must be a number greater than 0', 'error');
    const body = { ...form, netPrice };
    setSaving(true);
    try {
      if (editingId) {
        await purchaseMasterApi.update(editingId, body);
        show('Purchase updated successfully', 'success');
      } else {
        await purchaseMasterApi.create(body);
        show('Purchase saved successfully', 'success');
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editingId) return;
    if (!confirm('Delete this purchase entry?')) return;
    try {
      await purchaseMasterApi.remove(editingId);
      show('Purchase deleted successfully', 'success');
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={ClipboardList}
            title={editingId ? 'Edit Purchase' : 'Purchase Master'}
            subtitle={editingId ? 'Update or delete this purchase entry' : 'Record an item bought from a vendor'}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Item Name *</label>
              <MasterPicker
                value={form.itemId} onChange={pickItem} options={items}
                placeholder="Select item" emptyMessage="No items yet — add them in Item."
              />
            </div>
            <div>
              <label className="label">HSN</label>
              <input className="input" placeholder="e.g. 3004" value={form.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} />
            </div>
            <div>
              <label className="label">Manufacturer</label>
              <MasterPicker
                value={form.manufacturerId} onChange={(id) => set('manufacturerId', id)} options={manufacturers}
                onCreated={(row) => setManufacturers((c) => [...c, row].sort((a, b) => a.name.localeCompare(b.name)))}
                createFn={(name) => manufacturerApi.create({ name }).then((r) => ({ id: r.ManufacturerId, name: r.Name }))}
                placeholder="Select manufacturer" emptyMessage="No manufacturers yet — type a name to add one" addLabel="as new manufacturer"
              />
            </div>
            <div>
              <label className="label">Vendor *</label>
              <MasterPicker
                value={form.vendorId} onChange={(id) => set('vendorId', id)} options={vendors}
                placeholder="Select vendor" emptyMessage="No vendors yet — add them in Vendor Master."
              />
            </div>
            <div>
              <label className="label">Qty *</label>
              <input {...num('quantity', '0')} />
            </div>
            <div>
              <label className="label">Unit</label>
              <MasterPicker
                value={form.unitId} onChange={(id) => set('unitId', id)} options={units}
                onCreated={(row) => setUnits((c) => [...c, row].sort((a, b) => a.name.localeCompare(b.name)))}
                createFn={(name) => unitApi.create({ name }).then((r) => ({ id: r.UnitId, name: r.Name }))}
                placeholder="Select unit" emptyMessage="No units yet." addLabel="unit"
              />
            </div>
            <div>
              <label className="label">Old Price</label>
              <input {...num('oldPrice')} />
            </div>
            <div>
              <label className="label">Current Price</label>
              <input {...num('currentPrice')} />
            </div>
            <div>
              <label className="label">GST %</label>
              <input {...num('gstPercent')} />
            </div>
            <div>
              <label className="label">Discount %</label>
              <input {...num('discountPercent')} />
            </div>
            <div>
              <label className="label">Net Price</label>
              <input
                className="input bg-ink-50 font-semibold" readOnly value={netPrice} placeholder="0.00"
                title="Qty × Current Price, less Discount %, plus GST %"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" className="btn-secondary" onClick={cancel}>
              <X size={16} /> Cancel
            </button>
            <button type="button" className="btn-danger" onClick={remove} disabled={!editingId} title={editingId ? 'Delete this purchase entry' : 'Open an entry from Purchase Master List to delete it'}>
              <Trash2 size={16} /> Delete
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
