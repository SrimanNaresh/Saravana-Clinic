// Check: payment / credit / patient rules of a sale, on real stock, inside a
// transaction that is rolled back (nothing saved, no bill number used).
import 'dotenv/config';
import { getPool, sql } from '../src/db/pool.js';
import { checkSale } from '../src/routes/salesBilling.js';
import { batchStock } from '../src/utils/batchStock.js';

const pool = await getPool();
const ids = (await pool.request().query(`SELECT TOP 40 ItemId FROM PharmacyItem WHERE IsActive = 1 AND Status = 'Active'
  AND EXISTS (SELECT 1 FROM StockInItem l WHERE l.ItemId = PharmacyItem.ItemId) ORDER BY ItemId DESC`)).recordset.map((r) => r.ItemId);
const b = (await batchStock(pool.request(), ids)).find((x) => x.AvailableQty >= 1 && x.SelAmount > 0);
const patient = (await pool.request().query('SELECT TOP 1 p.PatientId FROM Patient p WHERE p.IsActive = 1 ORDER BY (SELECT COUNT(*) FROM Prescription pr WHERE pr.PatientId = p.PatientId) DESC, p.PatientId DESC')).recordset[0].PatientId;
const presc = (await pool.request().input('p', sql.Int, patient).query('SELECT TOP 1 PrescriptionId FROM Prescription WHERE PatientId = @p')).recordset[0]?.PrescriptionId;
const otherPresc = (await pool.request().input('p', sql.Int, patient).query('SELECT TOP 1 pr.PrescriptionId FROM Prescription pr WHERE pr.PatientId <> @p')).recordset[0]?.PrescriptionId;
const base = {
  transDate: new Date().toISOString().slice(0, 10), customerName: 'PAY CHECK', discPercent: 0, roundOff: true,
  items: [{ itemId: b.ItemId, batch: b.Batch, saleUnit: 'pack', quantity: 1, rate: b.SelAmount, discPercent: 0 }],
};
const cases = [
  ['cash, paid blank -> paid all', {}, (s) => s.payMode === 'Cash' && s.due === 0 && s.paid === s.total],
  ['credit, no patient -> refused', { payMode: 'Credit' }, (s) => /patient/.test(s.error || '')],
  ['credit with patient -> all due', { payMode: 'Credit', patientId: patient }, (s) => s.paid === 0 && s.due === s.total],
  ['cash part paid, patient -> due', { paidAmount: 1, patientId: patient }, (s) => s.paid === 1 && s.due > 0],
  ['paid above net -> refused', { paidAmount: 999999 }, (s) => /more than/.test(s.error || '')],
  ['UPI without ref -> refused', { payMode: 'UPI' }, (s) => /UPI/.test(s.error || '')],
  ['UPI with ref -> ok', { payMode: 'UPI', payReference: 'T123' }, (s) => !s.error && s.payReference === 'T123'],
  ['bad pay mode -> refused', { payMode: 'Gold' }, (s) => /Pay Mode/.test(s.error || '')],
  ['prescription of patient -> ok', { patientId: patient, prescriptionId: presc }, (s) => !presc || (!s.error && s.prescriptionId === presc)],
  ["other patient's prescription -> refused", { patientId: patient, prescriptionId: otherPresc }, (s) => !otherPresc || /isn't this patient/.test(s.error || '')],
];
let bad = 0;
for (const [name, extra, ok] of cases) {
  if (Object.prototype.hasOwnProperty.call(extra, 'prescriptionId') && !extra.prescriptionId) { console.log(`SKIP ${name} (no such prescription in this database)`); continue; }
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const s = await checkSale(tx, { ...base, ...extra }, null);
  await tx.rollback();
  const pass = ok(s);
  if (!pass) bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${s.error ? ` (${s.error})` : ` (total ${s.total}, paid ${s.paid}, due ${s.due})`}`);
}
process.exit(bad ? 1 : 0);
