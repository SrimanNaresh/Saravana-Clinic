import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, List } from 'lucide-react';
import { CardHeader, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi } from '../../api/client.js';
import { ItemFields, emptyItemForm, useItemMasters } from './itemFormParts.jsx';
import ItemImport from './ItemImport.jsx';

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
                {/* Clean import -> go straight to the list to see the new rows;
                    with failures, stay here so the row errors remain visible. */}
                <ItemImport
                  masters={masters}
                  onImported={(res) => { if (!res.failed && res.inserted + res.updated > 0) navigate('/pharmacy/item-list'); }}
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
