import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Save, Trash2, X } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, vendorApi, unitApi, purchaseMasterApi } from '../../api/client.js';
import { MasterPicker } from './itemFormParts.jsx';

const emptyForm = { itemId: '', vendorId: '', quantity: '', unitId: '' };

const rowToForm = (r) => ({
  itemId: r.ItemId ?? '', vendorId: r.VendorId ?? '', quantity: r.Quantity ?? '', unitId: r.UnitId ?? '',
});

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

  useEffect(() => {
    pharmacyItemApi.list().then((rows) => setItems(rows.map((r) => ({ id: r.ItemId, name: r.Name, unitId: r.UnitId }))))
      .catch(() => show('Failed to load items', 'error'));
    vendorApi.list().then((rows) => setVendors(rows.map((r) => ({ id: r.VendorId, name: r.VendorName }))))
      .catch(() => show('Failed to load vendors', 'error'));
    unitApi.list().then((rows) => setUnits(rows.map((r) => ({ id: r.UnitId, name: r.Name }))))
      .catch(() => show('Failed to load units', 'error'));
  }, [show]);

  useEffect(() => {
    if (location.state?.editPurchase) {
      setForm(rowToForm(location.state.editPurchase));
      setEditingId(location.state.editPurchase.PurchaseMasterId);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const set = (key, value) => setForm((c) => ({ ...c, [key]: value }));

  // Picking an item fills in its own unit from Item Master, when it has one.
  const pickItem = (id) => {
    const item = items.find((i) => String(i.id) === String(id));
    setForm((c) => ({ ...c, itemId: id, unitId: item?.unitId ?? c.unitId }));
  };

  const backToList = () => navigate('/pharmacy/purchase-master-list');

  const cancel = () => {
    if (editingId) return backToList();
    setForm(emptyForm);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.itemId) return show('Select an item', 'error');
    if (!form.vendorId) return show('Select a vendor', 'error');
    if (!(Number(form.quantity) > 0)) return show('Qty must be a number greater than 0', 'error');
    setSaving(true);
    try {
      if (editingId) {
        await purchaseMasterApi.update(editingId, form);
        show('Purchase updated successfully', 'success');
      } else {
        await purchaseMasterApi.create(form);
        show('Purchase saved successfully', 'success');
      }
      setForm(emptyForm);
      setEditingId(null);
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
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Item *</label>
              <MasterPicker
                value={form.itemId} onChange={pickItem} options={items}
                placeholder="Select item" emptyMessage="No items yet — add them in Item."
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
              <input
                type="number" min="0" step="any" inputMode="decimal" className="input"
                value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="0"
              />
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
          </div>
          <div className="mt-4 flex justify-end gap-2">
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
