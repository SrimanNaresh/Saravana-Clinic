import { sql } from '../db/pool.js';

// A patient's credit balance (docs/saravana_pharmacy_db.md §4.6), worked out
// from the documents, never stored:
//   Σ Sales Due  −  Σ Sales Returns refunded as Credit  −  Σ Credit payments
// Active rows only. `p` is the SQL expression holding the PatientId.
export const balanceSql = (p) => `(
  ISNULL((SELECT SUM(sb.DueAmount) FROM SalesBilling sb WHERE sb.PatientId = ${p} AND sb.IsActive = 1), 0)
  - ISNULL((SELECT SUM(sr.TotalAmount) FROM SalesReturn sr
            JOIN SalesBilling sb ON sb.SalesBillingId = sr.SalesBillingId
            WHERE sb.PatientId = ${p} AND sr.IsActive = 1 AND sr.RefundMode = 'Credit'), 0)
  - ISNULL((SELECT SUM(cp.Amount) FROM CustomerPayment cp WHERE cp.PatientId = ${p} AND cp.IsActive = 1), 0)
)`;

export async function patientBalance(request, patientId) {
  if (!patientId) return 0;
  const r = await request.input('pbId', sql.Int, patientId).query(`SELECT ${balanceSql('@pbId')} AS Balance`);
  return Math.round(Number(r.recordset[0]?.Balance || 0) * 100) / 100;
}

// After a change, a patient's balance may not go below zero (payments or
// credit refunds would then be more than what was owed). Returns an error
// message or null. Runs inside the save's transaction.
export async function negativeBalance(tx, patientIds) {
  for (const id of [...new Set(patientIds.filter(Boolean))]) {
    const bal = await patientBalance(new sql.Request(tx), id);
    if (bal < -0.005) {
      return `This change would leave the patient's credit at −₹${Math.abs(bal).toFixed(2)}: payments or credit refunds already received are more than the dues. Reverse a payment on Credit Ledger first.`;
    }
  }
  return null;
}
