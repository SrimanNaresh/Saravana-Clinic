import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PackagePlus, Save, Trash2, X, List, CheckCircle2 } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import BulkImport from '../../components/BulkImport.jsx';
import { useToast } from '../../hooks/useToast.js';
import {
  pharmacyItemApi, vendorApi, unitApi, manufacturerApi, purchaseInvoiceApi, stockInwardApi,
} from '../../api/client.js';
import { MasterPicker } from './itemFormParts.jsx';

const emptyForm = {
  purchaseInvoiceId: '', billDate: '', itemId: '', hsnCode: '', manufacturerId: '', vendorId: '',
  quantity: '', unitId: '', batch: '', expiryMonth: '',
  oldPrice: '', currentPrice: '', gstPercent: '', discountPercent: '',
};

const orBlank = (v) => (v === null || v === undefined ? '' : v);
// API dates come as ISO strings; the date box takes YYYY-MM-DD, the month box YYYY-MM.
const isoPart = (v, len) => (v ? String(v).slice(0, len) : '');

const rowToForm = (r) => ({
  purchaseInvoiceId: r.PurchaseInvoiceId ?? '', billDate: isoPart(r.BillDate, 10),
  itemId: r.ItemId ?? '', hsnCode: orBlank(r.HSNCode), manufacturerId: r.ManufacturerId ?? '',
  vendorId: r.VendorId ?? '', quantity: orBlank(r.Quantity), unitId: r.UnitId ?? '',
  batch: orBlank(r.Batch), expiryMonth: isoPart(r.ExpiryDate, 7),
  oldPrice: orBlank(r.OldPrice), currentPrice: orBlank(r.CurrentPrice),
  gstPercent: orBlank(r.GSTPercent), discountPercent: orBlank(r.DiscountPercent),
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

// Excel template, in the form's field order. Headers are matched ignoring
// case/spaces/punctuation, so "GST %" or "Expiry" also import. Bill Date and
// Exp Date cells are Text so Excel keeps them as typed.
const EXP_COLUMN = 'Exp Date (MM/YYYY)';
const TEMPLATE_COLUMNS = [
  'Purchase Code', 'Bill Date', 'Item Name', 'HSN', 'Manufacturer', 'Vendor', 'Qty', 'Unit', 'Batch',
  EXP_COLUMN, 'Old Price', 'Current Price', 'GST', 'Discount', 'Net Price',
];
const TEMPLATE_SAMPLE = [
  ['PINV000001', '14/05/2026', 'Paracetamol 500mg', '3004', 'GSK', 'MedPlus Distributors', '10', 'Strip', 'B1234',
    '05/2027', '10.00', '10.50', '12', '5', '111.72'],
];
const TEMPLATE_NOTE = 'Each row is a new inward entry. Item Name, Vendor and Qty are required; an item or vendor not on file yet is added. Purchase Code must be an existing Purchase Invoice (e.g. PINV000012); a blank Bill Date takes that invoice\'s date. Bill Date is DD/MM/YYYY and Exp Date MM/YYYY. Blank HSN, Manufacturer, Unit, GST, Discount and Old Price are filled from the item. Net Price is worked out from Qty, Current Price, Discount and GST.';
const keyOf = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
// Normalised header -> the field the bulk route takes.
const HEADER_MAP = {
  purchasecode: 'PurchaseCode', code: 'PurchaseCode', billdate: 'BillDate', date: 'BillDate',
  itemname: 'ItemName', item: 'ItemName', name: 'ItemName',
  hsn: 'HSN', hsncode: 'HSN', manufacturer: 'Manufacturer', vendor: 'Vendor',
  qty: 'Qty', quantity: 'Qty', unit: 'Unit', batch: 'Batch', batchno: 'Batch',
  [keyOf(EXP_COLUMN)]: 'ExpDate', expdate: 'ExpDate', expiry: 'ExpDate', expirydate: 'ExpDate', exp: 'ExpDate',
  oldprice: 'OldPrice', currentprice: 'CurrentPrice', price: 'CurrentPrice',
  gst: 'GST', gstpercent: 'GST', discount: 'Discount', discountpercent: 'Discount', netprice: 'NetPrice',
};
const NUMERIC_FIELDS = ['Qty', 'OldPrice', 'CurrentPrice', 'GST', 'Discount', 'NetPrice'];

function normalizeRow(row) {
  const out = {};
  Object.entries(row).forEach(([header, value]) => {
    const field = HEADER_MAP[keyOf(header)];
    if (field) out[field] = String(value ?? '').trim();
  });
  // Excel's formatted cell text may carry currency symbols or thousands separators.
  NUMERIC_FIELDS.forEach((f) => { if (out[f]) out[f] = out[f].replace(/[^0-9.-]/g, ''); });
  return out;
}

export default function StockInward() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [form, setForm] = useState(emptyForm);
  // Set when Inward List's Edit opened a record here; null while adding a new one.
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [units, setUnits] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  // Saved entries (newest first), for each item's last price.
  const [entries, setEntries] = useState([]);
  // Success banner after an import.
  const [notice, setNotice] = useState('');

  const loadItems = useCallback(() => pharmacyItemApi.list().then((r) => setItems(r.map((i) => ({
    id: i.ItemId, name: i.Name, unitId: i.UnitId, hsnCode: i.HSNCode, manufacturerId: i.ManufacturerId,
    gstPercent: i.GSTPercent, discountPercent: i.DiscountPercent, purchaseRate: i.PurchaseRate,
  })))).catch(() => show('Failed to load items', 'error')), [show]);
  const loadVendors = useCallback(() => vendorApi.list()
    .then((r) => setVendors(r.map((v) => ({ id: v.VendorId, name: v.VendorName }))))
    .catch(() => show('Failed to load vendors', 'error')), [show]);
  const loadManufacturers = useCallback(() => manufacturerApi.list()
    .then((r) => setManufacturers(r.map((m) => ({ id: m.ManufacturerId, name: m.Name }))))
    .catch(() => show('Failed to load manufacturers', 'error')), [show]);
  const loadUnits = useCallback(() => unitApi.list()
    .then((r) => setUnits(r.map((u) => ({ id: u.UnitId, name: u.Name }))))
    .catch(() => show('Failed to load units', 'error')), [show]);
  const loadInvoices = useCallback(() => purchaseInvoiceApi.list()
    .then((r) => setInvoices(r.map((p) => ({ id: p.PurchaseInvoiceId, name: p.Code, date: isoPart(p.TransDate, 10) }))))
    .catch(() => show('Failed to load purchase codes', 'error')), [show]);
  const loadEntries = useCallback(() => stockInwardApi.list().then(setEntries).catch(() => {}), []);

  useEffect(() => {
    loadItems(); loadVendors(); loadManufacturers(); loadUnits(); loadInvoices(); loadEntries();
  }, [loadItems, loadVendors, loadManufacturers, loadUnits, loadInvoices, loadEntries]);

  useEffect(() => {
    if (location.state?.editInward) {
      setForm(rowToForm(location.state.editInward));
      setEditingId(location.state.editInward.StockInwardId);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  // Each item's latest inward price ({ [ItemId]: price }), for Old Price —
  // the list comes newest first, so the first price seen per item is its latest.
  const lastPrices = useMemo(() => {
    const prices = {};
    entries.forEach((r) => { if (prices[r.ItemId] === undefined && r.CurrentPrice != null) prices[r.ItemId] = r.CurrentPrice; });
    return prices;
  }, [entries]);

  const set = (key, value) => setForm((c) => ({ ...c, [key]: value }));

  // Picking a Purchase Code fills Bill Date with that invoice's date.
  const pickInvoice = (id) => {
    const invoice = invoices.find((p) => String(p.id) === String(id));
    setForm((c) => ({ ...c, purchaseInvoiceId: id, billDate: invoice?.date || c.billDate }));
  };

  // Picking an item fills in what Item Master knows about it (HSN,
  // manufacturer, unit, GST, discount) and its Old Price: the price it last
  // came in at, else its purchase rate. Everything stays editable.
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

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };
  // Cancel while editing goes back to the list it came from.
  const cancel = () => (editingId ? navigate('/pharmacy/stock-inward-list') : resetForm());

  const save = async (e) => {
    e.preventDefault();
    if (!form.itemId) return show('Select an item', 'error');
    if (!form.vendorId) return show('Select a vendor', 'error');
    if (!(Number(form.quantity) > 0)) return show('Qty must be a number greater than 0', 'error');
    const body = { ...form, netPrice };
    setSaving(true);
    try {
      if (editingId) {
        await stockInwardApi.update(editingId, body);
        show('Inward entry updated successfully', 'success');
      } else {
        await stockInwardApi.create(body);
        show('Inward entry saved successfully', 'success');
      }
      resetForm();
      loadEntries();
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editingId) return;
    if (!confirm('Delete this inward entry?')) return;
    try {
      await stockInwardApi.remove(editingId);
      show('Inward entry deleted successfully', 'success');
      resetForm();
      loadEntries();
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  // Import can add items, vendors, manufacturers and units, so their pickers reload.
  const afterImport = () => {
    loadItems(); loadVendors(); loadManufacturers(); loadUnits(); loadEntries();
  };

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={PackagePlus}
            title={editingId ? 'Edit Inward' : 'Inward'}
            subtitle={editingId ? 'Update or delete this inward entry' : 'Record stock received against a purchase'}
            actions={
              <>
                <BulkImport
                  variant="inline"
                  fileName="stock-inward"
                  columns={TEMPLATE_COLUMNS}
                  sample={TEMPLATE_SAMPLE}
                  note={TEMPLATE_NOTE}
                  dropdowns={{
                    'Purchase Code': invoices.map((p) => p.name),
                    Manufacturer: manufacturers.map((m) => m.name),
                    Vendor: vendors.map((v) => v.name),
                    Unit: units.map((u) => u.name),
                  }}
                  textColumns={['Bill Date', EXP_COLUMN]}
                  isHeaderRow={(cells) => cells.some((c) => HEADER_MAP[keyOf(c)] === 'ItemName')}
                  quietSuccess
                  onImport={async (rowsIn) => {
                    setNotice('');
                    const data = rowsIn.map(normalizeRow).filter((r) => r.ItemName);
                    if (data.length === 0) {
                      return { error: 'No "Item Name" column found — check the sheet has an Item Name header.' };
                    }
                    const res = await stockInwardApi.bulk(data);
                    if (res.inserted > 0) {
                      const failed = res.failed ? `, ${res.failed} failed` : '';
                      setNotice(`Import successful — ${res.inserted} entr${res.inserted === 1 ? 'y' : 'ies'} added${failed}.${res.note ? ` ${res.note}` : ''}`);
                    }
                    return res;
                  }}
                  onDone={afterImport}
                />
                <button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/stock-inward-list')}>
                  <List size={16} /> View List
                </button>
              </>
            }
          />
          {notice && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              <CheckCircle2 size={16} className="shrink-0" />
              <span className="flex-1">{notice}</span>
              <button type="button" className="btn-ghost px-1 py-0.5 text-emerald-700" title="Dismiss" onClick={() => setNotice('')}><X size={14} /></button>
            </div>
          )}
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
            <button
              type="button" className="btn-danger" disabled={!editingId} onClick={remove}
              title={editingId ? 'Delete this inward entry' : 'Open an entry from Inward List to delete it'}
            >
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
