// Purchase / Order line formulas. The same file is in
// frontend/src/utils/purchaseCalc.js so the screen and the server work out
// every line the same way — keep the two copies identical.
//   Cur.Rate     = P.Rate - (P.Rate x Disc % / 100)
//   Amount       = Quantity x Cur.Rate (Free units aren't charged)
//   GST %        = CGST % + SGST %
//   GST Amount   = Amount / 100 x GST %
//   Total Amount = Amount + GST Amount
// Each step is rounded to paise.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

export function purchaseLine({ pRate, discPercent, quantity, cgstPercent, sgstPercent }) {
  const p = num(pRate);
  const rate = round2(p - (p * num(discPercent)) / 100);
  const amount = round2(num(quantity) * rate);
  const gstPercent = round2(num(cgstPercent) + num(sgstPercent));
  const gstAmount = round2((amount / 100) * gstPercent);
  return { rate, amount, gstPercent, gstAmount, total: round2(amount + gstAmount) };
}

export const purchaseTotal = (lines) => round2(lines.reduce((s, l) => s + purchaseLine(l).total, 0));

// Stock In selling price: the MRP less Discount % of it.
//   e.g. MRP 32.12, Discount 10 % -> 28.91; no discount -> 32.12
export function selAmount({ mrp, discPercent }) {
  return round2(num(mrp) * (1 - num(discPercent) / 100));
}

// Pieces in one pack, read from the item's Pack text: "10's" / "10" / "10 tabs"
// -> 10, "1x15" -> 15, "10x10" -> 100. A volume or weight ("200ML", "50GM")
// or anything else can't be split, so it counts as 1.
export function packSize(pack) {
  const s = String(pack ?? '').trim().toLowerCase();
  const times = /^(\d+)\s*[x×*]\s*(\d+)/.exec(s);
  if (times) return Math.max(1, Number(times[1]) * Number(times[2]));
  const count = /^(\d+)\s*('?s|tabs?|tablets?|caps?|capsules?|nos|pcs?|pieces?)?$/.exec(s);
  return count ? Math.max(1, Number(count[1])) : 1;
}
