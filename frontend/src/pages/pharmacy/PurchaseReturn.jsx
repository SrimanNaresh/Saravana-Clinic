import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Undo2, Save, X } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { useToast } from '../../hooks/useToast.js';
import { purchaseInvoiceApi, purchaseReturnApi } from '../../api/client.js';

const today = () => new Date().toISOString().slice(0, 10);

function formatExpiry(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}
// Purchase Return is raised against a specific Purchase Invoice: picking the
// invoice pulls in its line items (item, batch, expiry, rate) so the return
// can only cover what was actually bought on that invoice — each line's
// Return Qty defaults to blank (not returned) and is capped at what was
// purchased on that line.
export default function PurchaseReturn() {
  const { toast, show } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [transDate, setTransDate] = useState(today());
  const [lines, setLines] = useState([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    purchaseInvoiceApi.list().then(setInvoices).catch(() => setInvoices([]));
  }, []);

  const invoiceOptions = invoices.map((inv) => ({
    value: String(inv.PurchaseInvoiceId),
    label: `${inv.Code} — ${inv.SupplierName || '-'} — ${new Date(inv.TransDate).toLocaleDateString()}`,
  }));
  const selectedInvoice = invoices.find((inv) => String(inv.PurchaseInvoiceId) === invoiceId);

  const loadInvoiceLines = async (id) => {
    const items = await purchaseInvoiceApi.items(id);
    return items.map((it) => ({
      key: it.LineId,
      itemId: it.ItemId,
      itemName: it.ItemName,
      batch: it.Batch,
      expiryDate: it.ExpiryDate,
      purchasedQty: Number(it.Quantity),
      rate: it.Rate,
      returnQty: '',
    }));
  };

  const pickInvoice = async (id) => {
    setInvoiceId(id);
    setLines([]);
    if (!id) return;
    setLoadingLines(true);
    try {
      setLines(await loadInvoiceLines(id));
    } catch {
      show('Failed to load invoice items', 'error');
    } finally {
      setLoadingLines(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setInvoiceId('');
    setLines([]);
    setTransDate(today());
  };

  // Loads a saved return back into the form for editing: re-loads the full
  // line set from its source invoice (so items not previously returned are
  // still selectable), then overlays the saved quantities/rates onto the
  // matching lines.
  const startEdit = async (row) => {
    if (!row.PurchaseInvoiceId) {
      show('This return has no linked invoice to edit', 'error');
      return;
    }
    setLoadingLines(true);
    try {
      const [invoiceLines, savedItems] = await Promise.all([
        loadInvoiceLines(row.PurchaseInvoiceId),
        purchaseReturnApi.items(row.PurchaseReturnId),
      ]);
      const merged = invoiceLines.map((l) => {
        const saved = savedItems.find((s) => s.ItemId === l.itemId);
        return saved ? { ...l, returnQty: String(saved.Quantity), rate: saved.Rate } : l;
      });
      setEditingId(row.PurchaseReturnId);
      setInvoiceId(String(row.PurchaseInvoiceId));
      setTransDate(new Date(row.TransDate).toISOString().slice(0, 10));
      setLines(merged);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      show('Failed to load return for editing', 'error');
    } finally {
      setLoadingLines(false);
    }
  };

  // The List page hands off a row to edit via navigation state; load it once,
  // then clear the state so a later refresh of this page starts blank again.
  useEffect(() => {
    if (location.state?.editReturn) {
      startEdit(location.state.editReturn);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const total = lines.reduce((sum, l) => sum + (Number(l.returnQty) || 0) * (Number(l.rate) || 0), 0);

  const save = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => Number(l.returnQty) > 0);
    if (!invoiceId) return show('Select an invoice to return against', 'error');
    if (validLines.length === 0) return show('Enter a return quantity for at least one item', 'error');
    setSaving(true);
    try {
      const payload = {
        transDate,
        supplierId: selectedInvoice ? selectedInvoice.SupplierId : undefined,
        purchaseInvoiceId: Number(invoiceId),
        items: validLines.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.returnQty),
          rate: Number(l.rate) || 0,
          amount: (Number(l.returnQty) || 0) * (Number(l.rate) || 0),
          batch: l.batch,
          expiryDate: l.expiryDate,
        })),
      };
      if (editingId) {
        await purchaseReturnApi.update(editingId, payload);
        show('Updated', 'success');
        resetForm();
        // Editing is initiated from the List page — return there to see the result.
        navigate('/pharmacy/purchase-return-list');
      } else {
        await purchaseReturnApi.create(payload);
        show('Saved', 'success');
        // A fresh entry stays on this page, ready for the next return.
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
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={Undo2}
            title={editingId ? 'Edit Purchase Return' : 'Purchase Return'}
            subtitle={editingId ? 'Update this saved return' : 'Return stock against a purchase invoice'}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label className="label">Return Against Invoice *</label>
              <SearchSelect options={invoiceOptions} value={invoiceId} onChange={pickInvoice} placeholder="Select invoice" searchPlaceholder="Search invoice..." />
            </div>
            <div>
              <label className="label">Supplier</label>
              <input className="input bg-ink-50" value={selectedInvoice?.SupplierName || '-'} disabled />
            </div>
            <div>
              <label className="label">Return Date</label>
              <input type="date" className="input" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
            </div>
          </div>

          {loadingLines ? (
            <div className="mt-4"><Spinner /></div>
          ) : !invoiceId ? (
            <div className="mt-4"><EmptyState message="Select an invoice above to load its items." /></div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="rounded-l-lg px-3 py-1.5">Item</th>
                    <th className="px-3 py-1.5">Batch</th>
                    <th className="px-3 py-1.5">Expiry</th>
                    <th className="px-3 py-1.5">Purchased</th>
                    <th className="px-3 py-1.5 w-28">Return Qty</th>
                    <th className="px-3 py-1.5 w-28">Rate</th>
                    <th className="rounded-r-lg px-3 py-1.5 w-32">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="table-row">
                      <td className="px-3 py-1.5 font-medium text-ink-700">{l.itemName}</td>
                      <td className="px-3 py-1.5 text-ink-500">{l.batch || '-'}</td>
                      <td className="px-3 py-1.5 text-ink-500">{formatExpiry(l.expiryDate)}</td>
                      <td className="px-3 py-1.5 text-ink-500">{l.purchasedQty}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" step="0.01" min="0" max={l.purchasedQty}
                          className="input" value={l.returnQty}
                          onChange={(e) => setLine(l.key, { returnQty: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" step="0.01" min="0"
                          className="input" value={l.rate}
                          onChange={(e) => setLine(l.key, { rate: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-1.5 font-medium text-ink-700">
                        {((Number(l.returnQty) || 0) * (Number(l.rate) || 0)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-center justify-end">
            <p className="text-sm font-semibold text-ink-700">Total: {total.toFixed(2)}</p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="submit" className="btn-primary" disabled={saving || !invoiceId}>
              <Save size={16} /> {saving ? (editingId ? 'Updating...' : 'Saving...') : editingId ? 'Update' : 'Save'}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={() => navigate('/pharmacy/purchase-return-list')}>
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
