import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Receipt, Plus, Trash2, Save, X, List, Printer, ArrowRight } from 'lucide-react';
import { CardHeader, Spinner, Toast, Modal } from '../../components/ui.jsx';
import SalesBillReceipt from './SalesBillReceipt.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, pharmacyStockApi, salesBillingApi, clinicApi } from '../../api/client.js';

const today = () => new Date().toISOString().slice(0, 10);

function formatExpiry(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}
const emptyLine = () => ({
  key: Math.random(), itemId: '', batchIndex: '', batches: [], loadingBatches: false,
  batch: null, expiryDate: null, availableQty: 0, qty: '1', rate: '',
});

// Sales Billing is batch-aware: picking an item loads its available batches
// (purchased minus already returned/sold, from Stock's batch ledger) so the
// line is sold from a specific batch — picking a batch auto-fills Expiry,
// and Rate comes from the item's catalog Sell Price.
export default function SalesBilling() {
  const { toast, show } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [transDate, setTransDate] = useState(today());
  const [customerName, setCustomerName] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [printBill, setPrintBill] = useState(null);

  useEffect(() => { pharmacyItemApi.list().then(setCatalog).catch(() => setCatalog([])); }, []);
  useEffect(() => { clinicApi.get().then(setClinic).catch(() => setClinic(null)); }, []);

  // The saved bill's printable receipt is already in the DOM (hidden, see
  // below) by the time this fires, so print immediately reflects it.
  const printReceipt = () => window.print();

  const itemOptions = catalog.map((it) => ({ value: String(it.ItemId), label: it.Name }));
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  const onPickItem = async (key, itemIdStr) => {
    const it = catalog.find((i) => String(i.ItemId) === itemIdStr);
    setLine(key, {
      itemId: itemIdStr, rate: it?.SellPrice ?? '',
      batchIndex: '', batch: null, expiryDate: null, availableQty: 0,
      batches: [], loadingBatches: true,
    });
    try {
      const batches = await pharmacyStockApi.batches(itemIdStr);
      setLine(key, { batches: batches.filter((b) => b.AvailableQty > 0), loadingBatches: false });
    } catch {
      show('Failed to load batches for this item', 'error');
      setLine(key, { loadingBatches: false });
    }
  };

  const onPickBatch = (key, idx, batches) => {
    const b = batches[Number(idx)];
    setLine(key, {
      batchIndex: idx,
      batch: b?.Batch ?? null,
      expiryDate: b?.ExpiryDate ?? null,
      availableQty: b?.AvailableQty ?? 0,
    });
  };

  const total = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);

  const resetForm = () => {
    setEditingId(null);
    setLines([emptyLine()]);
    setCustomerName('');
    setTransDate(today());
  };

  // Loads a saved sale back into the form for editing. Each line's batch list
  // is re-fetched (current availability), then that line's own saved quantity
  // is added back onto its matching batch — the batch's live AvailableQty
  // already has this sale's quantity deducted, so without adding it back the
  // edit form would under-report how much room is actually left to use.
  const startEdit = async (row) => {
    try {
      const items = await salesBillingApi.items(row.SalesBillingId);
      const builtLines = await Promise.all(items.map(async (it) => {
        const itemIdStr = String(it.ItemId);
        let batches = [];
        try {
          batches = await pharmacyStockApi.batches(itemIdStr);
        } catch { /* leave empty, line stays editable with no batch options */ }
        batches = batches.map((b) => ((b.Batch || null) === (it.Batch || null)
          ? { ...b, AvailableQty: b.AvailableQty + Number(it.Quantity) }
          : b));
        if (!batches.some((b) => (b.Batch || null) === (it.Batch || null))) {
          batches = [...batches, { Batch: it.Batch, ExpiryDate: it.ExpiryDate, AvailableQty: Number(it.Quantity) }];
        }
        const batchIdx = batches.findIndex((b) => (b.Batch || null) === (it.Batch || null));
        const chosen = batches[batchIdx];
        return {
          key: Math.random(), itemId: itemIdStr, batches, loadingBatches: false,
          batchIndex: String(batchIdx), batch: chosen?.Batch ?? null, expiryDate: chosen?.ExpiryDate ?? null,
          availableQty: chosen?.AvailableQty ?? 0, qty: String(it.Quantity), rate: it.Rate,
        };
      }));
      setEditingId(row.SalesBillingId);
      setCustomerName(row.CustomerName || '');
      setTransDate(new Date(row.TransDate).toISOString().slice(0, 10));
      setLines(builtLines.length ? builtLines : [emptyLine()]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      show('Failed to load sale for editing', 'error');
    }
  };

  // The List page hands off a row to edit via navigation state; load it once,
  // then clear the state so a later refresh of this page starts blank again.
  useEffect(() => {
    if (location.state?.editSale) {
      startEdit(location.state.editSale);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.itemId && l.batchIndex !== '' && Number(l.qty) > 0);
    if (validLines.length === 0) return show('Add at least one item with a batch and quantity', 'error');
    setSaving(true);
    try {
      const payload = {
        transDate,
        customerName,
        items: validLines.map((l) => ({
          itemId: Number(l.itemId),
          quantity: Number(l.qty),
          rate: Number(l.rate) || 0,
          amount: (Number(l.qty) || 0) * (Number(l.rate) || 0),
          batch: l.batch,
          expiryDate: l.expiryDate,
        })),
      };
      if (editingId) {
        await salesBillingApi.update(editingId, payload);
        show('Updated', 'success');
        resetForm();
        // Editing is initiated from the List page — return there to see the result.
        navigate('/pharmacy/sales-billing-list');
      } else {
        const created = await salesBillingApi.create(payload);
        show('Saved', 'success');
        // Code is computed the same way the backend does elsewhere (prefix +
        // 6-digit id) — the create response only returns the new id.
        setPrintBill({
          code: `SALE${String(created.SalesBillingId).padStart(6, '0')}`,
          transDate, customerName,
          lines: validLines.map((l) => ({
            itemName: catalog.find((i) => String(i.ItemId) === l.itemId)?.Name || '',
            batch: l.batch, qty: Number(l.qty), rate: Number(l.rate) || 0,
            amount: (Number(l.qty) || 0) * (Number(l.rate) || 0),
          })),
          total,
        });
        resetForm();
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card no-print">
        <form onSubmit={save}>
          <CardHeader
            icon={Receipt}
            title={editingId ? 'Edit Sales Billing' : 'Sales Billing'}
            subtitle={editingId ? 'Update this saved sale' : 'Bill stock sold over the counter, from a specific batch'}
            actions={
              <button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/sales-billing-list')}>
                <List size={16} /> View List
              </button>
            }
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <label className="label">Customer Name</label>
              <input className="input" placeholder="Walk-in / optional" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-1.5">Item</th>
                  <th className="px-3 py-1.5 w-48">Batch (Available Qty)</th>
                  <th className="px-3 py-1.5 w-24">Expiry</th>
                  <th className="px-3 py-1.5 w-24">Qty</th>
                  <th className="px-3 py-1.5 w-28">Rate</th>
                  <th className="px-3 py-1.5 w-32">Amount</th>
                  <th className="rounded-r-lg px-3 py-1.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const batchOptions = l.batches.map((b, i) => ({
                    value: String(i),
                    label: `${b.Batch || 'No batch'} — Exp ${formatExpiry(b.ExpiryDate)} — Avail ${b.AvailableQty}`,
                  }));
                  return (
                    <tr key={l.key} className="table-row">
                      <td className="px-3 py-1.5">
                        <SearchSelect options={itemOptions} value={l.itemId} onChange={(v) => onPickItem(l.key, v)} placeholder="Select item" searchPlaceholder="Search item..." />
                      </td>
                      <td className="px-3 py-1.5">
                        {l.loadingBatches ? (
                          <Spinner />
                        ) : (
                          <SearchSelect
                            options={batchOptions}
                            value={l.batchIndex}
                            onChange={(idx) => onPickBatch(l.key, idx, l.batches)}
                            placeholder={l.itemId ? (batchOptions.length ? 'Select batch' : 'No stock available') : 'Pick item first'}
                            searchPlaceholder="Search batch..."
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-ink-500">{formatExpiry(l.expiryDate)}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" step="0.01" min="0" max={l.availableQty}
                          className="input" value={l.qty}
                          onChange={(e) => setLine(l.key, { qty: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" step="0.01" min="0" className="input" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} />
                      </td>
                      <td className="px-3 py-1.5 text-ink-600">
                        {((Number(l.qty) || 0) * (Number(l.rate) || 0)).toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5">
                        <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => removeLine(l.key)} title="Remove row">
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
            <p className="text-sm font-semibold text-ink-700">Total: {total.toFixed(2)}</p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? (editingId ? 'Updating...' : 'Saving...') : editingId ? 'Update' : 'Save'}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/sales-billing-list')}>
                <X size={16} /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="no-print">
        <Modal open={!!printBill} onClose={() => setPrintBill(null)} title="Bill Saved">
          {printBill && (
            <div className="space-y-4">
              <div className="rounded-lg bg-ink-50 p-4 text-sm">
                <p><span className="font-semibold">Code:</span> {printBill.code}</p>
                <p><span className="font-semibold">Customer:</span> {printBill.customerName || 'Walk-in'}</p>
                <p><span className="font-semibold">Total:</span> {printBill.total.toFixed(2)}</p>
              </div>
              <p className="text-sm text-ink-500">Print this bill, or continue straight to the next one.</p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={printReceipt}>
                  <Printer size={16} /> Print
                </button>
                <button type="button" className="btn-primary" onClick={() => setPrintBill(null)}>
                  Continue to Next Bill <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>

      <SalesBillReceipt clinic={clinic} bill={printBill} />

      <Toast toast={toast} />
    </div>
  );
}
