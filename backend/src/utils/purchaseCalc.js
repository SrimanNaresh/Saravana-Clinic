// Purchase / Order line formulas. The same file is in
// frontend/src/utils/purchaseCalc.js so the screen and the server work out
// every line the same way — keep the two copies identical.
//   Cur.Rate     = MRP - (MRP x Disc % / 100)
//   Amount       = Quantity x Cur.Rate
//   GST %        = CGST % + SGST %
//   GST Amount   = Amount / 100 x GST %
//   Total Amount = Amount + GST Amount
// Each step is rounded to paise.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

export function purchaseLine({ mrp, discPercent, quantity, cgstPercent, sgstPercent }) {
  const m = num(mrp);
  const rate = round2(m - (m * num(discPercent)) / 100);
  const amount = round2(num(quantity) * rate);
  const gstPercent = round2(num(cgstPercent) + num(sgstPercent));
  const gstAmount = round2((amount / 100) * gstPercent);
  return { rate, amount, gstPercent, gstAmount, total: round2(amount + gstAmount) };
}

export const purchaseTotal = (lines) => round2(lines.reduce((s, l) => s + purchaseLine(l).total, 0));

// Stock In selling price: Cur.Rate plus Sales %, then less Discount %.
//   e.g. 90 -> +20 % -> 108 -> -5 % -> 102.60
export function selAmount({ rate, salesPercent, discPercent }) {
  const withMargin = round2(num(rate) * (1 + num(salesPercent) / 100));
  return round2(withMargin * (1 - num(discPercent) / 100));
}
