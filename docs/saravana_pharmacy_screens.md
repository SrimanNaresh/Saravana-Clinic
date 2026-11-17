# Saravana Clinic – Pharmacy screen design (proposal, 17-11-2026)

Status: **draft for approval – no code written yet.** Database side: `docs/saravana_pharmacy_db.md`.

All screens keep today's look: `CardHeader`, `.input` / `.label`, `SearchPick`, and the shared compact
Pharmacy tables (`.ph-table`: 28 px rows, tinted one-line headings, light grid lines, stripes, numbers right,
codes / dates centred, fixed column shares adding to 100 %). Keyboard rules as in `docs/Pharmacy-Module-Prompt.md`
(← → between boxes, ↑ ↓ between rows, Enter moves on, number boxes don't step).

## Menu after the change

```
Pharmacy
  Dashboard        (new – first item)
  Item             → Master · List · Bulk Update                    (Scan Bill button on Master)
  Vendor           → Master · List · Payments
  Purchase / Order → Master · List                                  (Scan Bill button)
  Stock In         → Master · List · Three in One (new) · Adjustment · Adjustment List
  Return           → Master · List · Sales Return · Sales Return List
  Sales            → Master · List · Credit Ledger (new)
  Report           → Stock Report · Vendor Payments · All in One · Expiry (new) · Low Stock (new) · GST / HSN Summary (new)
```

---

## 1. Pharmacy Dashboard (from Ayush, `/pharmacy/dashboard`)

- **Tiles (one row, wraps on small screens):** Today's Sales (₹, bills), This Month's Sales, Today's Refunds,
  This Month's Purchases, **Payable to Vendors** (unpaid Stock In balance), **Credit Due from Patients** (new),
  Stock Value. Big amounts shown short (₹1.2L) with the full figure in the tooltip.
- **Last 7 days** sales bar chart (amount, bills on hover).
- Lists (compact tables, top 8, "View all" opens the report):
  - **Low stock** – items at / below their Re-order Level (red at 0).
  - **Expiring in 90 days** – batch, expiry MM/YY, qty; expired in red.
  - **Latest bills** – Bill No, time, customer, amount; click opens it in Sales.
- Refresh button; numbers come from one API call. Read-only.

## 2. Three in One (IPS) (from Ayush, Stock In → Three in One)

One screen for a supplier bill: adds new items, saves the Purchase Order and the Stock In in one Save.

**Top row:** Vendor Name\* (searchable, + Add vendor), Bill No\* (capitals, max 50), Bill Date\*, Details ›,
**Scan Bill** button, **Drafts (n)** button.

**Grid** (columns grouped like Item Master | Purchase / Order | Stock In, group headings tinted):
`# | Item Name | HSN | Category | Pack | Unit | MRP | P.Rate | Disc% | Qty | Free | GST% | Batch No | Mf.Date | Exp.Date | S.Disc% | Sel.Amount | Amount | Total | bin`
- Item Name searches Item Master; a name not found becomes a **new item** (green "New" tag). An existing item with
  the same Name + HSN + Category is reused.
- Always one empty row at the bottom. Mf / Exp typed as digits (`0228` → 02/28).
- Footer: Sum of Total, Round Off, Net Amount.
- Checks (same as each screen's own): P.Rate ≤ MRP, Qty or Free > 0, Batch and Exp required, Exp not past,
  GST % ≤ 28. A wrong row turns red with its reason; **Save All** stays disabled while any row is red.

**Buttons:** **Save Draft** (any time; needs a Vendor or a Bill No; saves the whole screen as JSON, again =
update), **Save All** (items → order → Stock In, then deletes the draft; if the Stock In fails after the order
saved, the order is kept and Save All retries only the Stock In), Cancel.
**Drafts list** (modal table): Bill No, Vendor, Date, Lines, Net, Last saved, Open / Delete. A draft whose Vendor +
Bill No match a saved Stock In shows a warning.

## 3. Scan Bill (from Ayush, a modal)

Opened from Item Master (adds item names), Purchase / Order and Three in One (fills the grid).
1. Upload a photo / PDF (or take a photo on a phone). PDF pages are turned into images with `pdfjs-dist`.
2. The bill is shown upright (rotate, zoom, pan); drag a box over the item table (header row included) or just the
   Item Description column.
3. OCR runs **in the browser** (`tesseract.js`, English); nothing is sent to an outside AI service.
   ❓ tesseract downloads its language file (~10 MB) from a CDN the first time – OK, or host it on our server?
4. Results in three tabs: **New items** / **Similar** (matched to an existing item; can be switched to "add as new")
   / **Already exists** (skipped). Each tab is an editable grid; Add saves them (or fills the calling grid).

## 4. Sales (changed)

**Top row:** Date\*, **Patient** (searchable by name / mobile / patient id; picking fills Customer Name + Mobile;
"Walk-in" if empty), Customer Name\*, Mobile No, **Prescription** (enabled after a patient: their last 10
prescriptions "date · doctor · n medicines"), **Doctor** (filled from the prescription, can be picked).

- Picking a prescription adds its medicines to the grid: each `MedicineName` is matched to an Item (exact name
  first, then starts-with); unmatched ones are listed above the grid in amber ("Not in stock / not found: …")
  for the pharmacist to pick by hand. Quantity is left for the pharmacist.
- **Grid:** as today, plus a **GST ›** arrow on the Amount heading that shows `HSN | GST% | Taxable | GST Amt`
  (sky tint) in place of Rack / Box / Purchase Price, so it still fits 1280 px.
- **Footer** as today (Sub Total, Bill Discount %, Total, Round Off, Net Amount) plus a **Payment** row:
  **Pay Mode** (Cash · UPI · Card · Credit), **Paid** (defaults to Net Amount), **Due** (= Net − Paid, shown red),
  **Reference** (UPI txn / card last 4; required for UPI and Card).
- Rules: Paid ≤ Net; Due > 0 only when a Patient is picked ("Pick a patient to give credit"); Pay Mode Credit
  sets Paid = 0. The server re-checks everything and works out the GST itself.
- **Keyboard flow:** Date → Patient (type + Enter) → Prescription (↑↓, Enter; or skip with Tab) → Item rows exactly as
  today (Item → Batch → Sell by → Qty → Disc% → next item) → **F8** jumps to Pay Mode → Paid → Enter = Save,
  **Ctrl+Enter** = Save & Print. Esc closes a drop-down. A hint line under the grid lists these keys.
- **Print choice** on Save & Print: **Receipt** (current layout) or **GST Invoice (A4)**; the last choice is
  remembered on this computer.

### GST Invoice (A4 print)
- Header: clinic logo, name, address, phone, **GSTIN, DL No, State**; title "TAX INVOICE"; Bill No, Date,
  Patient / Customer, Mobile, Doctor, Pay Mode.
- Lines: `# | Item | HSN | Batch | Exp | Qty | MRP | Rate | Disc% | Taxable | GST% | CGST | SGST | Amount`.
- GST summary by rate: `GST% | Taxable | CGST | SGST | Total`; then Sub Total, Bill Discount, Round Off,
  **Net Amount**, amount in words, Paid / Due. Footer: "Goods once sold…" line ❓ and signature.
- Prints from the stored figures only (never recalculated).

## 5. Sales Return (changed)
- New **Refund** choice in the footer: **Cash** (money back) or **Adjust in credit** (only when the sale was to a
  patient with a due; reduces the balance). Refund Amount as today; GST per line stored like the sale.

## 6. Credit Ledger (new, Sales → Credit Ledger)
- **Top:** Patient (searchable; empty = all patients with a balance), Show settled tick box.
- **Without a patient:** table `Patient | Mobile | Bills on credit | Due | Returns | Paid | Balance | Last bill`,
  Total row, click a row to open it.
- **With a patient:** strip with name, mobile, **Balance** (amber while owed, green at 0); ledger table by date:
  `Date | Type (Bill / Return / Payment) | No | Debit | Credit | Balance`, running balance; clicking a bill opens it.
- **Receive payment** form (only while Balance > 0): Date\*, Amount\* (≤ Balance), Pay Mode\*, Reference No
  (required except Cash), Notes, **Receive** (Enter). Admin sees a bin on payments (soft delete).
  Prints a small payment receipt (optional).

## 7. Item Master / Bulk Update / Item List (changed)
- Item Master row 1 gets **Re-order Level** (packs) after Box; Bulk Update gets the column; Item List's Stock is red
  at / below it (blank = the default 5).

## 8. Reports (new)

**Expiry Report** – tabs **Expired · 30 days · 60 days · 90 days**, category and vendor filters.
`Item Code | Item Name | Batch | Exp | Stock | MRP | Stock Value (at MRP) | Last Vendor`, Total row; expired rows red,
≤ 30 days amber. Print and Excel.

**Low Stock** – items at / below their Re-order Level, category filter, "include zero stock" tick box.
`Item Code | Item Name | Category | Stock | Re-order Level | Short by | Last Vendor | Last P.Rate`. Print and Excel
(can be used as an order list).

**GST / HSN Summary** – From / To dates (default this month).
`HSN | GST% | Qty | Taxable | CGST | SGST | IGST | Total`, one row per HSN + rate, **sales less sales returns**;
Total row; a separate small line for "Bills before GST recording" (old bills) ❓. Second tab **Rate-wise**
(`GST% | Taxable | CGST | SGST | Total`). Print and Excel. Reads stored line GST only.

## 9. Clinic Master (changed)
- Fields **GSTIN**, **Drug Licence No**, **State** (used on the GST invoice).

---

## Build order (one feature per commit, after your OK)

1. Migration (all of `saravana_pharmacy_db.md` §7) – run `npm run init-db` on T_EHRSaravanaClinic.
2. Re-order Level + Low Stock report + Expiry report.
3. GST stored on sale / return lines + Clinic GST fields + A4 GST invoice + GST / HSN Summary.
4. Patient / prescription / doctor on Sales.
5. Payment modes + Credit Ledger + Sales Return refund mode.
6. Pharmacy Dashboard.
7. Scan Bill (adds `tesseract.js`, `pdfjs-dist`).
8. Three in One + drafts.

After each step: build, the pharmacy checks (`backend/scripts` – Saravana has no `smokeTest.js` /
`pharmacyChecks.js` yet; I'll port them from Ayush and point them at T_EHRSaravanaClinic with test rows that are
deleted afterwards), and a check in the browser. Deploy to saravanaclinic.thangaminfotech.com only when you say.
