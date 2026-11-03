import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, Save, X, List } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { itemMasterApi } from '../../api/client.js';
import { MAX_GST, emptyForm, rowToForm, validate, ItemFields } from './ItemForm.jsx';
import { usePickLists } from './usePickLists.js';

// Pharmacy > Item > Master: add or edit an item. On Add the Quantity is the
// opening stock; on Edit it shows the current stock, and changing it records
// an adjustment for the difference.
export default function ItemMaster() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const { handlersFor } = usePickLists((m) => show(m, 'error'));
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null); // { id, code, qty } while editing; qty = stock when loaded
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = location.state?.editItemId;
    if (!id) return;
    navigate(location.pathname, { replace: true, state: null });
    itemMasterApi.get(id)
      .then((r) => { const f = rowToForm(r); setForm(f); setEditing({ id: r.ItemId, code: r.ItemCode, qty: f.quantity }); })
      .catch(() => show('Failed to load the item', 'error'));
  }, [location.state, location.pathname, navigate, show]);

  const toList = (flash) => navigate('/pharmacy/item-list', flash ? { state: { flash } } : undefined);

  const save = async (e) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return show(problem, 'error');
    setSaving(true);
    try {
      if (editing) {
        // Quantity goes only when it was changed, so a sale made meanwhile isn't undone.
        await itemMasterApi.update(editing.id, { ...form, quantity: form.quantity === editing.qty ? '' : form.quantity });
        toList(`${form.name} updated`);
      } else {
        const r = await itemMasterApi.create(form);
        show(`Saved ${form.name} (${r.ItemCode})`, 'success');
        setForm(emptyForm);
      }
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const gst = Number(form.cgstPercent || 0) + Number(form.sgstPercent || 0);

  return (
    <div>
      <div className="card">
        <form onSubmit={save}>
          <CardHeader
            icon={Package}
            title={editing ? `Edit Item · ${editing.code}` : 'Item Master'}
            subtitle={editing ? 'Update this item' : 'Add a new item — the code is given on save'}
            actions={
              <button type="button" className="btn-secondary" onClick={() => toList()}>
                <List size={16} /> Item List
              </button>
            }
          />

          <ItemFields form={form} setForm={setForm} editing={editing} handlersFor={handlersFor} />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className={`text-xs ${gst > MAX_GST ? 'text-red-600' : 'text-ink-500'}`}>
              GST for billing: <b>{gst}%</b> (CGST + SGST, max {MAX_GST}%)
              {!editing && ' · Selling price starts at the MRP; Stock In sets it later.'}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => (editing ? toList() : setForm(emptyForm))}>
                <X size={16} /> Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={16} /> {saving ? 'Saving...' : editing ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
