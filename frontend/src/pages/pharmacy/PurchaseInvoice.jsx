import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileInput, Plus, Trash2, Save, X } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, supplierApi, purchaseInvoiceApi } from '../../api/client.js';

const today = () => new Date().toISOString().slice(0, 10);

// Expiry is entered as 4 digits (MM/YY), typed without the slash — typing
// "0327" displays as "03/27" as you go, matching how it's printed on the
// actual medicine strip/box.
function formatExpiry(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}
function expiryToIso(mmYY) {
  const m = /^(\d{2})\/(\d{2})$/.exec(mmYY);
  if (!m) return null;
  return `20${m[2]}-${m[1]}-01`;
}
function isoToExpiry(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}
const emptyLine = () => ({
  key: Math.random(),
  itemId: '', rack: '', manufacturer: '', pack: '', batch: '', expiry: '',
  oldMrp: '', qty: '1', free: '', mrp: '', rate: '', discount: '', gst: '', hsnCode: '',
});

// Per-line taxable value / final amount: taxable value is the discounted
// goods value (GST applied on top of that, not on MRP), amount is what the
// line actually costs including GST. Free-quantity units aren't billed.
function lineCalc(l) {
  const qty = Number(l.qty) || 0;
  const rate = Number(l.rate) || 0;
  const discount = Number(l.discount) || 0;
  const gst = Number(l.gst) || 0;
  const taxableValue = qty * rate * (1 - discount / 100);
  const amount = taxableValue * (1 + gst / 100);
  return { taxableValue, amount };
}

