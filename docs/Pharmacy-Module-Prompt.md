# Prompt – Pharmacy Module (updated 05-11-2026, as built for Saravana Clinic)

Copy everything below the line into Claude (or another AI coding assistant) inside the clinic's project.
Change the words in **[square brackets]** first. This version includes every change made while building it
for Saravana Clinic (October – November 2026). The **Database Details** section at the end lists every table and
column exactly as built, so it can also be used to build a separate **Pharmacy-only** app on the same database
design.

---

Build a complete **Pharmacy module** for **[Saravana Clinic]**'s clinic management app. Follow the existing
project's stack, code style, permissions and UI components. If the project has no stack yet, use React (Vite) +
Tailwind for the web app, Node.js (Express) for the API and Microsoft SQL Server for the database.

- **Single clinic:** no clinic / branch column. Document numbers use one fixed clinic code:
  `[SC]-<PREFIX><4 digits>`, e.g. `SC-PO0001`. (For a multi-branch app, add `clinic_id` to every table and keep
  every list, number series and report per clinic.)
- **Language:** English only. (Add Tamil only if the app already has translations.)
- **Roles:** "Admin" and other users. Only an Admin may delete orders / Stock Ins or edit a saved Stock In; the
  server checks the role too.

## General rules for every screen

- **Screens, not pop-ups.** Add / edit forms open as full pages. Small extra forms (e.g. "Add vendor") open inline.
- **Compact, professional layout.** Short one-line page header, small padding, short table rows (about 28 px),
  one-line column headings, tinted header row, light grid lines, light stripe on every other row and a soft
  hover colour. Number columns right-aligned with even (tabular) digits; text left; short codes and dates centred.
- **Fit the screen.** Wide tables use fixed column shares that add up to 100 %, so there is no sideways scroll on a
  normal laptop screen (1280 px and up); below that the table scrolls.
- **Master / List pattern.** Each part has a *Master* page (add / edit form) and a *List* page (search + table).
  After saving a new record the form clears for the next one; after saving an edit it goes back to the list.
- **Item tables are editable grids** with a "Sum of Total" footer. On **Sales** and **Stock Adjustment** there is
  **always one empty row at the bottom** ("Search item…"); picking an item in it adds the next empty row by itself,
  and filled rows have a delete (bin) button. **Purchase / Order** keeps a **+** button on each row (adds a row under
  it with the cursor in its Item Name) next to the bin.
- **Input boxes inside grids** look like plain text until hovered or focused (then a border and a focus ring).
- **Keyboard:** in every editable table ← / → move to the previous / next box (inside a text box the cursor moves
  through the text first) and also reach the row's + / bin buttons (Enter / Space presses them); ↑ / ↓ move to the
  same column in the row above / below. Number boxes never step their value on ↑ / ↓ or the mouse wheel. Arriving in a
  number box selects its value. A drop-down may keep ↑ / ↓ for itself (see Sales).
- **Searchable pickers:** Item Name and Vendor Name are type-to-search boxes that open the full list on click
  (A–Z, first 50) and narrow as you type — **names starting with the typed text come first**, then names containing
  it; ↑ / ↓ / Enter / Esc work.
- **Show / hide column groups with an arrow.** Where a table has more columns than fit, some are grouped behind a
  small round **›** button in a heading; clicking it shows the group (tinted in its own colour: sky, amber, emerald)
  and **‹** hides it again. The table keeps fitting the screen in every combination.
- **Months as MM/YY.** Mf.Date / Exp.Date are typed as digits only (`0228` → `02/28`); saved as the first (Mf) /
  last (Exp) day of the month.
- **Validation on screen and again on the server** (the server never trusts the screen's sums; a bad save is
  refused with a clear message and nothing is saved).
- **Stock is worked out from the documents** (received − returned − sold, per batch; see *How stock is worked out*
  under Database Details). Opening stock and corrections are entered on **Stock Adjustment**. Stock-changing saves
  are serialised (SQL `sp_getapplock`) so two bills can't take the last units.
- **Delete is a soft delete** (`IsActive = 0`), Admin only, and everything reads only active rows.

## Menu

```
Pharmacy
  Item             → Master · List · Bulk Update
  Vendor           → Master · List · Payments
  Purchase / Order → Master · List
  Stock In         → Master · List · Adjustment · Adjustment List
  Return           → Master · List · Sales Return · Sales Return List
  Sales            → Master · List
  Report           → Stock Report · Vendor Payments · All in One
```

Top menu bar: each group opens a drop-down **top to bottom** (short slide-down animation) under its own button.
Groups with sub-parts show them as **cards side by side** (heading with icon in a tinted square, Master / List
under each) with a **search box** at the top (Enter opens the first match, Esc clears then closes). The drop-down
**fits the screen**: as wide as its cards need, never wider than the screen (cards wrap into more rows), kept 8 px
inside both edges, never taller than the screen below the menu bar (it scrolls inside), and it re-fits when the
window is resized. On phones the menu is a collapsible list.

## 1. Item

**Item → Master** (add / edit). Two rows on wide screens:
- Row 1: Item Name\*, **Pack, Type / Unit, HSN Code** (in this order), MRP, CGST %, SGST %, Rack, Box. On Edit a
  read-only **Stock** box shows the current stock.
- Row 2: Generic Name, Manufacturer, Category, Potency, Schedule (None / H / H1), Status (Active / Inactive).
- **Type / Unit** holds the number of pieces in one pack (e.g. `15` = 15 tablets a strip); it is used for unit-wise
  prices and for selling single units. Type / Unit, Generic Name, Manufacturer, Category, Potency are pick-lists with
  **+ New / Edit / Delete** at the bottom of the list (delete only hides a value; renaming does not change saved items).
- **No quantity here.** Stock comes only from Stock In, Returns, Sales and Stock Adjustment (opening stock is an
  Adjust In).
- Item Code is automatic (`ITM000001`). Selling price = MRP when saved here (Stock In sets it later).
- GST % = CGST % + SGST % (max 28).

**Item → List**: Item Code, Item Name, Category, Unit, Price, Stock (red when at/below re-order level), Status,
Edit. Search + category filter.

