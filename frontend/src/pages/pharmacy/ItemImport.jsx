import BulkImport from '../../components/BulkImport.jsx';
import { pharmacyItemApi } from '../../api/client.js';

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

// Add Item's full template.
const FULL_TEMPLATE = {
  fileName: 'pharmacy-item',
  columns: TEMPLATE_COLUMNS,
  sample: TEMPLATE_SAMPLE,
  note: "Leave ItemId blank to insert a new item, or fill it to update an existing one. Only ItemName is required — ItemType, Unit, Generic Name, Manufacturer and Supplier accept any value from their dropdown, or a brand-new one (it'll be added automatically). A simpler sheet with just some columns (e.g. Item Name, MRP, Selprice) also works — missing columns are left blank.",
};

// ItemList new's shorter template. Headers are display names; they map onto
// the same fields through HEADER_MAP below.
export const ITEM_LIST_TEMPLATE = {
  fileName: 'pharmacy-item-list',
  columns: ['Item Code', 'Item Name', 'Generic Name', 'Manufacturer', 'HSN', 'MRP', 'Unit', 'GST', 'Sell Price', 'Rack', 'Box No'],
  sample: [['', 'Paracetamol 500mg', 'Acetaminophen', 'GSK', '3004', '18.00', 'Strip', '12', '15.00', 'R1', 'B12']],
  note: 'Leave Item Code blank to add a new item, or keep an existing code (e.g. ITM000042) to update that item. Only Item Name is required — Generic Name, Manufacturer and Unit accept any value from their dropdown, or a brand-new one. A price list with Qty fills Unit. Updating an item only changes the columns in this sheet.',
  // The clinic's price-list sheets carry "Qty" where this screen shows Unit.
  aliases: { qty: 'Unit', quantity: 'Unit' },
};

// Uploaded sheets don't always use the template's exact headers (e.g. a
// price list with just "Item Name", "MRP", "Selprice"), so headers are
// matched ignoring case/spaces/punctuation, plus a few common aliases.
// Columns not present in the file are simply left blank (stored as NULL).
const keyOf = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_MAP = Object.fromEntries([...TEMPLATE_COLUMNS, 'ItemCode', 'Rack', 'BoxNo'].map((c) => [keyOf(c), c]));
Object.assign(HEADER_MAP, {
  item: 'ItemName', name: 'ItemName', selprice: 'SellPrice', sellingprice: 'SellPrice',
  saleprice: 'SellPrice', salesprice: 'SellPrice', gst: 'GSTPercent', discount: 'DiscountPercent',
  hsn: 'HSNCode', menufactor: 'Manufacturer', box: 'BoxNo',
});

function normalizeRow(row, headerMap) {
  const out = {};
  Object.entries(row).forEach(([header, value]) => {
    const col = headerMap[keyOf(header)];
    if (col) out[col] = value;
  });
  // Excel's formatted cell text may carry currency symbols or thousands separators.
  NUMERIC_COLUMNS.forEach((col) => {
    if (out[col] !== undefined) out[col] = String(out[col]).replace(/[^0-9.-]/g, '');
  });
  return out;
}

/**
 * Template download + Excel/CSV upload for pharmacy items, shared by the
 * Add Item and ItemList new screens.
 *  - masters:    useItemMasters() result (template dropdowns; reloaded after import)
 *  - template:   optional { fileName, columns, sample, note, aliases }; defaults to
 *                Add Item's. aliases adds header -> field matches for this template only.
 *  - onImported: optional (result) => void, called with the bulk-save result
 *  - quietSuccess: optional, passed to BulkImport (the page shows its own success message)
 */
export default function ItemImport({ masters, template = FULL_TEMPLATE, onImported, quietSuccess }) {
  const headerMap = { ...HEADER_MAP, ...template.aliases };
  const lists = {
    ItemType: masters.itemTypes.map((t) => t.name),
    Unit: masters.units.map((u) => u.name),
    GenericName: masters.genericNames.map((g) => g.name),
    Manufacturer: masters.manufacturers.map((m) => m.name),
    Supplier: masters.suppliers.map((s) => s.name),
    ScheduleH: ['Yes', 'No'],
    ScheduleH1: ['Yes', 'No'],
  };
  // Keyed by the template's own header text, whatever its spelling.
  const dropdowns = Object.fromEntries(template.columns
    .filter((c) => lists[HEADER_MAP[keyOf(c)]])
    .map((c) => [c, lists[HEADER_MAP[keyOf(c)]]]));

  return (
    <BulkImport
      variant="inline"
      fileName={template.fileName}
      columns={template.columns}
      sample={template.sample}
      note={template.note}
      dropdowns={dropdowns}
      quietSuccess={quietSuccess}
      isHeaderRow={(cells) => cells.some((c) => HEADER_MAP[keyOf(c)] === 'ItemName')}
      onImport={async (rows) => {
        // Rows with no item name (e.g. a report's trailing totals line) carry nothing to import.
        const items = rows.map((r) => normalizeRow(r, headerMap)).filter((r) => String(r.ItemName ?? '').trim());
        if (items.length === 0) {
          return { error: 'No "Item Name" column found — check the sheet has an Item Name header.' };
        }
        const res = await pharmacyItemApi.bulk(items);
        onImported?.(res);
        return res;
      }}
      onDone={masters.reload}
    />
  );
}
