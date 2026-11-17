import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { docNo, docNoSql } from '../utils/docNumber.js';
import { balanceSql, patientBalance } from '../utils/patientCredit.js';

// Pharmacy > Sales > Credit Ledger: what each patient owes on credit sales,
// and the money received against it (CustomerPayment, SC-CP0001). The balance
// is worked out from the documents (utils/patientCredit.js), never stored:
//   Σ Sales Due − Σ Sales Returns refunded as Credit − Σ payments.
const router = Router();

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const text = (v) => (v == null ? '' : String(v).trim());
export const PAY_MODES = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque'];
const CP_NO = docNoSql('CP', 'cp.PaymentId');

// Patients with any credit, with their totals. ?settled=1 also lists those
// whose balance is back to 0.
router.get('/patients', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT p.PatientId, p.Name, p.MobileNo,
             ISNULL(b.Bills, 0) AS Bills, ISNULL(b.Due, 0) AS Due, b.LastBill,
             ISNULL(rt.Returns, 0) AS Returns, ISNULL(pay.Paid, 0) AS Paid
      FROM Patient p
      OUTER APPLY (SELECT COUNT(*) AS Bills, SUM(sb.DueAmount) AS Due, MAX(sb.TransDate) AS LastBill
                   FROM SalesBilling sb WHERE sb.PatientId = p.PatientId AND sb.IsActive = 1 AND sb.DueAmount > 0) b
      OUTER APPLY (SELECT SUM(sr.TotalAmount) AS Returns FROM SalesReturn sr
                   JOIN SalesBilling sb ON sb.SalesBillingId = sr.SalesBillingId
                   WHERE sb.PatientId = p.PatientId AND sr.IsActive = 1 AND sr.RefundMode = 'Credit') rt
      OUTER APPLY (SELECT SUM(cp.Amount) AS Paid FROM CustomerPayment cp WHERE cp.PatientId = p.PatientId AND cp.IsActive = 1) pay
      WHERE ISNULL(b.Bills, 0) > 0 OR ISNULL(pay.Paid, 0) > 0
      ORDER BY p.Name`);
    const rows = r.recordset.map((x) => ({
      ...x, Due: round2(x.Due), Returns: round2(x.Returns), Paid: round2(x.Paid),
      Balance: round2(Number(x.Due) - Number(x.Returns) - Number(x.Paid)),
    }));
    res.json(req.query.settled === '1' ? rows : rows.filter((x) => x.Balance > 0.005));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// One patient's ledger by date with a running balance: credit bills (debit),
// credit returns and payments (credit).
router.get('/patient/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pool = await getPool();
    const head = await pool.request().input('id', sql.Int, id)
      .query(`SELECT p.PatientId, p.Name, p.MobileNo, ${balanceSql('p.PatientId')} AS Balance FROM Patient p WHERE p.PatientId = @id`);
    if (!head.recordset.length) return res.status(404).json({ error: 'Patient not found' });
    const r = await pool.request().input('id', sql.Int, id).query(`
      SELECT 'Bill' AS Type, sb.SalesBillingId AS DocId, ${docNoSql('S', 'sb.SalesBillingId')} AS DocNo, sb.TransDate AS DocDate, sb.CreatedAt,
             sb.DueAmount AS Debit, 0 AS Credit, sb.TotalAmount AS BillTotal, sb.PaidAmount AS PaidNow, sb.PayMode AS Mode, NULL AS Reference, NULL AS Notes, sb.CreatedBy
      FROM SalesBilling sb WHERE sb.PatientId = @id AND sb.IsActive = 1 AND sb.DueAmount > 0
      UNION ALL
      SELECT 'Return', sr.SalesReturnId, ${docNoSql('SR', 'sr.SalesReturnId')}, sr.TransDate, sr.CreatedAt,
             0, sr.TotalAmount, NULL, NULL, 'Credit', ${docNoSql('S', 'sb.SalesBillingId')}, NULL, sr.CreatedBy
      FROM SalesReturn sr JOIN SalesBilling sb ON sb.SalesBillingId = sr.SalesBillingId
      WHERE sb.PatientId = @id AND sr.IsActive = 1 AND sr.RefundMode = 'Credit'
      UNION ALL
      SELECT 'Payment', cp.PaymentId, ${CP_NO}, cp.PayDate, cp.CreatedAt,
             0, cp.Amount, NULL, NULL, cp.PayMode, cp.ReferenceNo, cp.Notes, cp.CreatedBy
      FROM CustomerPayment cp WHERE cp.PatientId = @id AND cp.IsActive = 1
      ORDER BY DocDate, CreatedAt`);
    let bal = 0;
    const entries = r.recordset.map((e) => {
      bal = round2(bal + Number(e.Debit) - Number(e.Credit));
      return { ...e, Debit: round2(e.Debit), Credit: round2(e.Credit), Balance: bal };
    });
    res.json({ ...head.recordset[0], Balance: round2(head.recordset[0].Balance), entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Receive a payment: Amount > 0 and not more than the balance (checked under
// a lock so two counters can't both take the same due).
router.post('/', async (req, res) => {
  const b = req.body || {};
  const patientId = Number(b.patientId);
  const payDate = text(b.payDate).slice(0, 10);
  const amount = round2(b.amount);
  const payMode = text(b.payMode);
  const referenceNo = text(b.referenceNo);
  const notes = text(b.notes);
  if (!(patientId > 0)) return res.status(400).json({ error: 'Pick a patient' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate) || Number.isNaN(Date.parse(payDate))) return res.status(400).json({ error: 'Date is required' });
  if (payDate > new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: "Date can't be in the future" });
  if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be more than 0' });
  if (!PAY_MODES.includes(payMode)) return res.status(400).json({ error: `Payment Mode must be one of ${PAY_MODES.join(', ')}` });
  if (payMode !== 'Cash' && !referenceNo) return res.status(400).json({ error: `${payMode === 'Cheque' ? 'Cheque No' : 'Reference No'} is required for ${payMode}` });
  if (referenceNo.length > 50) return res.status(400).json({ error: 'Reference No must be at most 50 characters' });
  if (notes.length > 300) return res.status(400).json({ error: 'Notes must be at most 300 characters' });
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    await new sql.Request(tx).query("EXEC sp_getapplock @Resource = 'pharmacy-credit', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000");
    const balance = await patientBalance(new sql.Request(tx), patientId);
    if (amount > balance + 0.005) {
      await tx.rollback();
      return res.status(400).json({ error: `Amount can't be more than the balance ₹${balance.toFixed(2)}` });
    }
    const ins = await new sql.Request(tx)
      .input('pid', sql.Int, patientId).input('date', sql.Date, payDate).input('amount', sql.Decimal(12, 2), amount)
      .input('mode', sql.NVarChar(20), payMode).input('ref', sql.NVarChar(50), referenceNo || null)
      .input('notes', sql.NVarChar(300), notes || null).input('by', sql.NVarChar(100), req.user?.username || null)
      .query(`INSERT INTO CustomerPayment (PatientId, PayDate, Amount, PayMode, ReferenceNo, Notes, CreatedBy)
              OUTPUT INSERTED.PaymentId VALUES (@pid, @date, @amount, @mode, @ref, @notes, @by)`);
    await tx.commit();
    const id = ins.recordset[0].PaymentId;
    res.status(201).json({ PaymentId: id, PaymentNo: docNo('CP', id) });
  } catch (err) {
    await tx.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// Soft delete (Admin only): the payment no longer counts, so the balance goes up again.
router.delete('/:id', async (req, res) => {
  try {
    if (req.user?.role !== 'Admin') return res.status(403).json({ error: 'Only an Admin can delete a payment' });
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('UPDATE CustomerPayment SET IsActive = 0 WHERE PaymentId = @id AND IsActive = 1');
    if (!r.rowsAffected[0]) return res.status(404).json({ error: 'Payment not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
