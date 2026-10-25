import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, List } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import BulkImport from '../../components/BulkImport.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi } from '../../api/client.js';
import { ItemFields, emptyItemForm, useItemMasters } from './itemFormParts.jsx';

const TEMPLATE_COLUMNS = [
  'ItemId', 'ItemName', 'ItemType', 'GenericName', 'TabletName', 'Manufacturer', 'Supplier', 'Unit',
  'Category', 'HSNCode', 'PurchaseRate', 'GSTPercent', 'MRP', 'SellPrice', 'DiscountPercent',
  'ScheduleH', 'ScheduleH1',
];
const TEMPLATE_SAMPLE = [
  ['', 'Paracetamol 500mg', 'Tablet', 'Acetaminophen', 'Calpol', 'GSK', 'MedPlus Distributors', 'Strip',
    'Analgesic', '3004', '10.50', '12', '18.00', '15.00', '5', 'No', 'No'],
];
const NUMERIC_COLUMNS = ['PurchaseRate', 'GSTPercent', 'MRP', 'SellPrice', 'DiscountPercent'];

// Uploaded sheets don't always use the template's exact headers (e.g. a
// price list with just "Item Name", "MRP", "Selprice"), so headers are
// matched ignoring case/spaces/punctuation, plus a few common aliases.
// Columns not present in the file are simply left blank (stored as NULL).
const keyOf = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_MAP = Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [keyOf(c), c]));
Object.assign(HEADER_MAP, {
  item: 'ItemName', name: 'ItemName', selprice: 'SellPrice', sellingprice: 'SellPrice',
  saleprice: 'SellPrice', salesprice: 'SellPrice', gst: 'GSTPercent', discount: 'DiscountPercent',
  hsn: 'HSNCode',
});

function normalizeRow(row) {
  const out = {};
  Object.entries(row).forEach(([header, value]) => {
    const col = HEADER_MAP[keyOf(header)];
    if (col) out[col] = value;
  });
  // Excel's formatted cell text may carry currency symbols or thousands separators.
  NUMERIC_COLUMNS.forEach((col) => {
    if (out[col] !== undefined) out[col] = String(out[col]).replace(/[^0-9.-]/g, '');
  });
  return out;
}

export default function Item() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [form, setForm] = useState(emptyItemForm);
  const [saving, setSaving] = useState(false);
  const masters = useItemMasters();

  const set = (key, value) => setForm((c) => ({ ...c, [key]: value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return show('Item name is required', 'error');
    setSaving(true);
    try {
      await pharmacyItemApi.create(form);
      show('Item saved', 'success');
      setForm(emptyItemForm);
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
            icon={Package}
            title="Add Item"
            subtitle="Register a new stock item"
            actions={
              <>
                <BulkImport
                  variant="inline"
                  fileName="pharmacy-item"
                  columns={TEMPLATE_COLUMNS}
                  sample={TEMPLATE_SAMPLE}
                  note="Leave ItemId blank to insert a new item, or fill it to update an existing one. Only ItemName is required — ItemType, Unit, Generic Name, Manufacturer and Supplier accept any value from their dropdown, or a brand-new one (it'll be added automatically). A simpler sheet with just some columns (e.g. Item Name, MRP, Selprice) also works — missing columns are left blank."
                  dropdowns={{
                    ItemType: masters.itemTypes.map((t) => t.name),
                    Unit: masters.units.map((u) => u.name),
                    GenericName: masters.genericNames.map((g) => g.name),
                    Manufacturer: masters.manufacturers.map((m) => m.name),
                    Supplier: masters.suppliers.map((s) => s.name),
                    ScheduleH: ['Yes', 'No'],
                    ScheduleH1: ['Yes', 'No'],
                  }}
                  isHeaderRow={(cells) => cells.some((c) => HEADER_MAP[keyOf(c)] === 'ItemName')}
                  onImport={async (rows) => {
                    // Rows with no item name (e.g. a report's trailing totals line) carry nothing to import.
                    const items = rows.map(normalizeRow).filter((r) => String(r.ItemName ?? '').trim());
                    if (items.length === 0) {
                      return { error: 'No "Item Name" column found — check the sheet has an Item Name header.' };
                    }
                    const res = await pharmacyItemApi.bulk(items);
                    // Clean import -> go straight to the list to see the new rows;
                    // with failures, stay here so the row errors remain visible.
                    if (!res.failed && res.inserted + res.updated > 0) navigate('/pharmacy/item-list');
                    return res;
                  }}
                  onDone={masters.reload}
                />
                <button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/item-list')}>
                  <List size={16} /> View List
                </button>
              </>
            }
          />

          <ItemFields
            form={form} set={set}
            suppliers={masters.suppliers} genericNames={masters.genericNames} manufacturers={masters.manufacturers}
            itemTypes={masters.itemTypes} units={masters.units}
            onSupplierCreated={masters.addSupplier} onGenericNameCreated={masters.addGenericName} onManufacturerCreated={masters.addManufacturer}
            onItemTypeCreated={masters.addItemType} onUnitCreated={masters.addUnit}
          />

          <div className="mt-4">
            <button type="submit" className="btn-primary" disabled={saving}>
              <Plus size={16} /> {saving ? 'Saving...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
