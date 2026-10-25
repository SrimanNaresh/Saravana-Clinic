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
                  note="Leave ItemId blank to insert a new item, or fill it to update an existing one. Only ItemName is required — ItemType, Unit, Generic Name, Manufacturer and Supplier accept any value from their dropdown, or a brand-new one (it'll be added automatically)."
                  dropdowns={{
                    ItemType: masters.itemTypes.map((t) => t.name),
                    Unit: masters.units.map((u) => u.name),
                    GenericName: masters.genericNames.map((g) => g.name),
                    Manufacturer: masters.manufacturers.map((m) => m.name),
                    Supplier: masters.suppliers.map((s) => s.name),
                    ScheduleH: ['Yes', 'No'],
                    ScheduleH1: ['Yes', 'No'],
                  }}
                  onImport={(rows) => pharmacyItemApi.bulk(rows)}
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
