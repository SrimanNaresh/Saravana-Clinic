import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Package, Search, List, X, CheckCircle2, Save, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { pharmacyItemApi, genericNameApi, manufacturerApi, unitApi } from '../../api/client.js';
import { useItemMasters } from './itemFormParts.jsx';
import ItemImport, { ITEM_LIST_TEMPLATE } from './ItemImport.jsx';
import CellCombo from './CellCombo.jsx';

const PAGE_SIZE = 30;

// List columns after Item Name, in display order. Every cell is a text box
// showing the saved value (blank when there's none), to type into and save
// with Enter or Save All. `field` is the key the PATCH route takes, `rowKey`
// where the list row carries the value, `list` the master whose names are
// suggested, `width` the box's width.
const FILL_COLUMNS = [
  { field: 'GenericName', rowKey: 'GenericNameName', list: 'genericNames', width: 'w-32' },
  { field: 'Manufacturer', rowKey: 'ManufacturerName', list: 'manufacturers', width: 'w-32' },
  { field: 'HSNCode', rowKey: 'HSNCode', suggest: 'as new HSN code', width: 'w-20' },
  { field: 'MRP', rowKey: 'MRP', numeric: true, width: 'w-20' },
  { field: 'Unit', rowKey: 'UnitName', list: 'units', width: 'w-20' },
  { field: 'Pack', rowKey: 'Pack', suggest: 'as new pack', width: 'w-16' },
  { field: 'GSTPercent', rowKey: 'GSTPercent', numeric: true, suggest: 'as new GST %', width: 'w-16' },
  { field: 'SellPrice', rowKey: 'SellPrice', numeric: true, width: 'w-20' },
  { field: 'Rack', rowKey: 'Rack', suggest: 'as new rack', width: 'w-16' },
  { field: 'BoxNo', rowKey: 'BoxNo', suggest: 'as new box no', width: 'w-16' },
];
// HSN / GST / Rack / Box No / Pack (`suggest` set) have no master table: their dropdowns
// list the values already used on items, and "Add" just keeps the typed
// value (offered to the other rows too until the list reloads).
const addLocal = (name) => Promise.resolve({ id: name, name });
const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const cellText = (v) => (isBlank(v) ? '' : String(v));

// A master-backed box's master: its API, how a create's result maps to
// { id, name }, the useItemMasters() adder that remembers a new row, and labels.
const MASTER_CREATE = {
  genericNames: {
    api: genericNameApi, toRow: (r) => ({ id: r.GenericNameId, name: r.Name }),
    adder: 'addGenericName', addLabel: 'as new generic name', noun: 'generic name',
  },
  manufacturers: {
    api: manufacturerApi, toRow: (r) => ({ id: r.ManufacturerId, name: r.Name }),
    adder: 'addManufacturer', addLabel: 'as new manufacturer', noun: 'manufacturer',
  },
  units: {
    api: unitApi, toRow: (r) => ({ id: r.UnitId, name: r.Name }),
    adder: 'addUnit', addLabel: 'as new unit', noun: 'unit',
  },
};

