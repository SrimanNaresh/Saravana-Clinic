// A4 GST Tax Invoice for one sale, printed only from the figures saved on the
// bill (HSN, GST %, Taxable, CGST, SGST per line) – never recalculated, so an
// old invoice prints the same even after an item's GST % changes.
// Hidden until window.print(); index.css hides the menus and .no-print parts.
//   clinic: clinicApi.get()   sale: salesBillingApi.get(id) (header + lines)

const n2 = (v) => Number(v || 0).toFixed(2);
const d = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '');
const mmyy = (iso) => {
  if (!iso) return '';
  const t = new Date(iso);
  return `${String(t.getUTCMonth() + 1).padStart(2, '0')}/${String(t.getUTCFullYear()).slice(2)}`;
};

// Rupees in words, Indian style (lakh / crore), e.g. 1250.50 -> "One Thousand
// Two Hundred Fifty Rupees and Fifty Paise Only".
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (x) => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? ` ${ONES[x % 10]}` : ''}`);
const three = (x) => [x >= 100 ? `${ONES[Math.floor(x / 100)]} Hundred` : '', two(x % 100)].filter(Boolean).join(' ');
function words(x) {
  if (x === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(x / 10000000); x %= 10000000;
  const lakh = Math.floor(x / 100000); x %= 100000;
  const thousand = Math.floor(x / 1000); x %= 1000;
  if (crore) parts.push(`${words(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (x) parts.push(three(x));
  return parts.join(' ');
}
export function amountInWords(v) {
  const paise = Math.round(Number(v || 0) * 100);
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `${words(r)} Rupees${p ? ` and ${two(p)} Paise` : ''} Only`;
}

export default function SalesGstInvoice({ clinic, sale }) {
  if (!sale) return null;
  const lines = sale.lines || [];
  const recorded = lines.some((l) => l.GSTPercent != null);
  // GST summary by rate, from the stored lines.
  const byRate = new Map();
  for (const l of lines) {
    if (l.GSTPercent == null) continue;
    const k = Number(l.GSTPercent);
    const t = byRate.get(k) || { taxable: 0, cgst: 0, sgst: 0 };
    t.taxable += Number(l.TaxableAmount || 0); t.cgst += Number(l.CGSTAmount || 0); t.sgst += Number(l.SGSTAmount || 0);
    byRate.set(k, t);
  }
  const rates = [...byRate.entries()].sort((a, b) => a[0] - b[0]);
  const cell = 'border border-ink-300 px-1.5 py-1';
  const num = `${cell} text-right tabular-nums`;

  return (
    <div className="hidden print:block">
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm; } }'}</style>
      <div className="mx-auto w-full max-w-[190mm] text-[11px] text-ink-900">
        <div className="flex items-start justify-between gap-4 border-b-2 border-ink-800 pb-2">
          <div className="flex items-start gap-3">
            {clinic?.Logo && <img src={clinic.Logo} alt="" className="h-14 w-14 object-contain" />}
            <div>
              <p className="text-base font-bold">{clinic?.Name || 'Clinic'}</p>
              {clinic?.Address && <p className="max-w-[95mm] whitespace-pre-line">{clinic.Address}</p>}
              <p>{[clinic?.ContactNo && `Ph: ${clinic.ContactNo}`, clinic?.Email].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold tracking-wide">TAX INVOICE</p>
            {clinic?.GSTIN && <p><b>GSTIN:</b> {clinic.GSTIN}</p>}
            {clinic?.DrugLicenceNo && <p><b>DL No:</b> {clinic.DrugLicenceNo}</p>}
            {clinic?.StateName && <p><b>State:</b> {clinic.StateName}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 border-b border-ink-300 py-2">
          <div>
            <p><b>Bill To:</b> {sale.PatientName || sale.CustomerName || 'Walk-in'}{sale.PatientCode ? ` (${sale.PatientCode})` : ''}</p>
            {sale.MobileNo && <p><b>Mobile:</b> {sale.MobileNo}</p>}
            {sale.DoctorName && <p><b>Doctor:</b> {sale.DoctorName}</p>}
          </div>
          <div className="text-right">
            <p><b>Invoice No:</b> {sale.Code}</p>
            <p><b>Date:</b> {d(sale.TransDate)}</p>
            {sale.PayMode && <p><b>Payment:</b> {sale.PayMode}</p>}
            {clinic?.StateName && <p><b>Place of Supply:</b> {clinic.StateName}</p>}
          </div>
        </div>

        <table className="mt-2 w-full border-collapse">
          <thead className="bg-ink-100">
            <tr>
              <th className={cell}>#</th><th className={`${cell} text-left`}>Item</th><th className={cell}>HSN</th><th className={cell}>Batch</th><th className={cell}>Exp</th>
              <th className={cell}>Qty</th><th className={cell}>MRP</th><th className={cell}>Rate</th><th className={cell}>Disc%</th>
              <th className={cell}>Taxable</th><th className={cell}>GST%</th><th className={cell}>CGST</th><th className={cell}>SGST</th><th className={cell}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.LineId || i}>
                <td className={`${cell} text-center`}>{i + 1}</td>
                <td className={cell}>{l.ItemName}{l.SaleUnit === 'unit' ? ' (unit)' : ''}</td>
                <td className={`${cell} text-center`}>{l.HSNCode || ''}</td>
                <td className={`${cell} text-center`}>{l.Batch || ''}</td>
                <td className={`${cell} text-center`}>{mmyy(l.ExpiryDate)}</td>
                <td className={num}>{Number(l.UnitQty)}</td>
                <td className={num}>{l.MRP == null ? '' : n2(l.SaleUnit === 'unit' && l.PackSize > 1 ? Number(l.MRP) / l.PackSize : l.MRP)}</td>
                <td className={num}>{n2(l.Rate)}</td>
                <td className={num}>{Number(l.DiscPercent) ? Number(l.DiscPercent) : ''}</td>
                <td className={num}>{l.TaxableAmount == null ? '' : n2(l.TaxableAmount)}</td>
                <td className={num}>{l.GSTPercent == null ? '' : Number(l.GSTPercent)}</td>
                <td className={num}>{l.CGSTAmount == null ? '' : n2(l.CGSTAmount)}</td>
                <td className={num}>{l.SGSTAmount == null ? '' : n2(l.SGSTAmount)}</td>
                <td className={`${num} font-semibold`}>{n2(l.Amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 grid grid-cols-[1fr_70mm] gap-4">
          <div>
            {recorded ? (
              <table className="w-full border-collapse">
                <thead className="bg-ink-100">
                  <tr><th className={cell}>GST%</th><th className={cell}>Taxable</th><th className={cell}>CGST</th><th className={cell}>SGST</th><th className={cell}>Total GST</th></tr>
                </thead>
                <tbody>
                  {rates.map(([rate, t]) => (
                    <tr key={rate}>
                      <td className={`${cell} text-center`}>{rate}%</td><td className={num}>{n2(t.taxable)}</td><td className={num}>{n2(t.cgst)}</td>
                      <td className={num}>{n2(t.sgst)}</td><td className={num}>{n2(t.cgst + t.sgst)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className={`${cell} text-center`}>Total</td><td className={num}>{n2(sale.TaxableAmount)}</td><td className={num}>{n2(sale.CGSTAmount)}</td>
                    <td className={num}>{n2(sale.SGSTAmount)}</td><td className={num}>{n2(Number(sale.CGSTAmount || 0) + Number(sale.SGSTAmount || 0))}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="italic text-ink-500">GST was not recorded on this bill (saved before GST recording started).</p>
            )}
            <p className="mt-2"><b>Amount in words:</b> {amountInWords(sale.TotalAmount)}</p>
          </div>
          <table className="w-full border-collapse self-start">
            <tbody>
              <tr><td className={cell}>Sub Total</td><td className={num}>{n2(sale.SubTotal)}</td></tr>
              {Number(sale.DiscountAmount) > 0 && <tr><td className={cell}>Bill Discount ({Number(sale.DiscPercent)}%)</td><td className={num}>- {n2(sale.DiscountAmount)}</td></tr>}
              {Number(sale.RoundOff) !== 0 && <tr><td className={cell}>Round Off</td><td className={num}>{Number(sale.RoundOff) > 0 ? '+ ' : '- '}{n2(Math.abs(Number(sale.RoundOff)))}</td></tr>}
              <tr className="bg-ink-100 text-[12px] font-bold"><td className={cell}>Net Amount</td><td className={num}>{n2(sale.TotalAmount)}</td></tr>
              {sale.PaidAmount != null && <tr><td className={cell}>Paid</td><td className={num}>{n2(sale.PaidAmount)}</td></tr>}
              {Number(sale.DueAmount) > 0 && <tr className="font-semibold"><td className={cell}>Due (credit)</td><td className={num}>{n2(sale.DueAmount)}</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-end justify-between">
          <p className="max-w-[110mm] text-[10px] text-ink-600">Prices include GST. Goods once sold are taken back only as per the clinic&apos;s return policy. This is a computer-generated invoice.</p>
          <div className="text-center">
            <div className="mb-1 h-10" />
            <p className="border-t border-ink-400 px-6 pt-1">For {clinic?.Name || 'the clinic'}<br />Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
