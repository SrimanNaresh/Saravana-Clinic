/**
 * 12-hour time picker with AM/PM.
 * Value format: "hh:mm AM" / "hh:mm PM" (e.g. "09:00 AM", "05:30 PM").
 * Emits an empty string until all parts are chosen.
 */
const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')); // 00,05,...,55
const meridiems = ['AM', 'PM'];

function parse(value) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((value || '').trim());
  if (!m) return { hour: '', minute: '', meridiem: '' };
  return { hour: m[1].padStart(2, '0'), minute: m[2], meridiem: m[3].toUpperCase() };
}

export default function TimePicker({ value, onChange }) {
  const { hour, minute, meridiem } = parse(value);

  const emit = (h, m, ap) => {
    if (h && m && ap) onChange(`${h}:${m} ${ap}`);
    else onChange('');
  };

  const selCls =
    'input px-2 text-center appearance-none';

  return (
    <div className="flex items-center gap-1.5">
      <select className={selCls} value={hour} onChange={(e) => emit(e.target.value, minute || '00', meridiem || 'AM')} aria-label="Hour">
        <option value="">HH</option>
        {hours.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="font-semibold text-ink-400">:</span>
      <select className={selCls} value={minute} onChange={(e) => emit(hour || '12', e.target.value, meridiem || 'AM')} aria-label="Minute">
        <option value="">MM</option>
        {minutes.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className={selCls} value={meridiem} onChange={(e) => emit(hour || '12', minute || '00', e.target.value)} aria-label="AM or PM">
        <option value="">--</option>
        {meridiems.map((ap) => <option key={ap} value={ap}>{ap}</option>)}
      </select>
    </div>
  );
}