**Item → Bulk Update**: the item list as an editable grid (50 per page, search, category filter). Editable:
Category, Potency, Pack, HSN Code, Manufacturer, MRP, CGST %, SGST %, Rack, Box, Status. Item Code and Item Name stay
pinned on the left. Changed cells turn amber and are kept across pages; "N item(s) changed – not saved yet" with
**Save N item(s)** / **Discard changes**. One request saves all; if any row is wrong nothing is saved and the wrong
rows turn red with the reason. A lower MRP also brings the selling price down to it.

## 2. Vendor

**Vendor → Master** (full screen):
- Row 1: Vendor name\*, Contact person, Address\* (text area), Email.
- Row 2: State (Indian states and union territories), Pin code (6 digits), Phone No, Mobile No\*, GSTIN (15
  characters, capitals), DL No 1, DL No 2 (capitals).
- Row 3: Status. Address and Mobile No are required on the screen and on the server.

**Vendor → List**: Vendor name, Contact person, Mobile No, State, GSTIN, Status, Edit; "+ New vendor".

## 3. Purchase / Order

An order placed with a vendor. **It does not change stock.**

**Master** – top row: Vendor Name\* (searchable; last row **+ Add vendor** opens a small inline form: name, address,
mobile – all required), a **›** button to show **Details** (vendor address, State – Pin, phones, email, GSTIN, DL
numbers; hidden until clicked), Date\* (today).

Item table (fits the screen, no sideways scroll):
`# | Item Name › | Category | Pack | Unit | MRP | Old Price | P.Rate | Free | Disc% | Qty | Amount | GST% | CGST% | SGST% | GST Amt | Total | + / bin`
- Category, Pack, Unit come from Item Master. Picking an item fills them, MRP and CGST / SGST.
- **Item Name ›** swaps the GST% / CGST% / SGST% / GST Amt columns for **Generic Name / Manufacturer / HSN**
  (amber); **‹** swaps back.
- **Old Price** = this vendor's last net rate for the item (its P.Rate less Disc %), or 0 if never ordered from them.
- **P.Rate** is the purchase rate; **Free** = free units (received with the rest, not charged).
- **GST %** is editable and splits itself evenly into CGST % and SGST % (CGST / SGST also editable; GST % = their sum).
- Validation: **P.Rate ≤ MRP** (screen and server).

Formulas (same code on screen and server):
- Rate = P.Rate − (P.Rate × Disc % / 100)
- Amount = Qty × Rate (Free units are not charged)
- GST % = CGST % + SGST %; GST Amount = Amount / 100 × GST %
- Total = Amount + GST Amount; Sum of Total = Σ Total

**Bulk add items** (inline panel above the table): search, Category and Manufacturer filters, a ticked list
(Select all; items already in the table shown ticked and greyed); **Add N item(s)** adds them and removes empty rows.

Item details are copied into the order lines. Number: `SC-PO0001`. Once a Stock In exists for an order, the order
can no longer be edited.

**List**: Order No, Date, Vendor, Items, Sum of Total, Edit (Admin also sees **Delete**; the server refuses a
delete once a Stock In uses the order).

## 4. Stock In

Goods received against a purchase order. **Adds stock and sets the selling price.**

**Master** – top row: Vendor Name\* (searchable), Purchase No\* (drop-down of that vendor's orders
"SC-PO0001 · date · ₹total" — **orders already fully received are left out**; disabled until a vendor is chosen),
Date\*, **Bill No** (the vendor's own bill / invoice number, optional, max 50; also searchable on the List).

Choosing the order lists its items. Columns shown by default:
`☐ | Item Name | Pack | Unit | MRP | Amount › | GST Amt › | Total | Ordered | Free | Received | R.Order | R.Free | Batch No | Mf.Date | Exp.Date | S.Disc% | Sel.Amount ›`
- **Amount ›** shows **P.Rate | Disc%** (the order's, sky tint); **GST Amt ›** shows **GST% | CGST% | SGST%**
  (amber); **Sel.Amount ›** adds **Unit Price** (emerald). Each opens and closes on its own.
- **Ordered / Free** = what the order asked for (paid / free units); "earlier: N" under a box shows what earlier
  Stock Ins already received.
- **Received** = total arriving now; it starts at what is still due. Typing it splits into **R.Order** (paid) first,
  then **R.Free** (free); typing R.Order / R.Free shows their sum in Received. Rows with nothing received are skipped.
  Can't receive more than is still due.
- Amount = R.Order × the order's rate; GST and Total from the order's CGST / SGST — only R.Order is charged.
- **Mf.Date / Exp.Date as MM/YY.** Exp can't be a past month; Mf can't be a future month; Exp must be after Mf.
- **Sel.Amount = MRP less S.Disc %** (the selling discount), e.g. MRP 32.12, S.Disc 5 % → 30.51.
- **Unit Price = Sel.Amount ÷ the units in the pack** (Item Master Type / Unit, e.g. 30.51 ÷ 15 = 2.03).
- **Bulk fill:** tick rows (header box ticks all) → "Fill the ticked rows" bar with Batch No, Mf.Date, Exp.Date,
  Discount % and **Apply to N row(s)** – only the boxes filled are applied.

On save: stock goes up by R.Order + R.Free; each item's **selling price = its Sel.Amount**. Number: `SC-SI0001`.
**Only an Admin may edit or delete** a saved Stock In; it can't be edited or deleted once a Return or a Sale uses its
batches (it then opens read-only with the reason shown).

**List** – two tabs, plus a totals bar above and a dark **Total** row at the bottom (search: item, batch,
Stock In No, vendor):
- **Item wise**: one heading row per item (click to show / hide its batches) with batch count and totals; batch rows
  show Batch No, Exp, Stock In No (date on hover), Vendor, Quantity ("incl. N free"), the amounts, and (Admin only)
  **Edit / Delete**.
- **Date wise**: one heading row per date; each Stock In's rows grouped as one block with its Stock In No + vendor +
  order no, and (Admin only) one **Edit / Delete** in merged cells.
- Amounts per row, each with its single-quantity amount under it in small grey text ("₹24.25 / 1"):
  Buy Amount = paid Qty × Rate; Sale Amount = Qty × MRP; Discount Amount = S.Disc % of Sale Amount;
  Net Sale Amount = Qty × Sel.Amount (Qty includes free units).

## 5. Return

Goods sent back to the vendor from one Stock In. **Reduces stock.**

**Master** – top row: Vendor Name\*, Stock In No\* ("SC-SI0001 · date · PO no"), Date\*.
Table: Item Name | Batch No | Mf.Date | Exp.Date | Cur.Rate | Received | Returned (earlier) | **Return Qty** |
Amount (= Qty × Cur.Rate), Sum of Total. Return Qty can't exceed Received − Returned (a line with nothing left is
disabled); stock can't go below zero. Edits apply the difference. Number: `SC-RT0001`.

**List**: Return No, Date, Vendor, Stock In No, Item Name (all items, comma-separated), Items, Total Qty, Amount,
Edit; search also by item name.

## 6. Sales (counter sale)

**Master** – first row: Date\*, Customer Name\*, Mobile No.

Table (compact, fits the screen):
`# | Item Name | Batch | Sell by | Rack | Box | Stock | MRP | Purchase Price | Sale Price | Quantity | Disc% | Amount | bin`
- **Batch** lists only the item's batches with stock left, **earliest expiry first** ("12345 · Exp 02/28 · 8"); the
  first is chosen automatically. Batch stock = received − returned − sold.
- **Sell by**: **Pack (15)** or **Unit** (one piece; only when the item's Type / Unit count is more than 1). Stock,
  MRP, Purchase Price and Sale Price are shown per pack or per unit to match; stock is counted in packs, so 5 units of
  a 15's pack take 0.3333 pack.
- **MRP** and **Purchase Price** (P.Rate less Disc %) come from the batch's own Stock In (the item's for older
  batches); Rack / Box from the item (small blue tags).
- **Sale Price** = the batch's Sel.Amount (editable, not above the batch's MRP).
- **Disc%** per row: **Amount = Quantity × Sale Price less Disc %**.
- Footer: **Sub Total** (Σ Amount), **Bill Discount %** box with the amount taken off, **TOTAL** = Sub Total less
  Bill Discount.
