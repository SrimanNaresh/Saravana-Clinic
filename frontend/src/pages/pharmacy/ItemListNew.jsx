import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { Package, Search, List, Pencil, Trash2, X, CheckCircle2, Save, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi } from '../../api/client.js';
import { useItemMasters } from './itemFormParts.jsx';
import ItemImport, { ITEM_LIST_TEMPLATE } from './ItemImport.jsx';

const PAGE_SIZE = 30;

// List columns after Item Name, in display order. An empty cell shows a
// read-only text box; the row's Edit icon opens every cell for editing.
// `field` is the key the PATCH route takes, `rowKey` where the list row
// carries the value, `list` the master whose names are suggested, `width`
// the box's width.
const FILL_COLUMNS = [
  { field: 'GenericName', rowKey: 'GenericNameName', list: 'genericNames', width: 'w-32' },
  { field: 'Manufacturer', rowKey: 'ManufacturerName', list: 'manufacturers', width: 'w-32' },
  { field: 'HSNCode', rowKey: 'HSNCode', width: 'w-20' },
  { field: 'MRP', rowKey: 'MRP', numeric: true, width: 'w-20' },
  { field: 'Unit', rowKey: 'UnitName', list: 'units', width: 'w-20' },
  { field: 'GSTPercent', rowKey: 'GSTPercent', numeric: true, width: 'w-16' },
  { field: 'SellPrice', rowKey: 'SellPrice', numeric: true, width: 'w-20' },
  { field: 'Rack', rowKey: 'Rack', width: 'w-16' },
  { field: 'BoxNo', rowKey: 'BoxNo', width: 'w-16' },
];
const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const cellText = (v) => (isBlank(v) ? '' : String(v));

