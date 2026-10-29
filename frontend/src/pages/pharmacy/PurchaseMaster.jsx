import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, List, Save, Trash2, X } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import BulkImport from '../../components/BulkImport.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, vendorApi, unitApi, manufacturerApi, purchaseMasterApi } from '../../api/client.js';
import CellCombo from './CellCombo.jsx';

// One vendor and a line per item: adding saves a purchase entry per filled
// line (blank lines are skipped); editing an entry has exactly one line.
// Each line's item is searched for in its own Item cell.
const emptyLine = {
  itemId: '', itemName: '', manufacturerName: '', quantity: '', unitName: '',
  oldPrice: '', currentPrice: '', gstPercent: '', discountPercent: '', netPrice: '',
};
// Lines get a running key for React, since a line's item can change or be blank.
let lineSeq = 0;
const newLine = () => ({ ...emptyLine, key: ++lineSeq });
const BLANK_LINES = 3;
const blankForm = () => ({ vendorName: '', lines: Array.from({ length: BLANK_LINES }, newLine) });
const isBlankLine = (line) => Object.keys(emptyLine).every((k) => String(line[k]).trim() === '');

// Round "add a row" button: a filled circle with an outlined plus.
function AddRowButton({ size, onClick, title, className = '' }) {
  return (
    <button
      type="button" onClick={onClick} title={title} aria-label={title}
      className={`shrink-0 rounded-full text-ink-900 transition-colors hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${className}`}
    >
      <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" className="block">
        <circle cx="256" cy="256" r="256" fill="currentColor" />
        <path
          d="M226 156A30 30 0 0 1 286 156V226H356A30 30 0 0 1 356 286H286V356A30 30 0 0 1 226 356V286H156A30 30 0 0 1 156 226H226Z"
          fill="none" stroke="white" strokeWidth="20" strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// Every value box is text (they're typeahead boxes), so numbers are kept as strings.
const str = (v) => (v === null || v === undefined ? '' : String(v));

const toItem = (r) => ({
  id: r.ItemId, name: r.Name, unitName: r.UnitName, manufacturerName: r.ManufacturerName,
  gstPercent: r.GSTPercent, discountPercent: r.DiscountPercent, purchaseRate: r.PurchaseRate,
});

const rowToForm = (r) => ({
  vendorName: str(r.VendorName),
  lines: [{
    key: ++lineSeq, itemId: r.ItemId ?? '', itemName: str(r.ItemName), manufacturerName: str(r.ManufacturerName),
    quantity: str(r.Quantity), unitName: str(r.UnitName),
    oldPrice: str(r.OldPrice), currentPrice: str(r.CurrentPrice),
    gstPercent: str(r.GSTPercent), discountPercent: str(r.DiscountPercent), netPrice: str(r.NetPrice),
  }],
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

// Each line's value boxes, like Bulk Itemlist's GST cells: each one's dropdown
// lists the values already used on purchase entries, "Add" keeps a typed
// value, and Edit / Delete rename or clear a value on every entry that has
// it. `field` is the PurchaseMaster column (and list row key).
const VALUE_BOXES = {
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
const TEMPLATE_NOTE = 'Each row is a new purchase entry. Item Name, Vendor and Qty are required; an item or vendor not on file yet is added. HSN is always taken from Item Master; the HSN column is only used for an item added by the import. Blank Manufacturer, Unit, GST, Discount and Old Price are filled from the item. Net Price is worked out from Qty, Current Price, Discount and GST.';
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
  const [form, setForm] = useState(blankForm);
  // Set when Purchase Master List's Edit opened a record here; null while adding new ones.
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
  const loadItems = useCallback(() => pharmacyItemApi.list().then((rows) => setItems(rows.map(toItem)))
    .catch(() => show('Failed to load items', 'error')), [show]);
  const loadVendors = useCallback(() => vendorApi.list()
    .then((rows) => setVendors(rows.map((r) => ({ id: r.VendorId, name: r.VendorName, row: r }))))
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

  const itemOf = (id) => items.find((i) => String(i.id) === String(id));

  const setLine = (index, key, value) => setForm((c) => ({
    ...c,
    lines: c.lines.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, [key]: value };
      return NET_INPUTS.includes(key) ? withNet(next) : next;
    }),
  }));

  // A picked item's line is filled in from what Item Master knows about it
  // (manufacturer, unit, GST, discount) and its Old Price: the price it was
  // last purchased at, else its purchase rate. Everything stays editable.
  // HSN isn't on the form: the backend always takes it from Item Master.
  const lineFor = (id, line = emptyLine) => {
    const item = itemOf(id);
    if (!item) return { ...line, itemId: id };
    return withNet({
      ...line,
      itemId: id,
      manufacturerName: str(item.manufacturerName) || line.manufacturerName,
      unitName: str(item.unitName) || line.unitName,
      gstPercent: str(item.gstPercent),
      discountPercent: str(item.discountPercent),
      oldPrice: str(lastPrices[id] ?? item.purchaseRate),
    });
  };

  // Item cell: typing a name that matches an item (ignoring case) picks it and
  // fills the line; any other text leaves the line without an item. Text that
  // still names the line's item keeps it — that covers an item just added
  // from the dropdown, which isn't in `items` yet when its name comes back.
  const setItemName = (index, text) => setForm((c) => ({
    ...c,
    lines: c.lines.map((line, i) => {
      if (i !== index) return line;
      const typed = text.trim().toLowerCase();
      const match = items.find((it) => it.name.toLowerCase() === typed);
      if (match && String(match.id) !== String(line.itemId)) return { ...lineFor(match.id, line), itemName: text };
      const keep = match || (line.itemId && line.itemName.trim().toLowerCase() === typed);
      return { ...line, itemName: text, itemId: keep ? line.itemId : '' };
    }),
  }));
  // A name not in Item Master can be added to it from the dropdown, as in Bulk Itemlist.
  const itemHandlers = (index) => ({
    createFn: (name) => pharmacyItemApi.create({ name }).then(toItem),
    onCreated: (item) => {
      setItems((c) => [...c, item]);
      setForm((c) => ({ ...c, lines: c.lines.map((l, i) => (i === index ? { ...l, itemId: item.id, itemName: item.name } : l)) }));
    },
    addLabel: 'as new item',
  });
  // A new blank line goes just below line `after`, or at the end.
  const addLine = (after = form.lines.length - 1) => setForm((c) => ({
    ...c, lines: [...c.lines.slice(0, after + 1), newLine(), ...c.lines.slice(after + 1)],
  }));
  const removeLine = (index) => setForm((c) => ({ ...c, lines: c.lines.filter((_, i) => i !== index) }));

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

  // Manufacturer box: names from Manufacturer master; a new name is added to it.
  const manufacturerHandlers = {
    createFn: (name) => manufacturerApi.create({ name }).then((r) => ({ id: r.ManufacturerId, name: r.Name })),
    onCreated: (row) => setManufacturers((c) => [...c, row].sort((a, b) => a.name.localeCompare(b.name))),
    addLabel: 'as new manufacturer',
  };

  // Vendor box: names from Vendor Master; a new name is added to it (just the
  // name; the rest of its details can be filled in Vendor Master later).
  const vendorHandlers = {
    createFn: (vendorName) => vendorApi.create({ vendorName })
      .then((r) => ({ id: r.VendorId, name: r.VendorName, row: r })),
    onCreated: (row) => setVendors((c) => [row, ...c]),
    addLabel: 'as new vendor',
    // The vendor update replaces every field, so the rest are sent back as they are.
    onRename: async (opt, vendorName) => {
      const r = opt.row;
      await vendorApi.update(opt.id, {
        vendorName, companyName: r.CompanyName, contactPerson: r.ContactPerson, contactNo: r.ContactNo,
        alternateNo: r.AlternateNo, address: r.Address, gstNo: r.GSTNo, dlNo: r.DLNo, email: r.Email,
      });
      await loadVendors();
      show(`Renamed vendor "${opt.name}" to "${vendorName}"`, 'success');
    },
    onDelete: async (opt) => {
      if (!confirm(`Delete vendor "${opt.name}"?`)) return false;
      await vendorApi.remove(opt.id);
      await loadVendors();
      show(`Deleted vendor "${opt.name}"`, 'success');
      return true;
    },
  };

  const cellClass = 'input py-1.5 text-sm';
  const valueCell = (index, key) => (
    <td className="px-1 py-1.5">
      <CellCombo
        className={`${cellClass} w-24`} placeholder={VALUE_BOXES[key].placeholder ?? '0.00'}
        value={form.lines[index][key]} onChange={(v) => setLine(index, key, v)} options={suggestions[key]}
        {...valueHandlers(key)}
      />
    </td>
  );

  const backToList = () => navigate('/pharmacy/purchase-master-list');

  const cancel = () => {
    if (editingId) return backToList();
    setForm(blankForm());
  };

  // Turns a typed master name into its id, adding it to the master when new.
  // Names already resolved in this save are reused, so a new name typed on
  // several lines is only added once.
  const resolver = (list, handlers) => {
    const ids = new Map(list.map((o) => [o.name.toLowerCase(), o.id]));
    return async (typed) => {
      const name = typed.trim();
      if (!name) return null;
      if (!ids.has(name.toLowerCase())) {
        const created = await handlers.createFn(name);
        handlers.onCreated(created);
        ids.set(name.toLowerCase(), created.id);
      }
      return ids.get(name.toLowerCase());
    };
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.vendorName.trim()) return show('Select a vendor', 'error');
    const lines = form.lines.filter((l) => !isBlankLine(l));
    if (lines.length === 0) return show('Add an item to the list', 'error');
    const noItem = lines.find((l) => !l.itemId);
    if (noItem) {
      const typed = noItem.itemName.trim();
      return show(typed ? `"${typed}" is not in Item Master — pick it from the list or add it` : 'Pick an item on every filled row', 'error');
    }
    for (const line of lines) {
      // Several lines: say which item a problem is on.
      const on = lines.length > 1 ? `${itemOf(line.itemId)?.name ?? 'Item'}: ` : '';
      if (!(Number(line.quantity) > 0)) return show(`${on}Qty must be a number greater than 0`, 'error');
      const notNumber = Object.entries(VALUE_BOXES)
        .find(([key, b]) => b.numeric && line[key].trim() !== '' && Number.isNaN(Number(line[key])));
      if (notNumber) return show(`${on}${notNumber[1].label.replace(' *', '')} must be a number`, 'error');
    }
    setSaving(true);
    try {
      const unitId = resolver(units, unitHandlers);
      const manufacturerId = resolver(manufacturers, manufacturerHandlers);
      const vendorId = await resolver(vendors, vendorHandlers)(form.vendorName);
      const bodies = [];
      for (const { unitName, manufacturerName, key, itemName, ...rest } of lines) {
        bodies.push({ ...rest, unitId: await unitId(unitName), manufacturerId: await manufacturerId(manufacturerName) });
      }
      if (editingId) {
        await purchaseMasterApi.update(editingId, { ...bodies[0], vendorId });
        show('Purchase updated successfully', 'success');
      } else {
        const { inserted } = await purchaseMasterApi.createMany(vendorId, bodies);
        show(inserted === 1 ? 'Purchase saved successfully' : `${inserted} purchases saved successfully`, 'success');
      }
      setForm(blankForm());
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
      setForm(blankForm());
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
            subtitle={editingId ? 'Update or delete this purchase entry' : 'Record items bought from a vendor'}
            actions={
              <>
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
                <button type="button" className="btn-secondary" onClick={backToList}>
                  <List size={16} /> View List
                </button>
              </>
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Vendor *</label>
              <CellCombo
                className="input" placeholder="Select or type a vendor"
                value={form.vendorName} onChange={(v) => setForm((c) => ({ ...c, vendorName: v }))} options={vendors}
                {...vendorHandlers}
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="max-h-[22rem] overflow-auto rounded-lg border border-ink-100">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-ink-50 text-xs font-semibold uppercase text-ink-500">
                  <tr>
                    <th className="rounded-l-lg px-2 py-2">Item *</th>
                    <th className="px-1 py-2">Manufacturer</th>
                    <th className="px-1 py-2">Qty *</th>
                    <th className="px-1 py-2">Unit</th>
                    <th className="px-1 py-2">Old Price</th>
                    <th className="px-1 py-2">Current Price</th>
                    <th className="px-1 py-2">GST %</th>
                    <th className="px-1 py-2">Discount %</th>
                    <th className="px-1 py-2">Net Price</th>
                    <th className="rounded-r-lg px-1 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {form.lines.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-2 py-6 text-center text-sm text-ink-400">
                        No rows — use the + below to add an item.
                      </td>
                    </tr>
                  )}
                  {form.lines.map((line, index) => (
                    <tr key={line.key}>
                      <td className="px-1 py-1.5">
                        <CellCombo
                          className={`${cellClass} w-48`} placeholder="Search item"
                          value={line.itemName} onChange={(v) => setItemName(index, v)} options={items}
                          {...itemHandlers(index)}
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <CellCombo
                          className={`${cellClass} w-40`} placeholder="Select manufacturer"
                          value={line.manufacturerName} onChange={(v) => setLine(index, 'manufacturerName', v)}
                          options={manufacturers} {...manufacturerHandlers}
                        />
                      </td>
                      {valueCell(index, 'quantity')}
                      <td className="px-1 py-1.5">
                        <CellCombo
                          className={`${cellClass} w-28`} placeholder="Select unit"
                          value={line.unitName} onChange={(v) => setLine(index, 'unitName', v)} options={units}
                          {...unitHandlers}
                        />
                      </td>
                      {valueCell(index, 'oldPrice')}
                      {valueCell(index, 'currentPrice')}
                      {valueCell(index, 'gstPercent')}
                      {valueCell(index, 'discountPercent')}
                      {valueCell(index, 'netPrice')}
                      <td className="px-1 py-1.5">
                        {!editingId && (
                          <div className="flex items-center gap-1">
                            <AddRowButton size={24} onClick={() => addLine(index)} title="Add a new row below this one" />
                            <button type="button" className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeLine(index)} title="Remove this item">
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* With every row removed there's no row icon left, so one shows here. */}
            {!editingId && form.lines.length === 0 && (
              <AddRowButton size={32} onClick={() => addLine()} title="Add a new row" className="mt-2" />
            )}
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