- **Checks** (screen and server):
  - Quantity ≤ batch stock — "Only N in stock" (lines selling from the same batch count together).
  - Sale Price ≤ MRP; Disc % and Bill Discount % 0 – 100.
  - **No selling below cost:** each row's Amount ≥ Quantity × Purchase Price ("Below cost …"), and the bill's
    TOTAL ≥ the sum of the rows' purchase cost ("Total is below the purchase cost … — lower the Bill Discount").
  - Any red box disables Save.
- **Quick billing keyboard:** pick the item (type + Enter) → the cursor goes to **Batch** → Enter → **Sell by** →
  Enter → **Quantity** → Enter → **Disc%** → Enter → the empty row's Item Name. On Batch and
  Sell by, **↑ / ↓ change the choice** (prices and stock update); ← → still reach Sale Price and the buttons. A short
  hint under the table says this. Goal: 5 – 7 items billed in a few seconds.
- **Speed:** each item's batch list is fetched once per bill and reused (cleared after a save); the database has
  indexes on the item column of every received / returned / sold line table.
- **Save** and **Save & Print** (Update & Print when editing): Save & Print saves, then opens the print dialog with
  the receipt; after an edit it returns to the list when printing is done. After a plain Save a bar offers **Print**.
- **Receipt:** clinic name / contact / address, bill no, customer, date, then Item ("(unit)" for unit sales),
  Batch, Qty, Rate, Disc% (only when used), Amount; Sub Total and Discount (N %) rows only when a bill discount was
  given; Total.
- Number: `SC-S0001`.

**List**: Sale No, Date, Customer, Mobile, Item Name, Total Qty, Amount, Edit, Print (reprints the receipt);
total of all sales in the subtitle.

## 7. Sales Return

Goods a customer brings back from **one sale**. **Adds the stock back** to the batch it was sold from.

**Master** – top row: **Find sale by** (two tabs: *Sales Date* / *Customer*), then **Sales Date\*** (not in the future)
or **Customer\*** (searchable by name or mobile), **Sale No\*** (drop-down "SC-S0001 · date · customer · mobile ·
₹total", "No sales found" when empty), **Return Date\*** (not before the sale's date). When editing, the sale can't
be changed.

Table (one row per line of the sale):
`Item Name | Batch No | Exp.Date | Unit | Sale Price | Disc % | Sold | Returned | Return Qty | Amount`
- Everything except **Return Qty** is read-only, copied from the sale line (Unit = pack / unit as sold).
- **Returned** = what earlier Sales Returns already took back. Return Qty can't exceed **Sold − Returned** (the box
  shows "max N"; a line with nothing left is disabled). Leave it empty to not return that line.
- **Amount** = Return Qty × Sale Price less the line's Disc %.
- Footer: **Sub Total**, **Bill Discount N %** (only when the sale had one – the same % comes off) and **Refund
  Amount**. The refund keeps the sale's row and bill discounts.
- Save needs at least one Return Qty. Number: `SC-SR0001`.

**Sales Return List**: Return No, Date, Customer, Mobile, Sale No, Item Name (all, comma-separated), Total Qty,
Refund, Edit (Admin also **Delete** – a soft delete that takes the returned quantity off stock again, after a
confirm). Search by return no, sale no, customer, mobile or item; the subtitle shows the count and total refund.

## 8. Stock Adjustment (Stock In → Adjustment)

Corrects a batch's stock, and is **where opening stock is entered**. Adjust In adds, Adjust Out takes away.

**Master** – top row: **Date\*** (today; no future date) and **Remarks** (e.g. "Physical count, damaged strips").

Table (always one empty "Search item…" row at the bottom):
`# | Item Name | Batch | Cur Stock | MRP | Adjust In | Price | Adjust Out | Price | bin`
- Picking an item loads its batches; the **first batch with stock (earliest expiry)** is chosen. **Batch** is a box
  with a suggestion list ("Stock N" beside each); typing a batch number not seen before starts a **New batch**
  (shown in green under the box).
