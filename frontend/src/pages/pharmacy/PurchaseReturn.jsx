import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Undo2, Save, X, List } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import {
  pharmacyItemApi, vendorApi, unitApi, manufacturerApi, purchaseInvoiceApi, purchaseReturnApi,
} from '../../api/client.js';
import { MasterPicker } from './itemFormParts.jsx';

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  purchaseInvoiceId: '', billDate: '', returnDate: today(),
  itemId: '', hsnCode: '', manufacturerId: '', vendorId: '', quantity: '', unitId: '', batch: '', expiryMonth: '',
  oldPrice: '', currentPrice: '', gstPercent: '', discountPercent: '',
});

const orBlank = (v) => (v === null || v === undefined ? '' : v);
// API dates come as ISO strings; the date box takes YYYY-MM-DD, the month box YYYY-MM.
const isoPart = (v, len) => (v ? String(v).slice(0, len) : '');
// Exp Date is kept as the last day of its month.
function monthEnd(ym) {
  if (!ym) return null;
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

// Net Price = Qty x Current Price, less Discount %, plus GST % on the
// discounted amount. Blank until Qty and Current Price are filled.
function netPriceOf({ quantity, currentPrice, gstPercent, discountPercent }) {
  const qty = Number(quantity);
  const price = Number(currentPrice);
  if (!(qty > 0) || currentPrice === '' || Number.isNaN(price)) return '';
  const afterDiscount = qty * price * (1 - (Number(discountPercent) || 0) / 100);
  return (afterDiscount * (1 + (Number(gstPercent) || 0) / 100)).toFixed(2);
}

// A saved return (list row) and its one line back into the form. Returns saved
// before this form have only item / qty / batch / expiry / rate, and their
// rate shows as Current Price.
const savedToForm = (row, line) => ({
  purchaseInvoiceId: row.PurchaseInvoiceId ?? '', billDate: isoPart(row.BillDate, 10),
  returnDate: isoPart(row.TransDate, 10) || today(), vendorId: row.VendorId ?? '',
  itemId: line?.ItemId ?? '', hsnCode: orBlank(line?.HSNCode), manufacturerId: line?.ManufacturerId ?? '',
  quantity: orBlank(line?.Quantity), unitId: line?.UnitId ?? '', batch: orBlank(line?.Batch),
  expiryMonth: isoPart(line?.ExpiryDate, 7), oldPrice: orBlank(line?.OldPrice),
  currentPrice: orBlank(line?.CurrentPrice ?? line?.Rate), gstPercent: orBlank(line?.GSTPercent),
  discountPercent: orBlank(line?.DiscountPercent),
});

export default function PurchaseReturn() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [form, setForm] = useState(emptyForm);
  // Set when Return List's Edit opened a record here; null while adding a new one.
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [units, setUnits] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const loadInvoices = useCallback(() => purchaseInvoiceApi.list()
    .then((r) => setInvoices(r.map((p) => ({
      id: p.PurchaseInvoiceId, name: p.Code, date: isoPart(p.TransDate, 10), supplierId: p.SupplierId,
    }))))
    .catch(() => show('Failed to load purchase codes', 'error')), [show]);

  useEffect(() => {
    pharmacyItemApi.list().then((r) => setItems(r.map((i) => ({
      id: i.ItemId, name: i.Name, unitId: i.UnitId, hsnCode: i.HSNCode, manufacturerId: i.ManufacturerId,
      gstPercent: i.GSTPercent, discountPercent: i.DiscountPercent, purchaseRate: i.PurchaseRate,
    })))).catch(() => show('Failed to load items', 'error'));
    vendorApi.list().then((r) => setVendors(r.map((v) => ({ id: v.VendorId, name: v.VendorName }))))
      .catch(() => show('Failed to load vendors', 'error'));
    manufacturerApi.list().then((r) => setManufacturers(r.map((m) => ({ id: m.ManufacturerId, name: m.Name }))))
      .catch(() => show('Failed to load manufacturers', 'error'));
    unitApi.list().then((r) => setUnits(r.map((u) => ({ id: u.UnitId, name: u.Name }))))
      .catch(() => show('Failed to load units', 'error'));
    loadInvoices();
  }, [show, loadInvoices]);

  // Return List hands off a row to edit via navigation state; load it (and
  // its line) once, then clear the state so a refresh starts blank again.
  useEffect(() => {
    const row = location.state?.editReturn;
    if (!row) return;
    navigate(location.pathname, { replace: true, state: null });
    purchaseReturnApi.items(row.PurchaseReturnId)
      .then((lines) => {
        setForm(savedToForm(row, lines[0]));
        setEditingId(row.PurchaseReturnId);
        if (lines.length > 1) show('This return has more than one item — only the first is shown, and saving keeps just that one', 'error');
      })
      .catch(() => show('Failed to load return for editing', 'error'));
  }, [location.state, location.pathname, navigate, show]);

  const set = (key, value) => setForm((c) => ({ ...c, [key]: value }));

  // Picking a Purchase Code fills Bill Date with that invoice's date.
  const pickInvoice = (id) => {
    const invoice = invoices.find((p) => String(p.id) === String(id));
    setForm((c) => ({ ...c, purchaseInvoiceId: id, billDate: invoice?.date || c.billDate }));
  };

  // Picking an item fills in what Item Master knows about it (HSN,
  // manufacturer, unit, GST, discount, and its purchase rate as Old Price).
  // Everything stays editable.
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
      oldPrice: orBlank(item.purchaseRate),
    }));
  };
  const netPrice = netPriceOf(form);
  const num = (key, placeholder = '0.00') => ({
    type: 'number', min: '0', step: 'any', inputMode: 'decimal', className: 'input', placeholder,
    value: form[key], onChange: (e) => set(key, e.target.value),
  });

  const backToList = () => navigate('/pharmacy/purchase-return-list');

  const cancel = () => {
    if (editingId) return backToList();
    setForm(emptyForm());
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.itemId) return show('Select an item', 'error');
    if (!form.vendorId) return show('Select a vendor', 'error');
    if (!(Number(form.quantity) > 0)) return show('Qty must be a number greater than 0', 'error');
    const invoice = invoices.find((p) => String(p.id) === String(form.purchaseInvoiceId));
    const payload = {
      transDate: form.returnDate,
      billDate: form.billDate || null,
      vendorId: form.vendorId,
      purchaseInvoiceId: form.purchaseInvoiceId || null,
      supplierId: invoice?.supplierId || null,
      items: [{
        itemId: form.itemId,
        quantity: Number(form.quantity),
        rate: Number(form.currentPrice) || 0,
        amount: netPrice === '' ? 0 : Number(netPrice),
        batch: form.batch,
        expiryDate: monthEnd(form.expiryMonth),
        hsnCode: form.hsnCode,
        manufacturerId: form.manufacturerId,
        unitId: form.unitId,
        oldPrice: form.oldPrice,
        currentPrice: form.currentPrice,
        gstPercent: form.gstPercent,
        discountPercent: form.discountPercent,
        netPrice,
      }],
    };
    setSaving(true);
    try {
      if (editingId) {
        await purchaseReturnApi.update(editingId, payload);
        show('Return updated successfully', 'success');
        backToList();
      } else {
        await purchaseReturnApi.create(payload);
        show('Return saved successfully', 'success');
        setForm(emptyForm());
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={Undo2}
            title={editingId ? 'Edit Purchase Return' : 'Purchase Return'}
            subtitle={editingId ? 'Update this saved return' : 'Return an item to its vendor'}
            actions={
              <button type="button" className="btn-secondary" onClick={backToList}>
                <List size={16} /> View List
              </button>
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Purchase Code</label>
              <MasterPicker
                value={form.purchaseInvoiceId} onChange={pickInvoice} options={invoices}
                placeholder="Select purchase code" emptyMessage="No purchase invoices yet — add them in Purchase › Invoice."
              />
            </div>
            <div>
              <label className="label">Bill Date</label>
              <input type="date" className="input" value={form.billDate} onChange={(e) => set('billDate', e.target.value)} />
            </div>
            <div>
              <label className="label">Return Date</label>
              <input type="date" className="input" value={form.returnDate} onChange={(e) => set('returnDate', e.target.value)} />
            </div>
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
              <label className="label">Batch</label>
              <input className="input" placeholder="e.g. B1234" value={form.batch} onChange={(e) => set('batch', e.target.value)} />
            </div>
            <div>
              <label className="label">Exp Date (Mon/Yr)</label>
              <input type="month" className="input" value={form.expiryMonth} onChange={(e) => set('expiryMonth', e.target.value)} />
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
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
