import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Save, Trash2, X } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import BulkImport from '../../components/BulkImport.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, vendorApi, unitApi, manufacturerApi, purchaseMasterApi } from '../../api/client.js';
import { MasterPicker } from './itemFormParts.jsx';
import CellCombo from './CellCombo.jsx';

const emptyForm = {
  itemId: '', hsnCode: '', manufacturerId: '', vendorId: '', quantity: '', unitName: '',
  oldPrice: '', currentPrice: '', gstPercent: '', discountPercent: '', netPrice: '',
};

// Every value box is text (they're typeahead boxes), so numbers are kept as strings.
const str = (v) => (v === null || v === undefined ? '' : String(v));

const rowToForm = (r) => ({
  itemId: r.ItemId ?? '', hsnCode: str(r.HSNCode), manufacturerId: r.ManufacturerId ?? '',
  vendorId: r.VendorId ?? '', quantity: str(r.Quantity), unitName: str(r.UnitName),
  oldPrice: str(r.OldPrice), currentPrice: str(r.CurrentPrice),
  gstPercent: str(r.GSTPercent), discountPercent: str(r.DiscountPercent), netPrice: str(r.NetPrice),
});

// Net Price = Qty x Current Price, less Discount %, plus GST % on the
// discounted amount. Blank until Qty and Current Price are filled.
function netPriceOf({ quantity, currentPrice, gstPercent, discountPercent }) {
  const qty = Number(quantity);
  const price = Number(currentPrice);
  if (!(qty > 0) || currentPrice.trim() === '' || Number.isNaN(price)) return '';
  const afterDiscount = qty * price * (1 - (Number(discountPercent) || 0) / 100);
  return (afterDiscount * (1 + (Number(gstPercent) || 0) / 100)).toFixed(2);
}
// Changing one of these works Net Price out again; it can still be typed over after.
const NET_INPUTS = ['quantity', 'currentPrice', 'gstPercent', 'discountPercent'];
const withNet = (f) => ({ ...f, netPrice: netPriceOf(f) });

// The value boxes, like ItemList new's HSN / GST cells: each one's dropdown
// lists the values already used on purchase entries, "Add" keeps a typed
// value, and Edit / Delete rename or clear a value on every entry that has
// it. `field` is the PurchaseMaster column (and list row key).
const VALUE_BOXES = {
  hsnCode: { field: 'HSNCode', label: 'HSN', placeholder: 'e.g. 3004', noun: 'HSN code' },
  quantity: { field: 'Quantity', label: 'Qty *', placeholder: '0', noun: 'qty', numeric: true },
  oldPrice: { field: 'OldPrice', label: 'Old Price', noun: 'old price', numeric: true },
  currentPrice: { field: 'CurrentPrice', label: 'Current Price', noun: 'current price', numeric: true },
  gstPercent: { field: 'GSTPercent', label: 'GST %', noun: 'GST %', numeric: true },
  discountPercent: { field: 'DiscountPercent', label: 'Discount %', noun: 'discount %', numeric: true },
  netPrice: { field: 'NetPrice', label: 'Net Price', noun: 'net price', numeric: true },
};
const addLocal = (name) => Promise.resolve({ id: name, name });

