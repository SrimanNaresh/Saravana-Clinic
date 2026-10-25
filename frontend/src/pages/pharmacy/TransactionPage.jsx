import { useState, useEffect, useCallback, Fragment } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, supplierApi } from '../../api/client.js';

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = () => ({ key: Math.random(), itemId: '', rate: '', quantity: '1' });

// Shared by Purchase Invoice/Return and Sales Billing/Return — a header
// (date + supplier-or-customer) plus a line-items table against the
// Pharmacy Item catalog, and a list of previously saved records below.
// Record-keeping only for now: no stock-quantity effects.
//
// Props:
//  - title/subtitle/icon: page chrome
//  - api: { list, items, create, remove } from api/client.js's transactionApi()
//  - idField: the header's id column name (e.g. 'PurchaseInvoiceId') — the
//             list API returns rows keyed by this, varies per transaction type
//  - partyType: 'supplier' | 'customer'
//  - rateField: which PharmacyItem price field seeds a line's Rate when an
//               item is picked ('PurchaseRate' for purchases, 'SellPrice' for sales)
export default function TransactionPage({ title, subtitle, icon: Icon, api, idField, partyType, rateField }) {
  const { toast, show } = useToast();
  const [catalog, setCatalog] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [transDate, setTransDate] = useState(today());
  const [supplierId, setSupplierId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [expandedLoading, setExpandedLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.list());
    } catch {
      show('Failed to load records', 'error');
    } finally {
      setLoading(false);
    }
  }, [api, show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { pharmacyItemApi.list().then(setCatalog).catch(() => setCatalog([])); }, []);
  useEffect(() => {
    if (partyType !== 'supplier') return;
    supplierApi.list().then((rs) => setSuppliers(rs.map((r) => ({ value: String(r.SupplierId), label: r.Name })))).catch(() => setSuppliers([]));
  }, [partyType]);

  const itemOptions = catalog.map((it) => ({ value: String(it.ItemId), label: it.Name }));

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  const onPickItem = (key, itemIdStr) => {
    const it = catalog.find((i) => String(i.ItemId) === itemIdStr);
    setLine(key, { itemId: itemIdStr, rate: it?.[rateField] ?? '' });
  };

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);

  const save = async (e) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (validLines.length === 0) return show('Add at least one item with a quantity', 'error');
    if (partyType === 'supplier' && !supplierId) return show('Supplier is required', 'error');
    setSaving(true);
    try {
      await api.create({
        transDate,
        supplierId: partyType === 'supplier' ? Number(supplierId) : undefined,
        customerName: partyType === 'customer' ? customerName : undefined,
        items: validLines.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), rate: Number(l.rate) || 0 })),
      });
      show('Saved', 'success');
      setLines([emptyLine()]);
      setSupplierId('');
      setCustomerName('');
      setTransDate(today());
      load();
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete ${row.Code}?`)) return;
    try {
      await api.remove(row[idField]);
      show('Deleted', 'success');
      if (expandedId === row[idField]) setExpandedId(null);
      load();
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  const toggleExpand = async (row) => {
    const id = row[idField];
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setExpandedLoading(true);
    try {
      setExpandedItems(await api.items(id));
    } catch {
      setExpandedItems([]);
    } finally {
      setExpandedLoading(false);
    }
  };

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader icon={Icon} title={title} subtitle={subtitle} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
            </div>
            {partyType === 'supplier' ? (
              <div className="lg:col-span-2">
                <label className="label">Supplier *</label>
                <SearchSelect options={suppliers} value={supplierId} onChange={setSupplierId} placeholder="Select supplier" searchPlaceholder="Search supplier..." />
              </div>
            ) : (
              <div className="lg:col-span-2">
                <label className="label">Customer Name</label>
                <input className="input" placeholder="Walk-in / optional" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-1.5">Item</th>
                  <th className="px-3 py-1.5 w-28">Quantity</th>
                  <th className="px-3 py-1.5 w-32">Rate</th>
                  <th className="px-3 py-1.5 w-32">Amount</th>
                  <th className="rounded-r-lg px-3 py-1.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="table-row">
                    <td className="px-3 py-1.5">
                      <SearchSelect options={itemOptions} value={l.itemId} onChange={(v) => onPickItem(l.key, v)} placeholder="Select item" searchPlaceholder="Search item..." />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.01" min="0" className="input" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.01" min="0" className="input" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} />
                    </td>
                    <td className="px-3 py-1.5 text-ink-600">
                      {((Number(l.quantity) || 0) * (Number(l.rate) || 0)).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5">
                      <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => removeLine(l.key)} title="Remove row">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button type="button" className="btn-secondary" onClick={addLine}>
              <Plus size={16} /> Add Row
            </button>
            <p className="text-sm font-semibold text-ink-700">Total: {total.toFixed(2)}</p>
          </div>

          <div className="mt-4">
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <div className="card mt-5">
        <CardHeader icon={Icon} title="Records" subtitle={`Saved ${title.toLowerCase()} entries`} />
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No records yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-1.5" />
                  <th className="px-3 py-1.5">Code</th>
                  <th className="px-3 py-1.5">Date</th>
                  <th className="px-3 py-1.5">{partyType === 'supplier' ? 'Supplier' : 'Customer'}</th>
                  <th className="px-3 py-1.5">Total</th>
                  <th className="rounded-r-lg px-3 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r[idField]}>
                    <tr className="table-row">
                      <td className="px-3 py-1.5">
                        <button type="button" className="btn-ghost px-1.5 py-1" onClick={() => toggleExpand(r)}>
                          {expandedId === r[idField] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{r.Code}</td>
                      <td className="px-3 py-1.5 text-slate-500">{new Date(r.TransDate).toLocaleDateString()}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-700">{(partyType === 'supplier' ? r.SupplierName : r.CustomerName) || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{Number(r.TotalAmount).toFixed(2)}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1">
                          <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete" onClick={() => remove(r)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === r[idField] && (
                      <tr>
                        <td colSpan={6} className="bg-ink-50/50 px-3 py-2">
                          {expandedLoading ? (
                            <Spinner />
                          ) : expandedItems.length === 0 ? (
                            <p className="text-xs text-ink-400">No line items.</p>
                          ) : (
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="text-ink-400">
                                  <th className="px-2 py-1">Item</th>
                                  <th className="px-2 py-1">Quantity</th>
                                  <th className="px-2 py-1">Rate</th>
                                  <th className="px-2 py-1">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedItems.map((it) => (
                                  <tr key={it.LineId}>
                                    <td className="px-2 py-1">{it.ItemName}</td>
                                    <td className="px-2 py-1">{it.Quantity}</td>
                                    <td className="px-2 py-1">{it.Rate}</td>
                                    <td className="px-2 py-1">{it.Amount}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
