import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { batchStock } from '../utils/batchStock.js';
import { docNo, docNoSql } from '../utils/docNumber.js';
import { unitsPerPack, saleLineAmount, saleBill, saleGst, roundOffOf } from '../utils/purchaseCalc.js';
import { balanceSql, negativeBalance } from '../utils/patientCredit.js';

// Pharmacy > Sales: counter sales, each line sold from one batch, by the Pack
// or by the Unit (one piece; price and quantity per piece). Stock is never
// stored here: a batch's stock is worked out from what was received,
// returned and sold (utils/batchStock.js), so saving a sale is what lowers it.
// Stock is counted in packs, so a Unit sale saves Quantity = units / pack size.
const router = Router();

const PHONE = /^\+?[0-9][0-9\s-]*$/;
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
const CODE = docNoSql('S', 'h.SalesBillingId');
export const PAY_MODES = ['Cash', 'UPI', 'Card', 'Credit'];
const NEEDS_REF = ['UPI', 'Card'];

// Serialises stock-changing saves so two bills can't both take the last units.
const lockStock = (tx) => new sql.Request(tx).query(
  "EXEC sp_getapplock @Resource = 'pharmacy-stock', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000",
);

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT h.SalesBillingId, ${CODE} AS Code, h.TransDate, h.CustomerName, h.MobileNo, h.TotalAmount, h.CreatedAt,
               h.PatientId, h.PayMode, h.DueAmount,
               li.ItemNames, ISNULL(li.TotalQty, 0) AS TotalQty
        FROM SalesBilling h
        OUTER APPLY (
          SELECT STRING_AGG(i.Name, ', ') WITHIN GROUP (ORDER BY l.LineId) AS ItemNames, SUM(l.Quantity) AS TotalQty
          FROM SalesBillingItem l JOIN PharmacyItem i ON i.ItemId = l.ItemId
          WHERE l.SalesBillingId = h.SalesBillingId
        ) li
        WHERE h.IsActive = 1
          AND (@search = '%%' OR h.CustomerName LIKE @search OR h.MobileNo LIKE @search
               OR ${CODE} LIKE @search OR li.ItemNames LIKE @search)
        ORDER BY h.SalesBillingId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Lookups for the Sales screen (patient, prescription, doctor) ----

