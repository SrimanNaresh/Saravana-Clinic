import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { CardHeader, Spinner, EmptyState, Toast } from '../../components/ui.jsx';
import { useToast } from '../../hooks/useToast.js';
import { stockInwardApi } from '../../api/client.js';

const PAGE_SIZE = 30;

// API dates come as ISO strings: Bill Date shows as DD/MM/YYYY, Exp Date as MM/YYYY.
const showDate = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '-');
const showMonth = (v) => (v ? String(v).slice(0, 7).split('-').reverse().join('/') : '-');

export default function StockInwardList() {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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

  const load = useCallback(async (q = '', { quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setRows(await stockInwardApi.list(q));
    } catch {
      show('Failed to load inward entries', 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  // A new search starts back at page 1; a delete that empties the
  // last page falls back to the new last page.
  useEffect(() => { setPage(1); }, [search]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstRowNo = (currentPage - 1) * PAGE_SIZE + 1;
  const lastRowNo = firstRowNo + pageRows.length - 1;
  const goToPage = (p) => {
    setPage(Math.min(Math.max(1, p), pageCount));
    tableBoxRef.current?.scrollTo({ top: 0 });
  };

  const editRow = (row) => navigate('/pharmacy/stock-inward', { state: { editInward: row } });

  const remove = async (row) => {
    if (!confirm(`Delete inward entry of "${row.ItemName}" from "${row.VendorName}"?`)) return;
    try {
      await stockInwardApi.remove(row.StockInwardId);
      show('Inward entry deleted successfully', 'success');
      load(search, { quiet: true });
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="card">
        <CardHeader
          icon={List}
          title="Inward List"
          subtitle="Search, edit and delete inward entries"
          actions={
            <>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search code, item, vendor, batch..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button type="button" className="btn-primary" onClick={() => navigate('/pharmacy/stock-inward')}>
                <Plus size={16} /> Add
              </button>
            </>
          }
        />

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No inward entries found." />
        ) : (
          <>
          {/* The table scrolls inside its own viewport-sized box (with its own
              scrollbar) so long lists stay navigable and the header stays pinned. */}
          <div
            ref={tableBoxRef}
            className="overflow-auto rounded-lg border border-ink-100"
            style={{ maxHeight: tableMaxHeight ?? 'calc(100vh - 19rem)' }}
          >
            <table className="w-full whitespace-nowrap text-left text-[11px]">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-ink-50">
                <tr className="table-head !text-[11px]">
                  <th className="rounded-l-lg px-3 py-3">Purchase Code</th>
                  <th className="px-3 py-3">Bill Date</th>
                  <th className="px-3 py-3">Item Name</th>
                  <th className="px-3 py-3">HSN</th>
                  <th className="px-3 py-3">Manufacturer</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Batch</th>
                  <th className="px-3 py-3">Exp Date</th>
                  <th className="px-3 py-3">Old Price</th>
                  <th className="px-3 py-3">Current Price</th>
                  <th className="px-3 py-3">GST %</th>
                  <th className="px-3 py-3">Discount %</th>
                  <th className="px-3 py-3">Net Price</th>
                  <th className="rounded-r-lg px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.StockInwardId} className="table-row">
                    <td className="px-3 py-3 text-slate-500">{r.PurchaseCode || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{showDate(r.BillDate)}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{r.ItemName}</td>
                    <td className="px-3 py-3 text-slate-500">{r.HSNCode || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.ManufacturerName || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.VendorName}</td>
                    <td className="px-3 py-3 text-slate-500">{r.Quantity}</td>
                    <td className="px-3 py-3 text-slate-500">{r.UnitName || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.Batch || '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{showMonth(r.ExpiryDate)}</td>
                    <td className="px-3 py-3 text-slate-500">{r.OldPrice ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.CurrentPrice ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.GSTPercent ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-500">{r.DiscountPercent ?? '-'}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{r.NetPrice ?? '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="btn-ghost px-2 py-1" title="Edit entry" onClick={() => editRow(r)}><Pencil size={15} /></button>
                        <button type="button" className="btn-ghost px-2 py-1 text-red-500 hover:bg-red-50" title="Delete entry" onClick={() => remove(r)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div ref={pagerRef} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span>Showing {firstRowNo}–{lastRowNo} of {rows.length} entries</span>
            <div className="flex items-center gap-1">
              <button type="button" className="btn-ghost px-2 py-1" title="First page" disabled={currentPage === 1} onClick={() => goToPage(1)}><ChevronsLeft size={16} /></button>
              <button type="button" className="btn-ghost px-2 py-1" title="Previous page" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}><ChevronLeft size={16} /></button>
              <span className="px-2">Page {currentPage} of {pageCount}</span>
              <button type="button" className="btn-ghost px-2 py-1" title="Next page" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)}><ChevronRight size={16} /></button>
              <button type="button" className="btn-ghost px-2 py-1" title="Last page" disabled={currentPage === pageCount} onClick={() => goToPage(pageCount)}><ChevronsRight size={16} /></button>
            </div>
          </div>
          </>
        )}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