- **Cur Stock** = the batch's stock now. **MRP** (per pack) and both **Price** boxes are filled from the batch's
  Stock In (else the item's purchase price / MRP) and can be changed.
- Adjust In columns are tinted green, Adjust Out red. A row has **either Adjust In or Adjust Out** – typing one
  disables the other.
- Checks (screen and server): no negatives; In Price ≤ MRP; Adjust Out ≤ Cur Stock (rows on the same batch count
  together); no batch may go below zero; every filled row needs an In or Out quantity. A wrong row shows its reason
  in red under the item.
- Footer: **Total value – In ₹ (Σ In Qty × Price) – Out ₹ (Σ Out Qty × Price)**.
- Number: `SC-ADJ0001`. Editing leaves its own quantities out when checking stock.

**Adjustment List**: Adj No, Date, Item Name, Remarks, In Qty, In Value, Out Qty, Out Value, Edit (Admin also
**Delete** – soft delete that undoes the stock change). Search by adjustment no, remarks or item.

## 9. Vendor Payments (Vendor → Payments)

Pay a vendor against one **invoice = a Stock In** (its number is the Stock In No).

**Top row:** **Vendor Name** (searchable; empty = all vendors), **Invoice No\*** (searchable list of unpaid
invoices, newest first, shown as "SC-SI0001 + <Bill No>" when the Stock In has a Bill No – search by either),
**Show paid invoices** tick box, **Clear**. Until an invoice is picked a dashed box says
"Pick an Invoice No… N unpaid invoices".

After picking an invoice:
- A strip: Invoice No, Bill No, Date, Vendor, Purchase No, Returns (their numbers), and a tag **Unpaid / Part paid / Paid**.
- Items table: `# | Item Name | Batch | Exp | Qty | Free | MRP | Rate | Amount | GST% | GST Amt | Total`, Total row.
  Amount = paid Qty × Rate (free units aren't charged); GST from the order line's CGST + SGST %.
- **Summary box** (right): Invoice Total, Less Returns (red), Paid (green), **Balance** (amber while owed, green when
  paid). Returns credit the returned units at the line's rate spread over paid + free units.
- **Payment** form (only while Balance > 0): **Date\***, **Amount\*** (more than 0, not more than the Balance – the
  server checks again), **Payment Mode\*** (Cash, UPI, Bank Transfer, Cheque, Card), **Reference No**
  (*Cheque No* for a cheque; "UTR / Txn ID" hint for UPI / bank; **required for every mode except Cash**), **Notes**,
  **Pay** button.
- **Payments made** table under it: Payment No, Date, Mode, Reference No, Notes, By, Amount; Admin sees a bin to
  delete one (soft delete). Number: `SC-VP0001`.

## 10. Reports

**Stock Report** (item-wise): Item Code | Item Name | Category | Pack | Opening | Stock In | Return | Sold |
Adjustment | **Current Stock** | Sell Price | Stock Value, Total row.
- Opening + Stock In − Return − Sold + Adjustment = Current Stock; Stock Value = Current Stock × selling price.
- Filters: search (name, code, generic), category, Show: items with stock history (default) / in stock only /
  out of stock / all items. Stock In green, Return / Sold red, Current Stock shaded, out-of-stock rows grey.
- Click an item → its stock history opens under the row: Date & Time, Type (coloured tag), Details, Vendor,
  Change (+/−), Stock after, By.

**Vendor Payments**: per vendor (name · mobile): Stock In count | Amount | GST | **Stock In Total** | Return count |
**Return Total** | **Net Payable**, Total row; From / To date filter (empty = all time).
- Stock In Amount = **paid units only** × Rate (free units aren't charged); GST from the order line's CGST + SGST %;
  Return uses the GST % of the Stock In line it came from; Net Payable = Stock In Total − Return Total.
- Click a vendor → its Stock Ins and Returns under the row (returns shown as −); clicking a line opens it.

**All in One**: one report screen for every Pharmacy screen.
- **Screen Name** (Item, Vendor, Purchase / Order, Stock In, Return (to Vendor), Sales, Sales Return, Stock
  Adjustment, Vendor Payment), then **Column Name** – a multi-select of that screen's columns with **Select all /
  Clear**. Changing the screen clears the columns and the report.
- **From / To** dates appear only for screens with a date (blank = all dates).
- **Value filters:** each picked drop-down-type column gets its own multi-select of its values, labelled "… (filter)";
  empty = all values. Fixed lists always show every option (Schedule: None / H / H1; Status: Active / Inactive);
  the others list the values saved; a blank value shows as **(Blank)**. Filter columns: Item – Generic Name,
  Manufacturer, Category, Potency, Type / Unit, Schedule, Status; Vendor – State, Status; Purchase / Order – Vendor,
  Created By, Manufacturer, Category, Unit; Stock In / Return – Vendor, Created By; Sales / Sales Return – Created
  By, Sale Unit; Stock Adjustment – Created By; Vendor Payment – Vendor, Pay Mode, Created By.
- The report shows **only after "Show Report"**: title, the active filters, date range, row count and print time;
  then a table (# column first; columns in the screen's own order) and a **Total** row for quantities and amounts.
- Picking any **item-line column** (Item Name, Batch, Quantity…) gives one row per item line; otherwise one row per
  document. A document's own amounts are not added up in the Total when listing by line (they repeat on each line).
- **Print** (shown with the report) prints only the report, landscape, without menus or filters.
- Layout: one 4-column grid – Screen Name | Column Name (2 columns) | Show Report, then From, To and the filters in
  the next rows, every label row the same height and every box 42 px high, so everything lines up.
- Server: each screen's columns are a fixed list of SQL expressions (the API refuses any other column or filter);
  filter values are sent as parameters; deleted documents are left out.

## Database Details (Microsoft SQL Server, as built – 05-11-2026)

Use these exact tables to build a **Pharmacy-only** app, or to move this clinic's data into one. The setup script
must be **safe to run again**: create a table / add a column only when it is missing
(`IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='X' AND xtype='U') CREATE TABLE …` and
`IF COL_LENGTH('X','Col') IS NULL ALTER TABLE X ADD …`).

### Rules that apply to every table

- **Ids:** every table has an `INT IDENTITY(1,1)` primary key. Lines point to their header and to `PharmacyItem`
  with foreign keys.
- **Soft delete:** headers have `IsActive BIT NOT NULL DEFAULT 1`. Delete sets `IsActive = 0`; **every query
  (lists, stock, reports) reads only `IsActive = 1` rows**. Lines have no `IsActive`: they follow their header.
  Only an **Admin** may delete (checked on the server).
- **Audit:** `CreatedBy` (the user name) and `CreatedAt DATETIME DEFAULT GETDATE()` on headers; `EditedAt` on items.
- **Money:** `DECIMAL(10,2)` for prices / rates, `DECIMAL(12,2)` for amounts and totals, `DECIMAL(5,2)` for %.
  Every amount is rounded to paise at each step.
- **Stock quantities are in packs.** Sales lines keep `DECIMAL(12,4)` so a Unit sale (e.g. 5 tablets of a 15's
  strip = 0.3333 pack) is exact.
- **Stock is never stored.** There is no "stock" column anywhere. It is worked out from the documents each time
  (see *How stock is worked out*). Saving a document is what changes stock.
- **Locking:** every stock-changing save runs in a transaction that first takes
  `EXEC sp_getapplock @Resource = 'pharmacy-stock', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000`,
  then re-checks stock, so two bills can't sell the last units.
- **Document numbers are not stored.** They are built from the id: `<CLINIC CODE>-<PREFIX><id, 4 digits>`
  (`SC-S0001`; past 9999 it just gets longer). The clinic code comes from one setting (`CLINIC_CODE`, default `SC`).

| Document | Prefix | Example | Built from |
|---|---|---|---|
| Item | `ITM` + 6 digits (no clinic code) | `ITM000123` | `PharmacyItem.ItemId` |
| Purchase / Order | `PO` | `SC-PO0001` | `PurchaseOrder.PurchaseOrderId` |
| Stock In | `SI` | `SC-SI0001` | `StockIn.StockInId` |
| Return (to vendor) | `RT` | `SC-RT0001` | `StockReturn.StockReturnId` |
| Sale | `S` | `SC-S0001` | `SalesBilling.SalesBillingId` |
| Sales Return | `SR` | `SC-SR0001` | `SalesReturn.SalesReturnId` |
| Stock Adjustment | `ADJ` | `SC-ADJ0001` | `StockAdjustment.AdjustmentId` |
| Vendor Payment | `VP` | `SC-VP0001` | `VendorPayment.PaymentId` |

### How the tables connect

| From (child) | Column | To (parent) |
|---|---|---|
| `PharmacyItem` | `UnitId` / `GenericNameId` / `ManufacturerId` | `UnitMaster` / `GenericNameMaster` / `ManufacturerMaster` |
| `PurchaseOrder` | `VendorId` | `Vendor` |
| `PurchaseOrderItem` | `PurchaseOrderId`, `ItemId` | `PurchaseOrder`, `PharmacyItem` |
| `StockIn` | `VendorId`, `PurchaseOrderId` | `Vendor`, `PurchaseOrder` |
| `StockInItem` | `StockInId`, `PoLineId`, `ItemId` | `StockIn`, `PurchaseOrderItem.LineId`, `PharmacyItem` |
| `StockReturn` | `VendorId`, `StockInId` | `Vendor`, `StockIn` |
| `StockReturnItem` | `StockReturnId`, `StockInLineId`, `ItemId` | `StockReturn`, `StockInItem.LineId`, `PharmacyItem` |
| `VendorPayment` | `VendorId`, `StockInId` | `Vendor`, `StockIn` |
| `SalesBillingItem` | `SalesBillingId`, `ItemId` | `SalesBilling`, `PharmacyItem` |
| `SalesReturn` | `SalesBillingId` (no FK, may be NULL) | `SalesBilling` |
| `SalesReturnItem` | `SalesReturnId`, `ItemId`, `SalesLineId` (no FK) | `SalesReturn`, `PharmacyItem`, `SalesBillingItem.LineId` |
| `StockAdjustmentItem` | `AdjustmentId`, `ItemId` | `StockAdjustment`, `PharmacyItem` |
| `MenuAccess` | `UserId` | `AppUser` |

`Category` and `Potency` on the item are text copied from `CategoryMaster` / `PotencyMaster` (no FK).

### Pick-lists (masters)

All five have the same shape; delete only hides a value (`IsActive = 0`), and renaming doesn't change items already
saved with a text copy.

| Table | Columns |
|---|---|
| `UnitMaster` | `UnitId` PK · `Name NVARCHAR(50)` · `IsActive` · `CreatedAt` |
| `GenericNameMaster` | `GenericNameId` PK · `Name NVARCHAR(200)` · `IsActive` · `CreatedAt` |
| `ManufacturerMaster` | `ManufacturerId` PK · `Name NVARCHAR(200)` · `IsActive` · `CreatedAt` |
| `CategoryMaster` | `CategoryId` PK · `Name NVARCHAR(100)` · `SortOrder INT DEFAULT 0` · `IsActive` · `CreatedAt` |
| `PotencyMaster` | `PotencyId` PK · `Name NVARCHAR(50)` · `SortOrder INT DEFAULT 0` · `IsActive` · `CreatedAt` |

`SortOrder`: values with a number come first in that order, then the rest A–Z (0 = no order).
Type / Unit holds the **number of pieces in a pack** (e.g. `15`).

### `PharmacyItem` – Item Master

| Column | Type | Notes |
|---|---|---|
| `ItemId` | INT IDENTITY PK | Item Code = `ITM` + 6 digits |
| `Name` | NVARCHAR(200) NOT NULL | Item Name |
| `UnitId` | INT NULL → `UnitMaster` | Type / Unit (pieces per pack) |
| `GenericNameId` | INT NULL → `GenericNameMaster` | |
| `ManufacturerId` | INT NULL → `ManufacturerMaster` | |
| `Category` | NVARCHAR(100) NULL | text from `CategoryMaster` |
| `Potency` | NVARCHAR(50) NULL | text from `PotencyMaster` |
| `Pack` | NVARCHAR(50) NULL | e.g. `10's`, `1x15`, `200ML` |
| `HSNCode` | NVARCHAR(30) NULL | |
| `Rack`, `BoxNo` | NVARCHAR(50) NULL | shown as tags on Sales |
| `MRP` | DECIMAL(10,2) NULL | per pack |
| `SellPrice` | DECIMAL(10,2) NULL | = MRP when the item is added; each Stock In sets it to the line's Sel.Amount; a lower MRP brings it down |
| `PurchaseRate` | DECIMAL(10,2) NULL | fallback purchase price for batches with no Stock In |
| `CGSTPercent`, `SGSTPercent` | DECIMAL(5,2) NULL | |
| `GSTPercent` | DECIMAL(5,2) NULL | = CGST + SGST (max 28) |
| `ScheduleH`, `ScheduleH1` | BIT NOT NULL DEFAULT 0 | Schedule None / H / H1 |
| `Status` | NVARCHAR(10) NOT NULL DEFAULT 'Active' | Active / Inactive (Inactive = hidden from pickers) |
| `IsActive` | BIT NOT NULL DEFAULT 1 | soft delete (only an item no document uses and with no stock) |
| `CreatedAt`, `EditedAt` | DATETIME | |

*Old columns still in this clinic's table but **not needed in a new build**: `Unit`, `ItemType`, `ItemTypeId`,
`Manufacturer`, `GenericName`, `TabletName`, `SupplierId`, `DiscountPercent` (replaced by the master ids above).*

### `Vendor`

| Column | Type | Notes |
|---|---|---|
| `VendorId` | INT IDENTITY PK | |
| `VendorName` | NVARCHAR(200) NOT NULL | |
| `CompanyName` | NVARCHAR(200) NULL | |
| `ContactPerson` | NVARCHAR(150) NULL | |
| `ContactNo` | NVARCHAR(20) NULL | Mobile No (required on the screen) |
| `AlternateNo` | NVARCHAR(20) NULL | Phone No |
| `Address` | NVARCHAR(500) NULL | required on the screen |
| `State` | NVARCHAR(60) NULL | Indian state / UT |
| `Pincode` | NVARCHAR(6) NULL | 6 digits |
| `Email` | NVARCHAR(150) NULL | |
| `GSTNo` | NVARCHAR(30) NULL | GSTIN, 15 characters, capitals |
| `DLNo`, `DLNo2` | NVARCHAR(50) NULL | drug licence numbers |
| `Status` | NVARCHAR(10) NOT NULL DEFAULT 'Active' | |
| `IsActive`, `CreatedAt` | | |

### `PurchaseOrder` / `PurchaseOrderItem` – Purchase / Order (no stock change)

`PurchaseOrder`: `PurchaseOrderId` PK · `OrderDate DATE NOT NULL` · `VendorId` → `Vendor` · `VendorDetails
NVARCHAR(1000)` (vendor details as printed) · `TotalAmount DECIMAL(12,2)` (Σ line Total + Round Off) ·
`RoundOff DECIMAL(10,2) DEFAULT 0` · `CreatedBy` · `IsActive` · `CreatedAt`.

`PurchaseOrderItem` (item details are **copied** so the order shows them as they were):

| Column | Type | Notes |
|---|---|---|
| `LineId` | INT IDENTITY PK | |
| `PurchaseOrderId` | → `PurchaseOrder` | |
| `ItemId` | → `PharmacyItem` | |
| `ItemName` | NVARCHAR(200) NOT NULL | copied |
| `GenericName`, `Manufacturer` | NVARCHAR(200) NULL | copied |
| `HSNCode` (30), `Category` (100), `Pack` (50), `Unit` (50) | NVARCHAR NULL | copied |
| `MRP` | DECIMAL(10,2) NOT NULL | |
| `PRate` | DECIMAL(10,2) NULL | purchase rate (≤ MRP) |
| `DiscPercent` | DECIMAL(5,2) DEFAULT 0 | |
| `Rate` | DECIMAL(10,2) NOT NULL | = PRate − PRate × Disc% / 100 |
| `Quantity` | DECIMAL(10,2) NOT NULL | paid units |
| `FreeQty` | DECIMAL(10,2) DEFAULT 0 | free units (not charged) |
| `Amount` | DECIMAL(12,2) NOT NULL | = Quantity × Rate |
| `CGSTPercent`, `SGSTPercent`, `GSTPercent` | DECIMAL(5,2) DEFAULT 0 | GST = CGST + SGST |
| `GSTAmount` | DECIMAL(12,2) DEFAULT 0 | = Amount / 100 × GST% |
| `Total` | DECIMAL(12,2) NOT NULL | = Amount + GSTAmount |

An order can't be edited or deleted once a Stock In uses it.

### `StockIn` / `StockInItem` – Stock In (adds stock, sets selling price)

`StockIn`: `StockInId` PK · `InDate DATE NOT NULL` · `BillNo NVARCHAR(50) NULL` (vendor's bill no) · `VendorId` → `Vendor` · `PurchaseOrderId` → `PurchaseOrder` ·
`CreatedBy` · `IsActive` · `CreatedAt`.

| `StockInItem` column | Type | Notes |
|---|---|---|
| `LineId` | INT IDENTITY PK | |
| `StockInId` | → `StockIn` | |
| `PoLineId` | → `PurchaseOrderItem.LineId` | the order line received |
| `ItemId` | → `PharmacyItem` | |
| `BatchNo` | NVARCHAR(50) NOT NULL | |
| `MfgDate` | DATE NULL | first day of the MM/YY month |
| `ExpDate` | DATE NOT NULL | last day of the MM/YY month |
| `Quantity` | DECIMAL(10,2) NOT NULL | R.Order – paid units received |
| `FreeQty` | DECIMAL(10,2) DEFAULT 0 | R.Free – free units received |
| `Rate` | DECIMAL(10,2) NOT NULL | the order line's Rate (P.Rate less Disc%) |
| `MRP` | DECIMAL(10,2) NOT NULL | per pack |
| `DiscPercent` | DECIMAL(5,2) DEFAULT 0 | S.Disc% – selling discount |
| `SelAmount` | DECIMAL(10,2) NOT NULL | = MRP − MRP × S.Disc% / 100; becomes the item's `SellPrice` |
| `SalesPercent` | DECIMAL(6,2) DEFAULT 0 | not used any more (saved as 0) |

Index: `IX_StockInItem_ItemId (ItemId) INCLUDE (StockInId, BatchNo, ExpDate, Quantity, FreeQty)`.
Received can't exceed what the order line still has due. A Stock In can't be edited / deleted once a Return or Sale
used its batches; only an Admin may edit or delete one.

### `StockReturn` / `StockReturnItem` – Return to vendor (reduces stock)

`StockReturn`: `StockReturnId` PK · `ReturnDate DATE` · `VendorId` → `Vendor` · `StockInId` → `StockIn` ·
`TotalAmount DECIMAL(12,2)` · `CreatedBy` · `IsActive` · `CreatedAt`.

`StockReturnItem`: `LineId` PK · `StockReturnId` → `StockReturn` · `StockInLineId` → `StockInItem.LineId` ·
`ItemId` → `PharmacyItem` · `BatchNo NVARCHAR(50)` · `MfgDate`, `ExpDate DATE` (copied) · `Rate DECIMAL(10,2)`
(Cur.Rate) · `Quantity DECIMAL(10,2)` · `Amount DECIMAL(12,2)` (= Quantity × Rate).
Index: `IX_StockReturnItem_ItemId (ItemId) INCLUDE (StockReturnId, BatchNo, Quantity)`.
A line returns at most what its Stock In line received less earlier returns; no batch may go below zero.

### `SalesBilling` / `SalesBillingItem` – Sales (reduces stock)

| `SalesBilling` column | Type | Notes |
|---|---|---|
| `SalesBillingId` | INT IDENTITY PK | Bill No `SC-S0001` |
| `TransDate` | DATE NOT NULL | |
| `CustomerName` | NVARCHAR(200) | required on the screen |
| `MobileNo` | NVARCHAR(20) NULL | |
| `SubTotal` | DECIMAL(12,2) | Σ line Amount |
| `DiscPercent` | DECIMAL(5,2) DEFAULT 0 | Bill Discount % |
| `DiscountAmount` | DECIMAL(12,2) DEFAULT 0 | = SubTotal × DiscPercent / 100 |
| `RoundOff` | DECIMAL(10,2) DEFAULT 0 | to the nearest rupee (24.25 → −0.25) |
| `TotalAmount` | DECIMAL(12,2) | = SubTotal − DiscountAmount + RoundOff (Net Amount) |
| `CreatedBy`, `IsActive`, `CreatedAt` | | |

| `SalesBillingItem` column | Type | Notes |
|---|---|---|
| `LineId` | INT IDENTITY PK | |
| `SalesBillingId` | → `SalesBilling` | |
| `ItemId` | → `PharmacyItem` | |
| `Batch` | NVARCHAR(100) NULL | batch sold from ('' = no batch) |
| `ExpiryDate` | DATE NULL | copied from the batch |
| `SaleUnit` | NVARCHAR(10) | `pack` or `unit` |
| `UnitQty` | DECIMAL(10,2) | quantity as typed (packs or units) |
| `PackSize` | INT | pieces per pack at the time of sale |
| `Quantity` | DECIMAL(12,4) NOT NULL | **in packs** = UnitQty, or UnitQty / PackSize for a unit sale |
| `Rate` | DECIMAL(10,2) NOT NULL | Sale Price per pack or per unit (≤ MRP) |
| `DiscPercent` | DECIMAL(5,2) DEFAULT 0 | row discount |
| `Amount` | DECIMAL(12,2) NOT NULL | = UnitQty × Rate − Disc% |

Index: `IX_SalesBillingItem_ItemId (ItemId) INCLUDE (SalesBillingId, Batch, Quantity)`.
Checks: quantity ≤ batch stock; no row and no bill below purchase cost.

### `SalesReturn` / `SalesReturnItem` – goods a customer brings back (adds stock back)

`SalesReturn`: `SalesReturnId` PK · `TransDate DATE` · `SalesBillingId INT NULL` (the sale) · `CustomerName
NVARCHAR(200)` · `MobileNo NVARCHAR(20)` · `SubTotal DECIMAL(12,2)` · `DiscPercent DECIMAL(5,2)` ·
`DiscountAmount DECIMAL(12,2)` · `TotalAmount DECIMAL(12,2)` (refund) · `CreatedBy` · `IsActive` · `CreatedAt`.

`SalesReturnItem`: `LineId` PK · `SalesReturnId` → `SalesReturn` · `SalesLineId INT NULL` (the
`SalesBillingItem.LineId` returned) · `ItemId` → `PharmacyItem` · `Batch`, `ExpiryDate`, `SaleUnit`, `UnitQty`,
`PackSize` (as on the sale line) · `Quantity DECIMAL(12,4)` (in packs) · `Rate` · `DiscPercent` · `Amount`.
A line returns at most what it sold less earlier returns; the refund keeps the sale's row and bill discounts.

### `StockAdjustment` / `StockAdjustmentItem` – corrections and opening stock

`StockAdjustment`: `AdjustmentId` PK · `AdjDate DATE` (the screen allows no future date) · `Remarks NVARCHAR(300)` ·
`InTotal`, `OutTotal DECIMAL(12,2)` (Σ qty × price) · `CreatedBy` · `IsActive` · `CreatedAt`.

| `StockAdjustmentItem` column | Type | Notes |
|---|---|---|
| `LineId` | INT IDENTITY PK | |
| `AdjustmentId` | → `StockAdjustment` | |
| `ItemId` | → `PharmacyItem` | |
| `BatchNo` | NVARCHAR(100) NOT NULL DEFAULT '' | a batch number not seen before starts a new batch |
| `CurStock` | DECIMAL(12,4) DEFAULT 0 | the batch's stock when saved (for the record) |
| `InQty`, `InPrice` | DECIMAL(10,2) DEFAULT 0 | Adjust In (adds) and its price per pack (≤ MRP) |
| `OutQty`, `OutPrice` | DECIMAL(10,2) DEFAULT 0 | Adjust Out (takes away, ≤ batch stock) and its price |
| `MRP` | DECIMAL(10,2) NULL | per pack |

A line has **either** In or Out, not both. **Opening stock is entered here** (Adjust In) – Item Master has no
quantity.

### `VendorPayment` – paying a vendor

| Column | Type | Notes |
|---|---|---|
| `PaymentId` | INT IDENTITY PK | `SC-VP0001` |
| `VendorId` | → `Vendor` | |
| `StockInId` | → `StockIn` | the invoice paid (Stock In No) |
| `PayDate` | DATE NOT NULL | |
| `Amount` | DECIMAL(12,2) NOT NULL | ≤ the Stock In's balance |
| `PayMode` | NVARCHAR(20) NOT NULL | `Cash`, `UPI`, `Bank Transfer`, `Cheque`, `Card` |
| `ReferenceNo` | NVARCHAR(50) NULL | required for every mode except Cash |
| `Notes` | NVARCHAR(300) NULL | |
| `CreatedBy`, `IsActive`, `CreatedAt` | | |

Stock In Total = Σ (paid Quantity × Rate + the order line's GST); Return credit = returned units × the line's rate
spread over paid + free units; **Balance = Total − Returns − Paid**.

### `StockMovement` – old opening stock / edit-item changes (optional)

`MovementId` PK · `ItemId` → `PharmacyItem` · `QtyChange DECIMAL(10,2)` (+/−) · `Reason NVARCHAR(20)` (`opening` /
`adjustment`) · `RefType NVARCHAR(30)` · `RefId INT` · `VendorId INT` · `Note NVARCHAR(300)` · `CreatedBy` ·
`CreatedAt`. Nothing writes to it any more (Item Master lost its Quantity on 05-11-2026); the Stock Report still
reads it. **A new build can leave it out** and use Stock Adjustment for opening stock.

### Users, menu access and clinic details (needed by a standalone Pharmacy app)

- `AppUser`: `UserId` PK · `Username NVARCHAR(100) UNIQUE` · `PasswordHash NVARCHAR(256)` (Node `crypto.scrypt`,
  stored as `<saltHex>:<hashHex>`) · `Role NVARCHAR(20) DEFAULT 'Staff'` (`Admin` / `Staff`) · `IsActive` ·
  `CreatedAt`. (`LinkedPatientId` belongs to the clinic app – leave it out.) Login returns a JWT; the API reads the
  user name and role from it for `CreatedBy` and the Admin-only checks.
- `MenuAccess`: `AccessId` PK · `UserId` → `AppUser` · `MenuKey NVARCHAR(100)` · `AccessLevel NVARCHAR(20)`
  (`Full` / `View` / `No Access`) · unique (`UserId`, `MenuKey`). A user with no rows sees every menu; once any row is
  saved, only menus marked Full / View show. Pharmacy menu keys: `pharmacy.item`, `pharmacy.item-list`,
  `pharmacy.item-list-new`, `pharmacy.vendor-master`, `pharmacy.vendor-list`, `pharmacy.vendor-payment`,
  `pharmacy.purchase-master`, `pharmacy.purchase-master-list`, `pharmacy.stock-inward`, `pharmacy.stock-inward-list`,
  `pharmacy.stock-adjustment`, `pharmacy.stock-adjustment-list`, `pharmacy.purchase-return`,
  `pharmacy.purchase-return-list`, `pharmacy.sales-return`, `pharmacy.sales-return-list`, `pharmacy.sales-billing`,
  `pharmacy.sales-billing-list`, `pharmacy.stock-report`, `pharmacy.vendor-payments`, `pharmacy.all-in-one-report`.
- `ClinicDetails` (one row, `ClinicId = 1`): `Name`, `Address`, `ContactNo`, `Email`, `Logo NVARCHAR(MAX)` (image as a
  data URL), `AppName` – printed on the sales receipt and shown as the app name. The other columns are for
  prescriptions and can be left out.

### How stock is worked out

Stock is per **batch** = `ItemId` + `BatchNo` (`''` when there is none), in packs, counting only `IsActive = 1`
headers:

```
Received = StockInItem (Quantity + FreeQty)  +  StockAdjustmentItem.InQty
Returned = StockReturnItem.Quantity          +  StockAdjustmentItem.OutQty
Sold     = SalesBillingItem.Quantity         −  SalesReturnItem.Quantity
Batch stock = Received − Returned − Sold          (never below 0)
Item stock  = Σ batch stock  (+ Σ StockMovement.QtyChange, if kept)
```

- Sales lists only batches with stock left, **earliest expiry first** (no expiry last). A batch's MRP, purchase
  price (Rate) and Sel.Amount come from its latest Stock In line, else its latest Adjust In.
- When editing a sale (or an adjustment) its own quantities are left out of "Sold" (or "Received / Returned"), so the
  stock it already took is available to it again.
- The **Stock Report** history is the same documents as dated events: opening (StockMovement), purchase (Stock In),
  return, issue (sale), sales-return, adjustment – each with + / − quantity and the balance after.

### Leave these out of a new Pharmacy build

`Pharmacy`, `Supplier`, `PurchaseMaster`, `PurchaseInvoice`, `PurchaseInvoiceItem`, `PurchaseReturn`,
`PurchaseReturnItem`, `StockInward`, `ItemTypeMaster` are tables from older screens (replaced by Vendor, Purchase /
Order, Stock In and Return). This clinic's stock still counts their old rows; when moving data, bring their stock in
as one **Stock Adjustment (Adjust In)** per batch instead. `StockMovement_Removed_20261105` is a one-off backup
table and is not part of the app.

### Order to create the tables

1. `UnitMaster`, `GenericNameMaster`, `ManufacturerMaster`, `CategoryMaster`, `PotencyMaster`
2. `PharmacyItem`, `Vendor`
3. `PurchaseOrder`, `PurchaseOrderItem`
4. `StockIn`, `StockInItem`, `StockReturn`, `StockReturnItem`, `VendorPayment`
5. `SalesBilling`, `SalesBillingItem`, `SalesReturn`, `SalesReturnItem`
6. `StockAdjustment`, `StockAdjustmentItem`, (`StockMovement`)
7. `AppUser`, `MenuAccess`, `ClinicDetails`, then the indexes; seed one Admin user and the `ClinicDetails` row.

## Done means

- Every screen above works on desktop and narrower screens and fits a 1280 px screen without sideways scroll.
- Stock is right after any mix of Stock In, Return, Sale, Sales Return, Stock Adjustment, edits and deletes (check it
  against the Stock Report history).
- Vendor balances (Vendor Payments screen and report) agree after payments and returns.
- All server-side checks refuse bad input with a clear message and save nothing.
- A counter sale of 5 – 7 items can be keyed in a few seconds with the keyboard only.