// Patients by name, mobile or Patient ID (top 20; all of them with no search),
// with their credit balance.
router.get('/lookup/patients', async (req, res) => {
  try {
    const q = String(req.query.search || '').trim();
    const pool = await getPool();
    const r = await pool.request().input('q', sql.NVarChar, `%${q}%`).input('id', sql.Int, /^\d+$/.test(q) ? Number(q) : null).query(`
      SELECT TOP (CASE WHEN @q = '%%' THEN 5000 ELSE 20 END) p.PatientId, p.Name, p.MobileNo, p.Age, ${balanceSql('p.PatientId')} AS Balance
      FROM Patient p
      WHERE p.IsActive = 1 AND (@q = '%%' OR p.Name LIKE @q OR p.MobileNo LIKE @q OR p.PatientId = @id)
      ORDER BY CASE WHEN p.PatientId = @id THEN 0 ELSE 1 END, p.PatientId DESC`);
    res.json(r.recordset.map((p) => ({ ...p, Balance: Math.round(Number(p.Balance || 0) * 100) / 100 })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A patient's last 10 prescriptions with their medicines and doctor.
router.get('/lookup/prescriptions/:patientId', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('pid', sql.Int, Number(req.params.patientId) || 0).query(`
      SELECT TOP 10 pr.PrescriptionId, pr.CreatedAt, pr.Diagnosis, pr.DoctorId, e.Name AS DoctorName
      FROM Prescription pr LEFT JOIN Employee e ON e.EmployeeId = pr.DoctorId
      WHERE pr.PatientId = @pid ORDER BY pr.CreatedAt DESC, pr.PrescriptionId DESC;
      SELECT pi.PrescriptionId, pi.MedicineName, pi.Dosage, pi.Frequency, pi.Duration, m.MedicineName AS MasterName
      FROM PrescriptionItem pi
      JOIN Prescription pr ON pr.PrescriptionId = pi.PrescriptionId AND pr.PatientId = @pid
      LEFT JOIN Medication m ON m.MedicationId = pi.MedicationId
      ORDER BY pi.ItemId`);
    const [heads, items] = r.recordsets;
    res.json(heads.map((h) => ({
      ...h,
      items: items.filter((i) => i.PrescriptionId === h.PrescriptionId)
        .map((i) => ({ name: i.MedicineName || i.MasterName || '', dosage: i.Dosage, frequency: i.Frequency, duration: i.Duration }))
        .filter((i) => i.name),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Doctors (Employee Type 'Doctor').
router.get('/lookup/doctors', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query("SELECT EmployeeId, Name FROM Employee WHERE IsActive = 1 AND EmpType = 'Doctor' ORDER BY Name");
    res.json(r.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// An item's batches that still have stock, earliest expiry first, with the
// item's Rack / Box / MRP and its selling price as the suggested sale price.
// ?excludeSaleId= counts that sale's own quantities as still available.
router.get('/batches/:itemId', async (req, res) => {
  try {
    const pool = await getPool();
    const excludeSaleId = Number(req.query.excludeSaleId) || null;
    const batches = await batchStock(pool.request(), [req.params.itemId], { excludeSaleId });
    res.json(batches.filter((b) => b.AvailableQty > 0));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const LINES_SQL = `
  SELECT l.LineId, l.ItemId, i.Name AS ItemName, l.Batch, l.ExpiryDate, l.Quantity, l.Rate, l.Amount, ISNULL(l.DiscPercent, 0) AS DiscPercent,
         ISNULL(l.SaleUnit, 'pack') AS SaleUnit, ISNULL(l.UnitQty, l.Quantity) AS UnitQty, ISNULL(l.PackSize, 1) AS PackSize,
         i.Rack, i.BoxNo, i.MRP, i.SellPrice, i.Pack,
         l.HSNCode, l.GSTPercent, l.NetAmount, l.TaxableAmount, l.CGSTAmount, l.SGSTAmount, l.IGSTAmount
  FROM SalesBillingItem l
  JOIN PharmacyItem i ON i.ItemId = l.ItemId
  WHERE l.SalesBillingId = @id
  ORDER BY l.LineId
`;

router.get('/:id/items', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, req.params.id).query(LINES_SQL);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const head = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT h.SalesBillingId, ${CODE} AS Code, h.TransDate, h.CustomerName, h.MobileNo, h.TotalAmount,
             ISNULL(h.SubTotal, h.TotalAmount) AS SubTotal, ISNULL(h.DiscPercent, 0) AS DiscPercent, ISNULL(h.DiscountAmount, 0) AS DiscountAmount, h.RoundOff,
             h.TaxableAmount, h.CGSTAmount, h.SGSTAmount, h.IGSTAmount,
             h.PatientId, p.Name AS PatientName, h.PrescriptionId, h.DoctorId, e.Name AS DoctorName,
             h.PayMode, h.PayReference, h.PaidAmount, h.DueAmount
      FROM SalesBilling h
      LEFT JOIN Patient p ON p.PatientId = h.PatientId
      LEFT JOIN Employee e ON e.EmployeeId = h.DoctorId
      WHERE h.SalesBillingId = @id AND h.IsActive = 1
    `);
    if (!head.recordset.length) return res.status(404).json({ error: 'Sale not found' });
    const lines = await pool.request().input('id', sql.Int, req.params.id).query(LINES_SQL);
    res.json({ ...head.recordset[0], lines: lines.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Checks a sale body against the database. Returns { error } or the cleaned
// { transDate, customerName, mobileNo, lines, subTotal, discPercent, discountAmount, total }. Amounts are worked out
// here, never taken from the screen. Runs inside the save's transaction so
// the stock it checks can't change before the save.
export async function checkSale(tx, body, saleId) {
  const transDate = String(body.transDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate) || Number.isNaN(Date.parse(transDate))) return { error: 'Date is required' };
  const customerName = String(body.customerName || '').trim();
  if (!customerName) return { error: 'Customer Name is required' };
  if (customerName.length > 200) return { error: 'Customer Name must be at most 200 characters' };
  const mobileNo = String(body.mobileNo || '').trim();
  if (mobileNo && (!PHONE.test(mobileNo) || mobileNo.length > 20)) return { error: 'Mobile No must contain numbers only' };

  // Rows with nothing picked are ignored; anything half-filled is an error.
  const raw = (Array.isArray(body.items) ? body.items : []).filter((it) => it && (it.itemId || it.quantity));
  if (!raw.length) return { error: 'Add at least one item' };

  const itemIds = raw.map((it) => Number(it.itemId)).filter(Boolean);
  const items = new Map();
  if (itemIds.length) {
    const found = await new sql.Request(tx)
      .input('ids', sql.NVarChar(sql.MAX), [...new Set(itemIds)].join(','))
      .query(`SELECT i.ItemId, i.Name, i.MRP, i.PurchaseRate, i.Pack, u.Name AS UnitName, i.HSNCode,
                     ISNULL(i.GSTPercent, ISNULL(i.CGSTPercent, 0) + ISNULL(i.SGSTPercent, 0)) AS GSTPercent FROM PharmacyItem i
              LEFT JOIN UnitMaster u ON u.UnitId = i.UnitId
              WHERE i.IsActive = 1 AND i.ItemId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))`);
    for (const r of found.recordset) items.set(r.ItemId, r);
  }
  const batches = await batchStock(new sql.Request(tx), itemIds, { excludeSaleId: saleId });
  const batchOf = (itemId, batch) => batches.find((b) => b.ItemId === itemId && b.Batch === batch);

  const lines = [];
  const wanted = new Map(); // "itemId|batch" -> total packs across lines
  for (const [i, it] of raw.entries()) {
    const row = `Row ${i + 1}`;
    const item = items.get(Number(it.itemId));
    if (!item) return { error: `${row}: pick an item` };
    const batch = String(it.batch ?? '').trim();
    const b = batchOf(item.ItemId, batch);
    if (!b) return { error: `${row} (${item.Name}): pick a batch that has stock` };
    const saleUnit = it.saleUnit === 'unit' ? 'unit' : 'pack';
    const size = saleUnit === 'unit' ? unitsPerPack(item.Pack, item.UnitName) : 1;
    const qty = Number(it.quantity);
    if (!(qty > 0)) return { error: `${row} (${item.Name}): Quantity must be more than 0` };
    const price = Number(it.rate);
    if (!(price > 0)) return { error: `${row} (${item.Name}): Sale Price must be more than 0` };
    // The batch's own MRP when its Stock In recorded one, else the item's.
    const disc = it.discPercent === '' || it.discPercent == null ? 0 : Number(it.discPercent);
    if (!(disc >= 0 && disc <= 100)) return { error: `${row} (${item.Name}): Disc % must be 0 to 100` };
    const mrp = round2(Number(b.MRP ?? item.MRP) / size);
    if (mrp > 0 && price > mrp) return { error: `${row} (${item.Name}): Sale Price can't be above MRP ${mrp.toFixed(2)}${saleUnit === 'unit' ? ' per unit' : ''}` };
    // No selling below cost: the row's Amount must cover Quantity × its
    // purchase price (the batch's Stock In rate, else the item's).
    const amount = saleLineAmount({ quantity: qty, rate: price, discPercent: disc });
    const cost = round2(qty * round2(Number(b.PurchaseRate ?? item.PurchaseRate ?? 0) / size));
    if (amount < cost) return { error: `${row} (${item.Name}): Amount ${amount.toFixed(2)} is below the purchase cost ${cost.toFixed(2)}` };
    const packs = round4(qty / size);
    const key = `${item.ItemId}|${batch}`;
    wanted.set(key, (wanted.get(key) || 0) + packs);
    if (wanted.get(key) > b.AvailableQty + 0.00005) {
      return { error: `${item.Name}${batch ? ` batch ${batch}` : ''}: only ${round2(b.AvailableQty)} pack(s) in stock` };
    }
    lines.push({
      itemId: item.ItemId, batch: batch || null, expiryDate: b.ExpiryDate, qty: packs, rate: round2(price), discPercent: disc, amount, cost,
      saleUnit, unitQty: qty, packSize: size, hsnCode: item.HSNCode || null, gstPercent: Number(item.GSTPercent || 0),
    });
  }
  const discPercent = body.discPercent === '' || body.discPercent == null ? 0 : Number(body.discPercent);
  if (!(discPercent >= 0 && discPercent <= 100)) return { error: 'Bill Discount % must be 0 to 100' };
  const bill = saleBill(lines.map((l) => l.amount), discPercent);
  const totalCost = round2(lines.reduce((s, l) => s + l.cost, 0));
  if (bill.total < totalCost) return { error: `Total ${bill.total.toFixed(2)} is below the purchase cost ${totalCost.toFixed(2)}: lower the Bill Discount` };
  // body.roundOff: true rounds the Total to the nearest rupee. The cost check
  // above is on the Total before it, so rounding down by up to 0.50 is allowed.
  const roundOff = body.roundOff ? roundOffOf(bill.total) : 0;
  // GST is worked out here from the item's GST % today and saved on each line.
  const gst = saleGst(lines, discPercent);
  lines.forEach((l, i) => Object.assign(l, gst.lines[i]));
  const total = round2(bill.total + roundOff);

  // Patient / prescription / doctor (all optional).
  const patientId = Number(body.patientId) || null;
  if (patientId) {
    const p = await new sql.Request(tx).input('pid', sql.Int, patientId).query('SELECT PatientId FROM Patient WHERE PatientId = @pid AND IsActive = 1');
    if (!p.recordset.length) return { error: 'Patient not found' };
  }
  const prescriptionId = Number(body.prescriptionId) || null;
  let doctorId = Number(body.doctorId) || null;
  if (prescriptionId) {
    if (!patientId) return { error: 'Pick the patient for this prescription' };
    const pr = await new sql.Request(tx).input('prId', sql.Int, prescriptionId).query('SELECT PatientId, DoctorId FROM Prescription WHERE PrescriptionId = @prId');
    if (!pr.recordset.length || pr.recordset[0].PatientId !== patientId) return { error: "That prescription isn't this patient's" };
    doctorId = doctorId || pr.recordset[0].DoctorId || null;
  }
  if (doctorId) {
    const d = await new sql.Request(tx).input('did', sql.Int, doctorId).query("SELECT EmployeeId FROM Employee WHERE EmployeeId = @did AND EmpType = 'Doctor'");
    if (!d.recordset.length) return { error: 'Doctor not found' };
  }

  // Payment: Paid defaults to the whole Net Amount (0 for Credit); what isn't
  // paid is Due, which is credit and so needs a registered patient.
  const payMode = PAY_MODES.includes(body.payMode) ? body.payMode : (body.payMode ? null : 'Cash');
  if (!payMode) return { error: `Pay Mode must be one of ${PAY_MODES.join(', ')}` };
  const paidRaw = body.paidAmount;
  const paid = paidRaw === '' || paidRaw == null ? (payMode === 'Credit' ? 0 : total) : round2(Number(paidRaw));
  if (!(paid >= 0)) return { error: 'Paid must be 0 or more' };
  if (paid > total + 0.005) return { error: `Paid can't be more than the Net Amount ${total.toFixed(2)}` };
  const due = round2(total - paid);
  if (due > 0 && !patientId) return { error: 'Pick a registered patient to give credit (Paid is less than the Net Amount)' };
  const payReference = String(body.payReference || '').trim();
  if (payReference.length > 50) return { error: 'Reference must be at most 50 characters' };
  if (NEEDS_REF.includes(payMode) && paid > 0 && !payReference) return { error: `Enter the ${payMode === 'UPI' ? 'UPI transaction id' : 'card reference (last 4 digits)'}` };

  return {
    transDate, customerName, mobileNo: mobileNo || null, lines, discPercent, ...bill, roundOff, total, gst,
    patientId, prescriptionId, doctorId, payMode, paid, due, payReference: payReference || null,
  };
}

async function insertLines(tx, saleId, lines) {
  for (const l of lines) {
    await new sql.Request(tx)
      .input('id', sql.Int, saleId)
      .input('itemId', sql.Int, l.itemId)
      .input('qty', sql.Decimal(12, 4), l.qty)
      .input('rate', sql.Decimal(10, 2), l.rate)
      .input('disc', sql.Decimal(5, 2), l.discPercent)
      .input('amount', sql.Decimal(12, 2), l.amount)
      .input('batch', sql.NVarChar(100), l.batch)
      .input('expiry', sql.Date, l.expiryDate)
      .input('saleUnit', sql.NVarChar(10), l.saleUnit)
      .input('unitQty', sql.Decimal(10, 2), l.unitQty)
      .input('packSize', sql.Int, l.packSize)
      .input('hsn', sql.NVarChar(30), l.hsnCode)
      .input('gstP', sql.Decimal(5, 2), l.gstPercent)
      .input('net', sql.Decimal(12, 2), l.netAmount)
      .input('taxable', sql.Decimal(12, 2), l.taxableAmount)
      .input('cgst', sql.Decimal(12, 2), l.cgstAmount)
      .input('sgst', sql.Decimal(12, 2), l.sgstAmount)
      .input('igst', sql.Decimal(12, 2), l.igstAmount)
      .query(`INSERT INTO SalesBillingItem (SalesBillingId, ItemId, Quantity, Rate, DiscPercent, Amount, Batch, ExpiryDate, SaleUnit, UnitQty, PackSize,
                                            HSNCode, GSTPercent, NetAmount, TaxableAmount, CGSTAmount, SGSTAmount, IGSTAmount)
              VALUES (@id, @itemId, @qty, @rate, @disc, @amount, @batch, @expiry, @saleUnit, @unitQty, @packSize,
                      @hsn, @gstP, @net, @taxable, @cgst, @sgst, @igst)`);
  }
}

// A sale with a Sales Return against it can't be changed or deleted: the
// return points at its lines.
async function returnedReason(request, saleId) {
  const r = await request.input('rsId', sql.Int, saleId).query(`
    SELECT TOP 1 ${docNoSql('SR', 'SalesReturnId')} AS ReturnNo FROM SalesReturn WHERE SalesBillingId = @rsId AND IsActive = 1`);
  return r.recordset.length ? `Sales Return ${r.recordset[0].ReturnNo} has been made from this sale, so it can no longer be changed` : null;
}

// Saves a new sale (saleId null) or replaces an existing one's header and lines.
async function saveSale(req, res, saleId) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    await lockStock(tx);
    const locked = saleId ? await returnedReason(new sql.Request(tx), saleId) : null;
    if (locked) {
      await tx.rollback();
      return res.status(400).json({ error: locked });
    }
    const sale = await checkSale(tx, req.body, saleId);
    if (sale.error) {
      await tx.rollback();
      return res.status(400).json({ error: sale.error });
    }
    const head = new sql.Request(tx)
      .input('transDate', sql.Date, sale.transDate)
      .input('customer', sql.NVarChar(200), sale.customerName)
      .input('mobile', sql.NVarChar(20), sale.mobileNo)
      .input('subTotal', sql.Decimal(12, 2), sale.subTotal)
      .input('disc', sql.Decimal(5, 2), sale.discPercent)
      .input('discAmt', sql.Decimal(12, 2), sale.discountAmount)
      .input('total', sql.Decimal(12, 2), sale.total)
      .input('roundOff', sql.Decimal(10, 2), sale.roundOff)
      .input('taxable', sql.Decimal(12, 2), sale.gst.taxableAmount)
      .input('cgst', sql.Decimal(12, 2), sale.gst.cgstAmount)
      .input('sgst', sql.Decimal(12, 2), sale.gst.sgstAmount)
      .input('igst', sql.Decimal(12, 2), sale.gst.igstAmount)
      .input('patientId', sql.Int, sale.patientId)
      .input('prescriptionId', sql.Int, sale.prescriptionId)
      .input('doctorId', sql.Int, sale.doctorId)
      .input('payMode', sql.NVarChar(20), sale.payMode)
      .input('payRef', sql.NVarChar(50), sale.payReference)
      .input('paid', sql.Decimal(12, 2), sale.paid)
      .input('due', sql.Decimal(12, 2), sale.due);
    // The patient this sale had before an edit, to re-check their credit too.
    const before = saleId ? (await new sql.Request(tx).input('bid', sql.Int, saleId).query('SELECT PatientId FROM SalesBilling WHERE SalesBillingId = @bid')).recordset[0]?.PatientId : null;
    let id = saleId;
    if (saleId) {
      const upd = await head.input('id', sql.Int, saleId).query(`
        UPDATE SalesBilling SET TransDate = @transDate, CustomerName = @customer, MobileNo = @mobile, TotalAmount = @total,
            SubTotal = @subTotal, DiscPercent = @disc, DiscountAmount = @discAmt, RoundOff = @roundOff,
            TaxableAmount = @taxable, CGSTAmount = @cgst, SGSTAmount = @sgst, IGSTAmount = @igst,
            PatientId = @patientId, PrescriptionId = @prescriptionId, DoctorId = @doctorId,
            PayMode = @payMode, PayReference = @payRef, PaidAmount = @paid, DueAmount = @due
        WHERE SalesBillingId = @id AND IsActive = 1`);
      if (!upd.rowsAffected[0]) {
        await tx.rollback();
        return res.status(404).json({ error: 'Sale not found' });
      }
      await new sql.Request(tx).input('id', sql.Int, saleId).query('DELETE FROM SalesBillingItem WHERE SalesBillingId = @id');
    } else {
      const ins = await head.input('by', sql.NVarChar(100), req.user?.username || null).query(`
        INSERT INTO SalesBilling (TransDate, CustomerName, MobileNo, TotalAmount, SubTotal, DiscPercent, DiscountAmount, RoundOff, CreatedBy,
                                  TaxableAmount, CGSTAmount, SGSTAmount, IGSTAmount,
                                  PatientId, PrescriptionId, DoctorId, PayMode, PayReference, PaidAmount, DueAmount)
        OUTPUT INSERTED.SalesBillingId
        VALUES (@transDate, @customer, @mobile, @total, @subTotal, @disc, @discAmt, @roundOff, @by, @taxable, @cgst, @sgst, @igst,
                @patientId, @prescriptionId, @doctorId, @payMode, @payRef, @paid, @due)`);
      id = ins.recordset[0].SalesBillingId;
    }
    await insertLines(tx, id, sale.lines);
    const credit = await negativeBalance(tx, [before, sale.patientId]);
    if (credit) {
      await tx.rollback();
      return res.status(400).json({ error: credit });
    }
    await tx.commit();
    res.status(saleId ? 200 : 201).json({ SalesBillingId: id, Code: docNo('S', id), TotalAmount: sale.total });
  } catch (err) {
    await tx.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  }
}

router.post('/', (req, res) => saveSale(req, res, null));

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad sale id' });
  return saveSale(req, res, id);
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.user?.role !== 'Admin') return res.status(403).json({ error: 'Only an Admin can delete a sale' });
    const pool = await getPool();
    const locked = await returnedReason(pool.request(), Number(req.params.id));
    if (locked) return res.status(400).json({ error: locked });
    // A credit sale can't go while payments received against it would then be
    // more than the patient owes.
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const del = await new sql.Request(tx).input('id', sql.Int, req.params.id)
        .query('UPDATE SalesBilling SET IsActive = 0 OUTPUT INSERTED.PatientId WHERE SalesBillingId = @id');
      const credit = await negativeBalance(tx, [del.recordset[0]?.PatientId]);
      if (credit) { await tx.rollback(); return res.status(400).json({ error: credit }); }
      await tx.commit();
    } catch (e) {
      await tx.rollback().catch(() => {});
      throw e;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