// Excel template, in the form's field order. Headers are matched ignoring
// case/spaces/punctuation, so "GST %" or "net price" also import.
const TEMPLATE_COLUMNS = [
  'Item Name', 'HSN', 'Manufacturer', 'Vendor', 'Qty', 'Unit',
  'Old Price', 'Current Price', 'GST', 'Discount', 'Net Price',
];
const TEMPLATE_SAMPLE = [
  ['Paracetamol 500mg', '3004', 'GSK', 'MedPlus Distributors', '10', 'Strip', '10.00', '10.50', '12', '5', '111.72'],
];
const TEMPLATE_NOTE = 'Each row is a new purchase entry. Item Name, Vendor and Qty are required; an item or vendor not on file yet is added. Blank HSN, Manufacturer, Unit, GST, Discount and Old Price are filled from the item. Net Price is worked out from Qty, Current Price, Discount and GST.';
const keyOf = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
// Normalised header -> the field the bulk route takes.
const HEADER_MAP = {
  itemname: 'ItemName', item: 'ItemName', name: 'ItemName',
  hsn: 'HSN', hsncode: 'HSN', manufacturer: 'Manufacturer', vendor: 'Vendor',
  qty: 'Qty', quantity: 'Qty', unit: 'Unit',
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
  // Saved purchase entries (newest first): the value boxes' suggestions and Old Price.
  const [purchases, setPurchases] = useState([]);
  // Values added from a value box's dropdown: { [key]: [name] }.
  const [addedValues, setAddedValues] = useState({});

  const loadManufacturers = useCallback(() => manufacturerApi.list()
    .then((rows) => setManufacturers(rows.map((r) => ({ id: r.ManufacturerId, name: r.Name }))))
    .catch(() => show('Failed to load manufacturers', 'error')), [show]);
  const loadUnits = useCallback(() => unitApi.list()
    .then((rows) => setUnits(rows.map((r) => ({ id: r.UnitId, name: r.Name }))))
    .catch(() => show('Failed to load units', 'error')), [show]);
  const loadPurchases = useCallback(() => purchaseMasterApi.list().then(setPurchases).catch(() => {}), []);
  const loadItems = useCallback(() => pharmacyItemApi.list().then((rows) => setItems(rows.map((r) => ({
    id: r.ItemId, name: r.Name, unitName: r.UnitName, hsnCode: r.HSNCode, manufacturerId: r.ManufacturerId,
    gstPercent: r.GSTPercent, discountPercent: r.DiscountPercent, purchaseRate: r.PurchaseRate,
  })))).catch(() => show('Failed to load items', 'error')), [show]);
  const loadVendors = useCallback(() => vendorApi.list()
    .then((rows) => setVendors(rows.map((r) => ({ id: r.VendorId, name: r.VendorName }))))
    .catch(() => show('Failed to load vendors', 'error')), [show]);
  // Import can add items, vendors, manufacturers and units, so it reloads them all.
  const loadAll = useCallback(() => {
    loadItems(); loadVendors(); loadManufacturers(); loadUnits(); loadPurchases();
  }, [loadItems, loadVendors, loadManufacturers, loadUnits, loadPurchases]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (location.state?.editPurchase) {
      setForm(rowToForm(location.state.editPurchase));
      setEditingId(location.state.editPurchase.PurchaseMasterId);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  // Each item's latest purchased price ({ [ItemId]: price }) — the list comes
  // newest first, so the first price seen per item is its latest.
  const lastPrices = useMemo(() => {
    const prices = {};
    purchases.forEach((r) => { if (prices[r.ItemId] === undefined && r.CurrentPrice != null) prices[r.ItemId] = r.CurrentPrice; });
    return prices;
  }, [purchases]);

  // Distinct values per value box, from the saved entries plus any just added.
  const suggestions = useMemo(() => Object.fromEntries(Object.entries(VALUE_BOXES).map(([key, b]) => {
    const seen = new Map();
    [...purchases.map((r) => str(r[b.field]).trim()), ...(addedValues[key] || [])].forEach((v) => {
      if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
    });
    const names = [...seen.values()].sort((a, c) => a.localeCompare(c, undefined, { numeric: true }));
    return [key, names.map((n) => ({ id: n, name: n }))];
  })), [purchases, addedValues]);

  const set = (key, value) => setForm((c) => {
    const next = { ...c, [key]: value };
    return NET_INPUTS.includes(key) ? withNet(next) : next;
  });

  // Picking an item fills in what Item Master knows about it (HSN,
  // manufacturer, unit, GST, discount) and its Old Price: the price it was
  // last purchased at, else its purchase rate. Everything stays editable.
  const pickItem = (id) => {
    const item = items.find((i) => String(i.id) === String(id));
    if (!item) return set('itemId', id);
    setForm((c) => withNet({
      ...c,
      itemId: id,
      hsnCode: str(item.hsnCode) || c.hsnCode,
      manufacturerId: item.manufacturerId ?? c.manufacturerId,
      unitName: str(item.unitName) || c.unitName,
      gstPercent: str(item.gstPercent),
      discountPercent: str(item.discountPercent),
      oldPrice: str(lastPrices[id] ?? item.purchaseRate),
    }));
  };

  // Value box Edit / Delete: rename or clear the value on every saved entry.
  const valueHandlers = (key) => {
    const b = VALUE_BOXES[key];
    const swapAdded = (from, to) => setAddedValues((a) => ({
      ...a, [key]: (a[key] || []).filter((v) => v !== from).concat(to ? [to] : []),
    }));
    const entries = (n) => `${n} entr${n === 1 ? 'y' : 'ies'}`;
    return {
      createFn: addLocal,
      onCreated: (row) => setAddedValues((a) => ({ ...a, [key]: [...(a[key] || []), row.name] })),
      addLabel: `as new ${b.noun}`,
      onRename: async (opt, name) => {
        if (b.numeric && Number.isNaN(Number(name))) throw new Error(`${b.label.replace(' *', '')} must be a number`);
        const { affected } = await purchaseMasterApi.replaceValue(b.field, opt.name, name);
        swapAdded(opt.name, name);
        await loadPurchases();
        show(`Renamed ${b.noun} "${opt.name}" to "${name}" on ${entries(affected)}`, 'success');
      },
      onDelete: async (opt) => {
        if (!confirm(`Delete ${b.noun} "${opt.name}"? It will be cleared from every purchase entry that has it.`)) return false;
        const { affected } = await purchaseMasterApi.replaceValue(b.field, opt.name, '');
        swapAdded(opt.name, null);
        await loadPurchases();
        show(`Deleted ${b.noun} "${opt.name}" from ${entries(affected)}`, 'success');
        return true;
      },
    };
  };

  // Unit box: names from Unit master, with New / Edit / Delete acting on the master.
  const unitHandlers = {
    createFn: (name) => unitApi.create({ name }).then((r) => ({ id: r.UnitId, name: r.Name })),
    onCreated: (row) => setUnits((c) => [...c, row].sort((a, b) => a.name.localeCompare(b.name))),
    addLabel: 'as new unit',
    onRename: async (opt, name) => {
      await unitApi.update(opt.id, { name });
      await loadUnits();
      show(`Renamed unit "${opt.name}" to "${name}"`, 'success');
    },
    onDelete: async (opt) => {
      if (!confirm(`Delete unit "${opt.name}" from the list?`)) return false;
      await unitApi.remove(opt.id);
      await loadUnits();
      show(`Deleted unit "${opt.name}"`, 'success');
      return true;
    },
  };

  const valueBox = (key) => (
    <div>
      <label className="label">{VALUE_BOXES[key].label}</label>
      <CellCombo
        className="input" placeholder={VALUE_BOXES[key].placeholder ?? '0.00'}
        value={form[key]} onChange={(v) => set(key, v)} options={suggestions[key]}
        {...valueHandlers(key)}
      />
    </div>
  );

  const backToList = () => navigate('/pharmacy/purchase-master-list');

  const cancel = () => {
    if (editingId) return backToList();
    setForm(emptyForm);
  };

  // The unit typed into the Unit box, as an id — added to Unit master when new.
  const resolveUnitId = async () => {
    const name = form.unitName.trim();
    if (!name) return null;
    const match = units.find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (match) return match.id;
    const created = await unitHandlers.createFn(name);
    unitHandlers.onCreated(created);
    return created.id;
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.itemId) return show('Select an item', 'error');
    if (!form.vendorId) return show('Select a vendor', 'error');
    if (!(Number(form.quantity) > 0)) return show('Qty must be a number greater than 0', 'error');
    const notNumber = Object.entries(VALUE_BOXES)
      .find(([key, b]) => b.numeric && form[key].trim() !== '' && Number.isNaN(Number(form[key])));
    if (notNumber) return show(`${notNumber[1].label.replace(' *', '')} must be a number`, 'error');
    setSaving(true);
    try {
      const { unitName, ...rest } = form;
      const body = { ...rest, unitId: await resolveUnitId() };
      if (editingId) {
        await purchaseMasterApi.update(editingId, body);
        show('Purchase updated successfully', 'success');
      } else {
        await purchaseMasterApi.create(body);
        show('Purchase saved successfully', 'success');
      }
      setForm(emptyForm);
      setEditingId(null);
      loadPurchases();
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
      loadPurchases();
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
            actions={
              <BulkImport
                variant="inline"
                fileName="purchase-master"
                columns={TEMPLATE_COLUMNS}
                sample={TEMPLATE_SAMPLE}
                note={TEMPLATE_NOTE}
                dropdowns={{
                  Manufacturer: manufacturers.map((m) => m.name),
                  Vendor: vendors.map((v) => v.name),
                  Unit: units.map((u) => u.name),
                }}
                isHeaderRow={(cells) => cells.some((c) => HEADER_MAP[keyOf(c)] === 'ItemName')}
                onImport={async (rows) => {
                  const entries = rows.map(normalizeRow).filter((r) => r.ItemName);
                  if (entries.length === 0) {
                    return { error: 'No "Item Name" column found — check the sheet has an Item Name header.' };
                  }
                  return purchaseMasterApi.bulk(entries);
                }}
                onDone={loadAll}
              />
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Item Name *</label>
              <MasterPicker
                value={form.itemId} onChange={pickItem} options={items}
                placeholder="Select item" emptyMessage="No items yet — add them in Item."
              />
            </div>
            {valueBox('hsnCode')}
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
            {valueBox('quantity')}
            <div>
              <label className="label">Unit</label>
              <CellCombo
                className="input" placeholder="Select unit"
                value={form.unitName} onChange={(v) => set('unitName', v)} options={units}
                {...unitHandlers}
              />
            </div>
            {valueBox('oldPrice')}
            {valueBox('currentPrice')}
            {valueBox('gstPercent')}
            {valueBox('discountPercent')}
            {valueBox('netPrice')}
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
