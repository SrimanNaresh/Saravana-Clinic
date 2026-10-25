import { useEffect, useState, useRef } from 'react';
import { Search, Plus, ChevronDown, Check } from 'lucide-react';
import { supplierApi, genericNameApi, manufacturerApi, itemTypeApi, unitApi } from '../../api/client.js';

// Searchable master-data dropdown that can also create a brand-new row (via
// `createFn`) right from here — type a name that doesn't match anything and
// an "Add" option appears. Used for Supplier, Generic Name, Manufacturer,
// Item Type and Unit, each backed by its own small master table (same
// pattern as each other).
export function MasterPicker({ value, onChange, options, onCreated, createFn, placeholder, emptyMessage, addLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = options.find((o) => String(o.id) === String(value));
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  const exactMatch = options.some((o) => o.name.toLowerCase() === q);

  const pick = (id) => { onChange(id); setOpen(false); setQuery(''); };

  const createAndPick = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await createFn(name);
      onCreated(created);
      pick(created.id);
    } catch {
      // leave the dropdown open with the typed query so the user can retry
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="input flex items-center justify-between gap-2 text-left">
        <span className={selected ? 'truncate text-ink-800' : 'truncate text-ink-400'}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-ink-200 bg-white shadow-elevated animate-fade-in">
          <div className="border-b border-ink-100 p-2">
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                autoFocus
                className="w-full rounded-md border border-ink-200 py-1.5 pl-8 pr-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Search or type a new one..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {q && !exactMatch && (
              <button
                type="button"
                onClick={createAndPick}
                disabled={creating}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50"
              >
                <Plus size={15} /> {creating ? 'Adding...' : `Add "${query.trim()}" ${addLabel}`}
              </button>
            )}
            {filtered.length === 0 && !q ? (
              <p className="px-3 py-3 text-center text-sm text-ink-400">{emptyMessage}</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pick(o.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                    String(o.id) === String(value) ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  <span className="truncate">{o.name}</span>
                  {String(o.id) === String(value) && <Check size={15} className="shrink-0 text-brand-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const emptyItemForm = {
  name: '', unitId: '', category: '', hsnCode: '',
  itemTypeId: '', manufacturerId: '', supplierId: '',
  scheduleH: false, scheduleH1: false,
  genericNameId: '', tabletName: '',
  purchaseRate: '', gstPercent: '', mrp: '', sellPrice: '', discountPercent: '',
};

// Maps the camelCase form keys above to the PascalCase row keys the API
// returns, for building an edit form from a selected row (see ItemList.jsx).
export const ITEM_FIELD_TO_ROW_KEY = {
  name: 'Name', unitId: 'UnitId', category: 'Category', hsnCode: 'HSNCode',
  itemTypeId: 'ItemTypeId', manufacturerId: 'ManufacturerId', supplierId: 'SupplierId',
  scheduleH: 'ScheduleH', scheduleH1: 'ScheduleH1',
  genericNameId: 'GenericNameId', tabletName: 'TabletName',
  purchaseRate: 'PurchaseRate', gstPercent: 'GSTPercent', mrp: 'MRP',
  sellPrice: 'SellPrice', discountPercent: 'DiscountPercent',
};

export function rowToItemForm(row) {
  const form = {};
  for (const [formKey, rowKey] of Object.entries(ITEM_FIELD_TO_ROW_KEY)) form[formKey] = row[rowKey];
  return form;
}

// Shared by the Add page and the Edit modal (on the list page) so the two stay in sync.
export function ItemFields({
  form, set,
  suppliers, genericNames, manufacturers, itemTypes, units,
  onSupplierCreated, onGenericNameCreated, onManufacturerCreated, onItemTypeCreated, onUnitCreated,
}) {
  const text = (key) => ({ value: form[key] ?? '', onChange: (e) => set(key, e.target.value) });
  const num = (key) => ({ value: form[key] ?? '', onChange: (e) => set(key, e.target.value), type: 'number', step: '0.01' });
  const check = (key) => ({ checked: !!form[key], onChange: (e) => set(key, e.target.checked) });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="label">Item Name *</label>
          <input className="input" placeholder="e.g. Paracetamol 500mg" {...text('name')} />
        </div>
        <div>
          <label className="label">Item Type</label>
          <MasterPicker
            value={form.itemTypeId}
            onChange={(id) => set('itemTypeId', id)}
            options={itemTypes}
            onCreated={onItemTypeCreated}
            createFn={(name) => itemTypeApi.create({ name }).then((r) => ({ id: r.ItemTypeId, name: r.Name }))}
            placeholder="Select or add type"
            emptyMessage="No item types yet — type a name to add one"
            addLabel="as new item type"
          />
        </div>
        <div>
          <label className="label">Category</label>
          <input className="input" placeholder="e.g. Analgesic" {...text('category')} />
        </div>
        <div>
          <label className="label">HSN Code</label>
          <input className="input" placeholder="e.g. 3004" {...text('hsnCode')} />
        </div>
      </div>

      {/* Manufacturer / Supplier / Generic Name / Tablet Name / Unit: own row, 5 across. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="label">Manufacturer</label>
          <MasterPicker
            value={form.manufacturerId}
            onChange={(id) => set('manufacturerId', id)}
            options={manufacturers}
            onCreated={onManufacturerCreated}
            createFn={(name) => manufacturerApi.create({ name }).then((r) => ({ id: r.ManufacturerId, name: r.Name }))}
            placeholder="Select or add manufacturer"
            emptyMessage="No manufacturers yet — type a name to add one"
            addLabel="as new manufacturer"
          />
        </div>
        <div>
          <label className="label">Supplier</label>
          <MasterPicker
            value={form.supplierId}
            onChange={(id) => set('supplierId', id)}
            options={suppliers}
            onCreated={onSupplierCreated}
            createFn={(name) => supplierApi.create({ name }).then((r) => ({ id: r.SupplierId, name: r.Name }))}
            placeholder="Select or add supplier"
            emptyMessage="No suppliers yet — type a name to add one"
            addLabel="as new supplier"
          />
        </div>
        <div>
          <label className="label">Generic Name</label>
          <MasterPicker
            value={form.genericNameId}
            onChange={(id) => set('genericNameId', id)}
            options={genericNames}
            onCreated={onGenericNameCreated}
            createFn={(name) => genericNameApi.create({ name }).then((r) => ({ id: r.GenericNameId, name: r.Name }))}
            placeholder="Select or add generic name"
            emptyMessage="No generic names yet — type a name to add one"
            addLabel="as new generic name"
          />
        </div>
        <div>
          <label className="label">Tablet Name</label>
          <input className="input" placeholder="Brand / trade name" {...text('tabletName')} />
        </div>
        <div>
          <label className="label">Unit</label>
          <MasterPicker
            value={form.unitId}
            onChange={(id) => set('unitId', id)}
            options={units}
            onCreated={onUnitCreated}
            createFn={(name) => unitApi.create({ name }).then((r) => ({ id: r.UnitId, name: r.Name }))}
            placeholder="Select or add unit"
            emptyMessage="No units yet — type a name to add one"
            addLabel="as new unit"
          />
        </div>
      </div>

      {/* Pricing: its own row, 5 equal fields across a 10-column grid (col-span-2 each). */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 lg:grid-cols-10">
        <div className="lg:col-span-2">
          <label className="label">Purchase Rate</label>
          <input className="input" placeholder="0.00" {...num('purchaseRate')} />
        </div>
        <div className="lg:col-span-2">
          <label className="label">GST %</label>
          <input className="input" placeholder="0.00" {...num('gstPercent')} />
        </div>
        <div className="lg:col-span-2">
          <label className="label">MRP</label>
          <input className="input" placeholder="0.00" {...num('mrp')} />
        </div>
        <div className="lg:col-span-2">
          <label className="label">Sell Price</label>
          <input className="input" placeholder="0.00" {...num('sellPrice')} />
        </div>
        <div className="lg:col-span-2">
          <label className="label">Discount %</label>
          <input className="input" placeholder="0.00" {...num('discountPercent')} />
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300" {...check('scheduleH')} />
          Schedule H
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-300" {...check('scheduleH1')} />
          Schedule H1
        </label>
      </div>
    </div>
  );
}

// Shared master-list loading + "remember a freshly created row" state, used
// by both the Add page and the List page's edit modal.
export function useItemMasters() {
  const [suppliers, setSuppliers] = useState([]);
  const [genericNames, setGenericNames] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [units, setUnits] = useState([]);

  const load = () => {
    supplierApi.list().then((rows) => setSuppliers(rows.map((r) => ({ id: r.SupplierId, name: r.Name })))).catch(() => setSuppliers([]));
    genericNameApi.list().then((rows) => setGenericNames(rows.map((r) => ({ id: r.GenericNameId, name: r.Name })))).catch(() => setGenericNames([]));
    manufacturerApi.list().then((rows) => setManufacturers(rows.map((r) => ({ id: r.ManufacturerId, name: r.Name })))).catch(() => setManufacturers([]));
    itemTypeApi.list().then((rows) => setItemTypes(rows.map((r) => ({ id: r.ItemTypeId, name: r.Name })))).catch(() => setItemTypes([]));
    unitApi.list().then((rows) => setUnits(rows.map((r) => ({ id: r.UnitId, name: r.Name })))).catch(() => setUnits([]));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const addTo = (setList) => (row) => setList((c) => [...c, row].sort((a, b) => a.name.localeCompare(b.name)));

  return {
    suppliers, genericNames, manufacturers, itemTypes, units,
    addSupplier: addTo(setSuppliers),
    addGenericName: addTo(setGenericNames),
    addManufacturer: addTo(setManufacturers),
    addItemType: addTo(setItemTypes),
    addUnit: addTo(setUnits),
    // After a bulk import may have created new master rows (new item types,
    // units, etc. via "type a new value" during import), refetch all lists
    // in one go rather than trying to merge in just what changed.
    reload: load,
  };
}