export default function ItemListNew() {
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  // The screen opens empty; items are fetched only after View List or an upload.
  const [listShown, setListShown] = useState(false);
  const [notice, setNotice] = useState('');
  // Rows in edit mode and their box values: { [ItemId]: { [field]: value } }.
  const [editRows, setEditRows] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [search, setSearch] = useState('');
  const masters = useItemMasters();
  const [page, setPage] = useState(1);
  const tableBoxRef = useRef(null);
  const pagerRef = useRef(null);
  const [tableMaxHeight, setTableMaxHeight] = useState(null);

  // Size the table's scroll box to fill the window from wherever it starts
  // down to the pager + card's + page's bottom padding, so no screen space is wasted.
  useLayoutEffect(() => {
    const box = tableBoxRef.current;
    if (!box) return undefined;
    const fit = () => {
      const card = box.closest('.card');
      const main = box.closest('main');
      const pager = pagerRef.current;
      const bottomGap = (card ? parseFloat(getComputedStyle(card).paddingBottom) + 1 : 0)
        + (main ? parseFloat(getComputedStyle(main).paddingBottom) : 0)
        + (pager ? pager.offsetHeight + parseFloat(getComputedStyle(pager).marginTop) : 0);
      setTableMaxHeight(Math.max(320, Math.floor(window.innerHeight - box.getBoundingClientRect().top - bottomGap)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }); // every render: the box remounts after loading/empty states, and the header can wrap

  // `quiet` refreshes in place (after a row save) without the loading spinner.
  const load = useCallback(async (q = '', { quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setRows(await pharmacyItemApi.list(q));
    } catch {
      show('Failed to load items', 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    if (!listShown) return undefined;
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load, listShown]);

  const viewList = () => {
    if (listShown) return load(search);
    setLoading(true); // spinner until the effect above does the first load
    setListShown(true);
  };

  // After a successful import: say so, and list everything (search cleared,
  // newest first) so the imported items are on screen. It runs from the
  // import's async handler, so it reads no state — only setters and load.
  const handleImported = (res) => {
    if (res.inserted + res.updated === 0) return;
    const parts = [`${res.inserted} item${res.inserted === 1 ? '' : 's'} added`];
    if (res.updated) parts.push(`${res.updated} updated`);
    if (res.failed) parts.push(`${res.failed} failed`);
    setNotice(`Import successful — ${parts.join(', ')}.`);
    setSearch('');
    setListShown(true);
    load('');
  };

  // A new search starts back at page 1; a delete that empties the
  // last page falls back to the new last page.
  useEffect(() => { setPage(1); }, [search]);
  const showRows = listShown && !loading && rows.length > 0;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  // Each page keeps the same items (newest first), but within the page the
  // ones already edited sink to the bottom, in the order they were saved —
  // so what's still to fill in stays at the top of the page.
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    .sort((a, b) => (!!a.EditedAt - !!b.EditedAt) || String(a.EditedAt ?? '').localeCompare(String(b.EditedAt ?? '')));
  const firstRowNo = (currentPage - 1) * PAGE_SIZE + 1;
  const lastRowNo = firstRowNo + pageRows.length - 1;
  const goToPage = (p) => {
    setPage(Math.min(Math.max(1, p), pageCount));
    tableBoxRef.current?.scrollTo({ top: 0 });
  };

  const startEdit = (r) => setEditRows((e) => ({
    ...e,
    [r.ItemId]: Object.fromEntries(FILL_COLUMNS.map((c) => [c.field, cellText(r[c.rowKey])])),
  }));
  const stopEdit = (itemId) => setEditRows(({ [itemId]: _, ...rest }) => rest);
  const setCell = (itemId, field, value) => setEditRows((e) => ({ ...e, [itemId]: { ...e[itemId], [field]: value } }));

  // Sends only the boxes whose value changed. A box cleared to blank is left
  // as it was (the PATCH route never blanks a field).
  const saveRow = async (r) => {
    const values = editRows[r.ItemId];
    const changed = Object.fromEntries(FILL_COLUMNS
      .filter((c) => !isBlank(values[c.field]) && values[c.field].trim() !== cellText(r[c.rowKey]))
      .map((c) => [c.field, values[c.field].trim()]));
    if (Object.keys(changed).length === 0) return stopEdit(r.ItemId);
    setSavingId(r.ItemId);
    try {
      await pharmacyItemApi.patch(r.ItemId, changed);
      stopEdit(r.ItemId);
      setNotice(`Saved ${r.ItemCode} — ${r.Name}.`);
      masters.reload();
      await load(search, { quiet: true });
    } catch (err) {
      show(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSavingId(null);
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
          title="ItemList new"
          subtitle="Download the template, upload items and view the list"
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <ItemImport masters={masters} template={ITEM_LIST_TEMPLATE} onImported={handleImported} quietSuccess />
              <button type="button" className="btn-secondary" onClick={viewList}>
                <List size={16} /> View List
              </button>
            </>
          }
        />

          {notice && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              <CheckCircle2 size={16} className="shrink-0" />
              <span className="flex-1">{notice}</span>
              <button type="button" className="btn-ghost px-1 py-0.5 text-emerald-700" title="Dismiss" onClick={() => setNotice('')}><X size={14} /></button>
            </div>
          )}

          {/* Name suggestions for the Generic Name / Menu Factor / Unit boxes;
              a new name is added to its master on save. */}
          {FILL_COLUMNS.filter((c) => c.list).map((c) => (
            <datalist key={c.list} id={`fill-${c.list}`}>
              {masters[c.list].map((m) => <option key={m.id} value={m.name} />)}
            </datalist>
          ))}

          {/* The table scrolls inside its own viewport-sized box (with its own
              scrollbar) so long lists stay navigable and the header stays pinned.
              Its headers show even while empty, with the status in the body. */}
          <div
            ref={tableBoxRef}
            className="overflow-auto rounded-lg border border-ink-100"
            style={{ maxHeight: tableMaxHeight ?? 'calc(100vh - 19rem)' }}
          >
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-ink-50">
                <tr className="table-head">
                  <th className="rounded-l-lg px-3 py-1.5">Item Code</th>
                  <th className="px-3 py-1.5">Item Name</th>
                  <th className="px-3 py-1.5">Generic Name</th>
                  <th className="px-3 py-1.5">Menu Factor</th>
                  <th className="px-3 py-1.5">HSN</th>
                  <th className="px-3 py-1.5">MRP</th>
                  <th className="px-3 py-1.5">Unit</th>
                  <th className="px-3 py-1.5">GST</th>
                  <th className="px-3 py-1.5">Sell Price</th>
                  <th className="px-3 py-1.5">Rack</th>
                  <th className="px-3 py-1.5">Box No</th>
                  <th className="rounded-r-lg px-3 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!showRows ? (
                  <tr>
                    <td colSpan={12}>
                      {listShown && loading ? <Spinner /> : (
                        <EmptyState message={listShown ? 'No items found.' : 'No items to show. Upload an item sheet or click View List.'} />
                      )}
                    </td>
                  </tr>
                ) : pageRows.map((r) => {
                  const edit = editRows[r.ItemId];
                  const saving = savingId === r.ItemId;
                  return (
                    <tr key={r.ItemId} className={`table-row ${edit ? 'bg-brand-50/40' : ''}`}>
                      <td className="px-3 py-1 text-slate-500">{r.ItemCode}</td>
                      <td className="px-3 py-1 font-medium text-slate-700">{r.Name}</td>
                      {FILL_COLUMNS.map((c) => (
                        <td key={c.field} className="px-2 py-1 text-slate-500">
                          {edit || isBlank(r[c.rowKey]) ? (
                            <input
                              className={`input h-7 rounded-md px-2 py-0 text-xs ${c.width} ${edit ? '' : 'cursor-default bg-ink-50 shadow-none'}`}
                              value={edit ? edit[c.field] : ''}
                              readOnly={!edit}
                              tabIndex={edit ? undefined : -1}
                              onChange={(e) => setCell(r.ItemId, c.field, e.target.value)}
                              onKeyDown={(e) => { if (edit && e.key === 'Enter') saveRow(r); }}
                              inputMode={c.numeric ? 'decimal' : undefined}
                              list={edit && c.list ? `fill-${c.list}` : undefined}
                              disabled={saving}
                            />
                          ) : r[c.rowKey]}
                        </td>
                      ))}
                      <td className="px-3 py-1">
                        <div className="flex justify-end gap-1">
                          {edit ? (
                            <>
                              <button type="button" className="btn-ghost px-2 py-1 text-emerald-600 hover:bg-emerald-50" title="Save item" disabled={saving} onClick={() => saveRow(r)}>
                                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                              </button>
                              <button type="button" className="btn-ghost px-2 py-1" title="Cancel editing" disabled={saving} onClick={() => stopEdit(r.ItemId)}><X size={15} /></button>
                            </>
                          ) : (
                            <button type="button" className="btn-ghost px-2 py-1" title="Edit item" onClick={() => startEdit(r)}><Pencil size={15} /></button>
                          )}
                          <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete item" disabled={saving} onClick={() => remove(r)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showRows && (
          <div ref={pagerRef} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span>Showing {firstRowNo}–{lastRowNo} of {rows.length} items</span>
            <div className="flex items-center gap-1">
              <button type="button" className="btn-ghost px-2 py-1" title="First page" disabled={currentPage === 1} onClick={() => goToPage(1)}><ChevronsLeft size={16} /></button>
              <button type="button" className="btn-ghost px-2 py-1" title="Previous page" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}><ChevronLeft size={16} /></button>
              <span className="px-2">Page {currentPage} of {pageCount}</span>
              <button type="button" className="btn-ghost px-2 py-1" title="Next page" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)}><ChevronRight size={16} /></button>
              <button type="button" className="btn-ghost px-2 py-1" title="Last page" disabled={currentPage === pageCount} onClick={() => goToPage(pageCount)}><ChevronsRight size={16} /></button>
            </div>
          </div>
          )}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