export default function PurchaseInvoice() {
  const { toast, show } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [transDate, setTransDate] = useState(today());
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState(() => Array.from({ length: 5 }, emptyLine));
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { pharmacyItemApi.list().then(setCatalog).catch(() => setCatalog([])); }, []);
  useEffect(() => {
    supplierApi.list().then((rs) => setSuppliers(rs.map((r) => ({ value: String(r.SupplierId), label: r.Name })))).catch(() => setSuppliers([]));
  }, []);

  const itemOptions = catalog.map((it) => ({ value: String(it.ItemId), label: it.Name }));

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  // Item-wise auto-fill, per the Purchase Invoice spec: picking an item pulls
  // in its Manufacturer, MRP, GST%, Discount% and Pack (= Item Type) — all
  // still editable per line afterward, since a batch can legitimately differ.
  const onPickItem = (key, itemIdStr) => {
    const it = catalog.find((i) => String(i.ItemId) === itemIdStr);
    setLine(key, {
      itemId: itemIdStr,
      manufacturer: it?.ManufacturerName ?? '',
      pack: it?.ItemTypeName ?? '',
      mrp: it?.MRP ?? '',
      rate: it?.PurchaseRate ?? '',
      discount: it?.DiscountPercent ?? '',
      gst: it?.GSTPercent ?? '',
      hsnCode: it?.HSNCode ?? '',
    });
  };

  const grandTotal = lines.reduce((sum, l) => sum + lineCalc(l).amount, 0);

  const resetForm = () => {
    setEditingId(null);
    setLines(Array.from({ length: 5 }, emptyLine));
    setSupplierId('');
    setTransDate(today());
  };

  const save = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0);
    if (validLines.length === 0) return show('Add at least one item with a quantity', 'error');
    if (!supplierId) return show('Supplier is required', 'error');
    setSaving(true);
    try {
      const payload = {
        transDate,
        supplierId: Number(supplierId),
        items: validLines.map((l) => {
          const { taxableValue, amount } = lineCalc(l);
          return {
            itemId: Number(l.itemId), quantity: Number(l.qty), rate: Number(l.rate) || 0, amount,
            rack: l.rack, manufacturer: l.manufacturer, pack: l.pack, batch: l.batch,
            expiryDate: expiryToIso(l.expiry),
            oldMrp: l.oldMrp, free: l.free, mrp: l.mrp,
            discountPercent: l.discount, gstPercent: l.gst, taxableValue, hsnCode: l.hsnCode,
          };
        }),
      };
      if (editingId) {
        await purchaseInvoiceApi.update(editingId, payload);
        show('Updated', 'success');
        resetForm();
        // Editing is initiated from the List page — return there to see the result.
        navigate('/pharmacy/purchase-invoice-list');
      } else {
        await purchaseInvoiceApi.create(payload);
        show('Saved', 'success');
        // A fresh entry stays on this page, ready for the next invoice.
        resetForm();
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Loads a saved invoice's header + line items back into the entry form for
  // editing — Save then updates that record in place instead of creating a new one.
  const startEdit = async (row) => {
    try {
      const items = await purchaseInvoiceApi.items(row.PurchaseInvoiceId);
      setEditingId(row.PurchaseInvoiceId);
      setTransDate(new Date(row.TransDate).toISOString().slice(0, 10));
      setSupplierId(String(row.SupplierId));
      setLines(items.length ? items.map((it) => ({
        key: Math.random(),
        itemId: String(it.ItemId), rack: it.Rack || '', manufacturer: it.ManufacturerName || '',
        pack: it.Pack || '', batch: it.Batch || '', expiry: isoToExpiry(it.ExpiryDate),
        oldMrp: it.OldMRP ?? '', qty: String(it.Quantity), free: it.FreeQty ?? '',
        mrp: it.MRP ?? '', rate: String(it.Rate), discount: it.DiscountPercent ?? '',
        gst: it.GSTPercent ?? '', hsnCode: it.HSNCode || '',
      })) : [emptyLine()]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      show('Failed to load invoice for editing', 'error');
    }
  };

  // The List page hands off a row to edit via navigation state; load it once,
  // then clear the state so a later refresh of this page starts blank again.
  useEffect(() => {
    if (location.state?.editInvoice) {
      startEdit(location.state.editInvoice);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tighter than the standard .input — this grid packs 16 columns into one row.
  // px-1.5 overrides the standard input's px-3.5 to cut down the gap between columns.
  // Inputs stay w-full (from the base .input class) and simply fill whatever width
  // the column (th, below) resolves to — giving the input its own separate ch-based
  // width here caused a mismatch (th text is 10px, body text is 12px, so "6ch" means
  // a different pixel value in each place) that showed up as a gap before the next column.
  const gridInput = 'input py-0.5 px-1.5 text-xs';
  // Fixed (not ch-based) column widths: ch resolves against each element's own
  // font-size, and the header (10px) and the input inside the body row (12px) don't
  // share one, so a ch-based width came out slightly too small and clipped "MM/YY"
  // to "MM/Y" once there was no longer a big min-width buffer to hide the mismatch.
  // One fixed rem size, shared by every field, keeps every column uniform and safe.
  const colWidth = { width: '4.5rem', minWidth: '4.5rem' };
  const textColWidth = { width: '4rem', minWidth: '4rem' };
  const num = (value, onChange) => ({ type: 'number', step: '0.01', min: '0', className: gridInput, value, onChange });
  const txt = (value, onChange) => ({ className: gridInput, value, onChange });

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={FileInput}
            title={editingId ? 'Edit Purchase Invoice' : 'Purchase Invoice'}
            subtitle={editingId ? 'Update this saved invoice' : 'Record stock purchased from a supplier'}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <label className="label">Supplier *</label>
              <SearchSelect options={suppliers} value={supplierId} onChange={setSupplierId} placeholder="Select supplier" searchPlaceholder="Search supplier..." />
            </div>
          </div>

          {/* Grid entry: one row per batch line, all 16 fields always visible — scrolls
              horizontally (no visible scrollbar) once they outgrow the screen width. */}
          <div className="mt-4 overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[1320px] table-fixed text-left text-xs">
              <thead>
                <tr className="table-head text-[10px]">
                  <th className="rounded-l-lg px-1 py-0.5" style={colWidth}>Rack</th>
                  <th className="px-1 py-0.5" style={colWidth}>MFR</th>
                  <th className="px-1 py-0.5 w-52">Item Description</th>
                  <th className="px-1 py-0.5" style={colWidth}>Pack</th>
                  <th className="px-1 py-0.5" style={colWidth}>Batch</th>
                  <th className="px-1 py-0.5" style={colWidth}>Expiry</th>
                  <th className="px-1 py-0.5" style={colWidth}>Old MRP</th>
                  <th className="px-1 py-0.5" style={colWidth}>Qty</th>
                  <th className="px-1 py-0.5" style={colWidth}>Free</th>
                  <th className="px-1 py-0.5" style={colWidth}>MRP</th>
                  <th className="px-1 py-0.5" style={colWidth}>Rate</th>
                  <th className="px-1 py-0.5" style={colWidth}>Disc %</th>
                  <th className="px-1 py-0.5" style={colWidth}>GST %</th>
                  <th className="px-1 py-0.5" style={textColWidth}>Taxable Value</th>
                  <th className="px-1 py-0.5" style={textColWidth}>Amount</th>
                  <th className="px-1 py-0.5" style={colWidth}>HSN Code</th>
                  <th className="rounded-r-lg px-1 py-0.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const { taxableValue, amount } = lineCalc(l);
                  return (
                    <tr key={l.key} className="table-row">
                      <td className="px-1 py-0.5"><input {...txt(l.rack, (e) => setLine(l.key, { rack: e.target.value }))} /></td>
                      <td className="px-1 py-0.5"><input {...txt(l.manufacturer, (e) => setLine(l.key, { manufacturer: e.target.value }))} /></td>
                      <td className="px-1 py-0.5">
                        <SearchSelect options={itemOptions} value={l.itemId} onChange={(v) => onPickItem(l.key, v)} placeholder="Select item" searchPlaceholder="Search item..." className={gridInput} textSize="text-xs" />
                      </td>
                      <td className="px-1 py-0.5"><input {...txt(l.pack, (e) => setLine(l.key, { pack: e.target.value }))} /></td>
                      <td className="px-1 py-0.5"><input {...txt(l.batch, (e) => setLine(l.key, { batch: e.target.value }))} /></td>
                      <td className="px-1 py-0.5">
                        <input
                          className={gridInput}
                          placeholder="MM/YY"
                          inputMode="numeric"
                          maxLength={6}
                          value={l.expiry}
                          onChange={(e) => setLine(l.key, { expiry: formatExpiry(e.target.value) })}
                        />
                      </td>
                      <td className="px-1 py-0.5"><input {...num(l.oldMrp, (e) => setLine(l.key, { oldMrp: e.target.value }))} /></td>
                      <td className="px-1 py-0.5"><input {...num(l.qty, (e) => setLine(l.key, { qty: e.target.value }))} /></td>
                      <td className="px-1 py-0.5"><input {...num(l.free, (e) => setLine(l.key, { free: e.target.value }))} /></td>
                      <td className="px-1 py-0.5"><input {...num(l.mrp, (e) => setLine(l.key, { mrp: e.target.value }))} /></td>
                      <td className="px-1 py-0.5"><input {...num(l.rate, (e) => setLine(l.key, { rate: e.target.value }))} /></td>
                      <td className="px-1 py-0.5"><input {...num(l.discount, (e) => setLine(l.key, { discount: e.target.value }))} /></td>
                      <td className="px-1 py-0.5"><input {...num(l.gst, (e) => setLine(l.key, { gst: e.target.value }))} /></td>
                      <td className="px-1 py-0.5 text-ink-600" style={textColWidth}>{taxableValue.toFixed(2)}</td>
                      <td className="px-1 py-0.5 font-medium text-ink-700" style={textColWidth}>{amount.toFixed(2)}</td>
                      <td className="px-1 py-0.5"><input {...txt(l.hsnCode, (e) => setLine(l.key, { hsnCode: e.target.value }))} /></td>
                      <td className="px-1 py-0.5">
                        <button type="button" className="btn-ghost px-1 py-0.5 text-red-500 hover:bg-red-50" onClick={() => removeLine(l.key)} title="Remove row">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button type="button" className="btn-secondary" onClick={addLine}>
              <Plus size={16} /> Add Row
            </button>
            <p className="text-sm font-semibold text-ink-700">Total: {grandTotal.toFixed(2)}</p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? (editingId ? 'Updating...' : 'Saving...') : editingId ? 'Update' : 'Save'}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/purchase-invoice-list')}>
                <X size={16} /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