export default function ItemListNew() {
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  // The screen opens empty; items are fetched only after View List or an upload.
  const [listShown, setListShown] = useState(false);
  const [notice, setNotice] = useState('');
  // Typed, unsaved box values: { [ItemId]: { [field]: value } }.
  const [editRows, setEditRows] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [search, setSearch] = useState('');
  const masters = useItemMasters();
  // Values added from a `suggest` box's dropdown: { [field]: [name] }.
  const [addedValues, setAddedValues] = useState({});
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

  // Distinct values per `suggest` column, from the loaded items plus any just added.
  const suggestions = useMemo(() => Object.fromEntries(FILL_COLUMNS.filter((c) => c.suggest).map((c) => {
    const seen = new Map();
    [...rows.map((r) => cellText(r[c.rowKey]).trim()), ...(addedValues[c.field] || [])].forEach((v) => {
      if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
    });
    const names = [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return [c.field, names.map((n) => ({ id: n, name: n }))];
  })), [rows, addedValues]);
  const rememberValue = (field) => (row) => setAddedValues((a) => ({ ...a, [field]: [...(a[field] || []), row.name] }));

  // Dropdown Edit / Delete. A master name is renamed or removed in its master
  // (items already using a removed one keep showing it); a HSN / GST / Rack /
  // Box No value is renamed or cleared on every item that has it.
  const afterValueChange = async (message) => {
    setNotice(message);
    masters.reload();
    await load(search, { quiet: true });
  };
  const masterHandlers = (list) => {
    const m = MASTER_CREATE[list];
    return {
      createFn: (name) => m.api.create({ name }).then(m.toRow),
      onCreated: masters[m.adder],
      addLabel: m.addLabel,
      onRename: async (opt, name) => {
        await m.api.update(opt.id, { name });
        await afterValueChange(`Renamed ${m.noun} "${opt.name}" to "${name}".`);
      },
      onDelete: async (opt) => {
        if (!confirm(`Delete ${m.noun} "${opt.name}" from the list?`)) return false;
        await m.api.remove(opt.id);
        await afterValueChange(`Deleted ${m.noun} "${opt.name}".`);
        return true;
      },
    };
  };
  const valueHandlers = (c) => {
    const swapAdded = (from, to) => setAddedValues((a) => ({
      ...a, [c.field]: (a[c.field] || []).filter((v) => v !== from).concat(to ? [to] : []),
    }));
    const label = c.suggest.replace(/^as new /, '');
    return {
      createFn: addLocal,
      onCreated: rememberValue(c.field),
      addLabel: c.suggest,
      onRename: async (opt, name) => {
        const { affected } = await pharmacyItemApi.replaceValue(c.field, opt.name, name);
        swapAdded(opt.name, name);
        await afterValueChange(`Renamed ${label} "${opt.name}" to "${name}" on ${affected} item${affected === 1 ? '' : 's'}.`);
      },
      onDelete: async (opt) => {
        if (!confirm(`Delete ${label} "${opt.name}"? It will be cleared from every item that has it.`)) return false;
        const { affected } = await pharmacyItemApi.replaceValue(c.field, opt.name, '');
        swapAdded(opt.name, null);
        await afterValueChange(`Deleted ${label} "${opt.name}" from ${affected} item${affected === 1 ? '' : 's'}.`);
        return true;
      },
    };
  };

  const stopEdit = (itemId) => setEditRows(({ [itemId]: _, ...rest }) => rest);
  const setCell = (itemId, field, value) => setEditRows((e) => ({ ...e, [itemId]: { ...e[itemId], [field]: value } }));

  // The boxes on a row whose value changed. A box cleared to blank is left
  // as it was (the PATCH route never blanks a field).
  const changedFields = (r) => {
    const values = editRows[r.ItemId] || {};
    return Object.fromEntries(FILL_COLUMNS
      .filter((c) => !isBlank(values[c.field]) && values[c.field].trim() !== cellText(r[c.rowKey]))
      .map((c) => [c.field, values[c.field].trim()]));
  };
  // Rows with typed changes, on any page (for Save All).
  const pendingRows = rows.filter((r) => editRows[r.ItemId] && Object.keys(changedFields(r)).length > 0);

  const saveRow = async (r) => {
    const changed = changedFields(r);
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

  // Saves every row with typed changes in one go. Rows that fail keep their
  // typed values so they can be retried.
  const saveAll = async () => {
    const batch = pendingRows.map((r) => [r, changedFields(r)]);
    setSavingAll(true);
    const results = await Promise.allSettled(batch.map(([r, changed]) => pharmacyItemApi.patch(r.ItemId, changed)));
    const failed = batch.filter((_, i) => results[i].status === 'rejected');
    batch.forEach(([r], i) => { if (results[i].status === 'fulfilled') stopEdit(r.ItemId); });
    const saved = batch.length - failed.length;
    if (saved) {
      setNotice(`Saved ${saved} item${saved === 1 ? '' : 's'}.`);
      masters.reload();
      await load(search, { quiet: true });
    }
    if (failed.length) {
      const err = results.find((x) => x.status === 'rejected').reason;
      show(`${failed.length} item(s) not saved: ${err.response?.data?.error || err.message}`, 'error');
    }
    setSavingAll(false);
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={Package}
          title="Bulk Itemlist"
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

          {/* The table scrolls inside its own viewport-sized box (with its own
              scrollbar) so long lists stay navigable and the header stays pinned.
              Its headers show even while empty, with the status in the body. */}
          <div
            ref={tableBoxRef}
            className="overflow-auto rounded-lg border border-ink-100"
            style={{ maxHeight: tableMaxHeight ?? 'calc(100vh - 19rem)' }}
          >
            <table className="w-full whitespace-nowrap text-center text-[11px]">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-ink-50">
                <tr className="table-head !text-[11px]">
                  <th className="rounded-l-lg px-3 py-1.5">Item Code</th>
                  <th className="px-3 py-1.5">Item Name</th>
                  <th className="px-3 py-1.5">Generic Name</th>
                  <th className="px-3 py-1.5">Manufacturer</th>
                  <th className="px-3 py-1.5">HSN</th>
                  <th className="px-3 py-1.5">MRP</th>
                  <th className="px-3 py-1.5">Unit</th>
                  <th className="px-3 py-1.5">Pack</th>
                  <th className="px-3 py-1.5">GST</th>
                  <th className="px-3 py-1.5">Sell Price</th>
                  <th className="px-3 py-1.5">Rack</th>
                  <th className="rounded-r-lg px-3 py-1.5">Box No</th>
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
                  const typed = editRows[r.ItemId];
                  const saving = savingId === r.ItemId || (savingAll && !!typed);
                  return (
                    <tr key={r.ItemId} className={`table-row ${typed ? 'bg-brand-50/40' : ''}`}>
                      <td className="px-3 py-1 text-slate-500">{r.ItemCode}</td>
                      <td className="px-3 py-1 font-medium text-slate-700">{r.Name}</td>
                      {FILL_COLUMNS.map((c) => (
                        <td key={c.field} className="px-2 py-1 text-slate-500">
                          {c.list ? (
                            <CellCombo
                              className={`input h-6 rounded-md px-1.5 py-0 text-[11px] ${c.width}`}
                              value={typed?.[c.field] ?? cellText(r[c.rowKey])}
                              onChange={(v) => setCell(r.ItemId, c.field, v)}
                              options={masters[c.list]}
                              {...masterHandlers(c.list)}
                              onEnter={() => saveRow(r)}
                              disabled={saving}
                            />
                          ) : c.suggest ? (
                            <CellCombo
                              className={`input h-6 rounded-md px-1.5 py-0 text-[11px] ${c.width}`}
                              value={typed?.[c.field] ?? cellText(r[c.rowKey])}
                              onChange={(v) => setCell(r.ItemId, c.field, v)}
                              options={suggestions[c.field]}
                              {...valueHandlers(c)}
                              onEnter={() => saveRow(r)}
                              disabled={saving}
                            />
                          ) : (
                            <input
                              className={`input h-6 rounded-md px-1.5 py-0 text-[11px] ${c.width}`}
                              value={typed?.[c.field] ?? cellText(r[c.rowKey])}
                              onChange={(e) => setCell(r.ItemId, c.field, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveRow(r); }}
                              inputMode={c.numeric ? 'decimal' : undefined}
                              disabled={saving}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showRows && (
          <div ref={pagerRef} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span>Showing {firstRowNo}–{lastRowNo} of {rows.length} items</span>
            <button
              type="button"
              className="btn-primary"
              disabled={pendingRows.length === 0 || savingAll}
              title={pendingRows.length ? 'Save every row you have typed into' : 'Type into the boxes, then save them all here'}
              onClick={saveAll}
            >
              {savingAll ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {savingAll ? 'Saving...' : `Save All${pendingRows.length ? ` (${pendingRows.length})` : ''}`}
            </button>
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
