import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Search, Plus, Pencil, Trash2, X } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Modal, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi } from '../../api/client.js';
import { ItemFields, rowToItemForm, ITEM_FIELD_TO_ROW_KEY, useItemMasters } from './itemFormParts.jsx';

export default function ItemList() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [filterItemTypeId, setFilterItemTypeId] = useState('');
  const [filterManufacturerId, setFilterManufacturerId] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const masters = useItemMasters();

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      setRows(await pharmacyItemApi.list(q));
    } catch {
      show('Failed to load items', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  // Quick filters narrow the already-loaded (text-searched) rows client-side
  // — instant, no extra round trip — rather than adding more query params.
  const filteredRows = useMemo(() => rows.filter((r) =>
    (!filterItemTypeId || String(r.ItemTypeId) === filterItemTypeId) &&
    (!filterManufacturerId || String(r.ManufacturerId) === filterManufacturerId) &&
    (!filterSupplierId || String(r.SupplierId) === filterSupplierId)
  ), [rows, filterItemTypeId, filterManufacturerId, filterSupplierId]);

  const activeFilterCount = [filterItemTypeId, filterManufacturerId, filterSupplierId].filter(Boolean).length;
  const clearFilters = () => { setFilterItemTypeId(''); setFilterManufacturerId(''); setFilterSupplierId(''); };

  const editForm = editing && rowToItemForm(editing);
  const setEdit = (key, value) => setEditing((c) => ({ ...c, [ITEM_FIELD_TO_ROW_KEY[key]]: value }));

  const saveEdit = async () => {
    if (!editForm.name?.trim()) return show('Item name is required', 'error');
    try {
      await pharmacyItemApi.update(editing.ItemId, editForm);
      show('Item updated', 'success');
      setEditing(null);
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete item "${row.Name}"?`)) return;
    try {
      await pharmacyItemApi.remove(row.ItemId);
      show('Item deleted', 'success');
      load(search);
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Package}
          title="Item List"
          subtitle="Search, edit and delete pharmacy stock items"
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => navigate('/pharmacy/item')}>
                <Plus size={16} /> Add
              </button>
            </>
          }
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={filterItemTypeId} onChange={(e) => setFilterItemTypeId(e.target.value)}>
            <option value="">All Types</option>
            {masters.itemTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="input w-auto" value={filterManufacturerId} onChange={(e) => setFilterManufacturerId(e.target.value)}>
            <option value="">All Manufacturers</option>
            {masters.manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select className="input w-auto" value={filterSupplierId} onChange={(e) => setFilterSupplierId(e.target.value)}>
            <option value="">All Suppliers</option>
            {masters.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {activeFilterCount > 0 && (
            <button type="button" className="btn-ghost gap-1 text-xs" onClick={clearFilters}>
              <X size={14} /> Clear filter{activeFilterCount > 1 ? 's' : ''} ({activeFilterCount})
            </button>
          )}
        </div>

        {loading ? (
          <Spinner />
        ) : filteredRows.length === 0 ? (
          <EmptyState message={rows.length === 0 ? 'No items found.' : 'No items match the selected filters.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-1.5">Item Code</th>
                  <th className="px-3 py-1.5">Item Name</th>
                  <th className="px-3 py-1.5">Type</th>
                  <th className="px-3 py-1.5">Generic Name</th>
                  <th className="px-3 py-1.5">Manufacturer</th>
                  <th className="px-3 py-1.5">Supplier</th>
                  <th className="px-3 py-1.5">MRP</th>
                  <th className="px-3 py-1.5">Sell Price</th>
                  <th className="rounded-r-lg px-3 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.ItemId} className="table-row">
                    <td className="px-3 py-1.5 text-slate-500">{r.ItemCode}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{r.Name}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.ItemTypeName || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.GenericNameName || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.ManufacturerName || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.SupplierName || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.MRP ?? '-'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.SellPrice ?? '-'}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="btn-ghost px-2 py-1" title="Edit item" onClick={() => setEditing({ ...r })}><Pencil size={15} /></button>
                        <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete item" onClick={() => remove(r)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Item" size="xl">
        {editing && (
          <div className="space-y-4">
            <ItemFields
              form={editForm} set={setEdit}
              suppliers={masters.suppliers} genericNames={masters.genericNames} manufacturers={masters.manufacturers}
              itemTypes={masters.itemTypes} units={masters.units}
              onSupplierCreated={masters.addSupplier} onGenericNameCreated={masters.addGenericName} onManufacturerCreated={masters.addManufacturer}
              onItemTypeCreated={masters.addItemType} onUnitCreated={masters.addUnit}
            />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} />
    </div>
  );
}
