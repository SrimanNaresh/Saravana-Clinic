import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MAX_SHOWN = 50;

// A type-to-search box for picking one option (Item Name, Vendor Name). A
// click or focus opens the whole list (A–Z, first 50); typing narrows it.
// ↑ / ↓ move through the list, Enter picks, Esc closes and puts the chosen
// name back. The list is portalled with fixed positioning so a table's
// scroll box doesn't clip it.
//  - options: [{ value, label, hint? }]; value: the chosen option's value
//  - onChange(value, option)
//  - footer: optional { label, onClick } shown as the list's last row
//    (e.g. "+ Add vendor"), reachable with the arrow keys too
//  - other props (data-r, data-c, className, placeholder, disabled) go on the input
export default function SearchPick({ options, value, onChange, footer, className = 'input', placeholder, disabled, ...rest }) {
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState(null);

  const chosen = options.find((o) => String(o.value) === String(value));
  const sorted = useMemo(() => [...options].sort((a, b) => a.label.localeCompare(b.label)), [options]);
  const q = typed ? text.trim().toLowerCase() : '';
  const shown = (q ? sorted.filter((o) => o.label.toLowerCase().includes(q)) : sorted).slice(0, MAX_SHOWN);
  const rows = footer ? [...shown, { footer: true }] : shown;

  // Shows the chosen name whenever the box isn't being typed in.
  useEffect(() => { if (!open) setText(chosen?.label || ''); }, [chosen, open]);

  const openList = () => {
    if (disabled) return;
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setOpen(true);
    setTyped(false);
    setActive(Math.max(0, shown.findIndex((o) => String(o.value) === String(value))));
  };
  const close = () => { setOpen(false); setTyped(false); };

  useEffect(() => {
    if (!open) return undefined;
    const onScroll = (e) => { if (!listRef.current?.contains(e.target)) close(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close); };
  }, [open]);

  // Keeps the highlighted row in view.
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (row) => {
    if (!row) return;
    close();
    if (row.footer) footer.onClick(typed ? text.trim() : '');
    else onChange(row.value, row);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.altKey)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(rows[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close();
  };

  return (
    <>
      <input
        ref={inputRef}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        autoComplete="off"
        data-picker-open={open ? 'true' : 'false'}
        onClick={() => { if (!open) openList(); }}
        onFocus={(e) => { e.target.select(); }}
        onBlur={(e) => { if (!listRef.current?.contains(e.relatedTarget)) close(); }}
        onChange={(e) => {
          if (!open) openList();
          setText(e.target.value);
          setTyped(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        {...rest}
      />
      {open && rect && createPortal(
        <div
          ref={listRef}
          tabIndex={-1}
          className="fixed z-50 max-h-64 overflow-y-auto rounded-lg border border-ink-200 bg-white py-1 text-sm shadow-elevated"
          style={{ top: rect.bottom + 2, left: rect.left, minWidth: Math.max(rect.width, 220) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {rows.length === (footer ? 1 : 0) && <p className="px-3 py-1.5 text-ink-400">No matches</p>}
          {rows.map((row, i) => (
            <button
              key={row.footer ? '__footer' : row.value}
              type="button"
              data-i={i}
              className={`block w-full px-3 py-1 text-left ${i === active ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-50'} ${row.footer ? 'border-t border-ink-100 font-semibold text-brand-600' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(row)}
            >
              {row.footer ? footer.label : (
                <>
                  {row.label}
                  {row.hint && <span className="ml-2 text-xs text-ink-400">{row.hint}</span>}
                </>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
