// Check: a sale's checks and GST on real stock, inside a transaction that is
// rolled back (nothing saved, no bill number used); then the INSERTs are only
// compiled (SET NOEXEC ON) to prove every new column name is right.
import 'dotenv/config';
import { getPool, sql } from '../src/db/pool.js';
import { checkSale } from '../src/routes/salesBilling.js';
import { batchStock } from '../src/utils/batchStock.js';

const pool = await getPool();
const items = (await pool.request().query(`
  SELECT TOP 40 i.ItemId, i.Name, i.HSNCode, i.GSTPercent FROM PharmacyItem i
  WHERE i.IsActive = 1 AND i.Status = 'Active' AND EXISTS (SELECT 1 FROM StockInItem l WHERE l.ItemId = i.ItemId)
  ORDER BY i.ItemId DESC`)).recordset;
const batches = (await batchStock(pool.request(), items.map((i) => i.ItemId))).filter((b) => b.AvailableQty >= 1 && b.SelAmount > 0);
const pick = batches.slice(0, 2);
if (!pick.length) { console.log('No stock to test with'); process.exit(1); }
const tx = new sql.Transaction(pool);
await tx.begin();
const body = {
  transDate: new Date().toISOString().slice(0, 10), customerName: 'GST CHECK', discPercent: 0, roundOff: true,
  items: pick.map((b) => ({ itemId: b.ItemId, batch: b.Batch, saleUnit: 'pack', quantity: 1, rate: b.SelAmount, discPercent: 0 })),
};
const sale = await checkSale(tx, body, null);
await tx.rollback();
if (sale.error) { console.log('checkSale error:', sale.error); process.exit(1); }
for (const l of sale.lines) {
  const it = items.find((i) => i.ItemId === l.itemId);
  console.log(`${it.Name} | HSN ${l.hsnCode} | GST ${l.gstPercent}% | amount ${l.amount} net ${l.netAmount} taxable ${l.taxableAmount} cgst ${l.cgstAmount} sgst ${l.sgstAmount}`);
  const back = Math.round((l.taxableAmount + l.cgstAmount + l.sgstAmount) * 100) / 100;
  if (back !== l.netAmount) { console.log('  MISMATCH taxable+gst != net'); process.exitCode = 1; }
}
console.log('bill', { subTotal: sale.subTotal, total: sale.total, gst: { taxable: sale.gst.taxableAmount, cgst: sale.gst.cgstAmount, sgst: sale.gst.sgstAmount } });

await pool.request().batch(`
  SET NOEXEC ON;
  INSERT INTO SalesBilling (TransDate, CustomerName, MobileNo, TotalAmount, SubTotal, DiscPercent, DiscountAmount, RoundOff, CreatedBy, TaxableAmount, CGSTAmount, SGSTAmount, IGSTAmount)
    VALUES ('2026-01-01', 'x', NULL, 0, 0, 0, 0, 0, NULL, 0, 0, 0, 0);
  INSERT INTO SalesBillingItem (SalesBillingId, ItemId, Quantity, Rate, DiscPercent, Amount, Batch, ExpiryDate, SaleUnit, UnitQty, PackSize, HSNCode, GSTPercent, NetAmount, TaxableAmount, CGSTAmount, SGSTAmount, IGSTAmount)
    VALUES (1, 1, 1, 1, 0, 1, '', NULL, 'pack', 1, 1, '', 0, 0, 0, 0, 0, 0);
  INSERT INTO SalesReturn (TransDate, SalesBillingId, CustomerName, MobileNo, SubTotal, DiscPercent, DiscountAmount, TotalAmount, CreatedBy, TaxableAmount, CGSTAmount, SGSTAmount, IGSTAmount)
    VALUES ('2026-01-01', 1, 'x', NULL, 0, 0, 0, 0, NULL, 0, 0, 0, 0);
  INSERT INTO SalesReturnItem (SalesReturnId, SalesLineId, ItemId, Batch, ExpiryDate, SaleUnit, UnitQty, PackSize, Quantity, Rate, DiscPercent, Amount, HSNCode, GSTPercent, NetAmount, TaxableAmount, CGSTAmount, SGSTAmount, IGSTAmount)
    VALUES (1, 1, 1, '', NULL, 'pack', 1, 1, 1, 1, 0, 1, '', 0, 0, 0, 0, 0, 0);
  UPDATE ClinicDetails SET GSTIN = NULL, DrugLicenceNo = NULL, StateName = NULL WHERE 1 = 0;
  SET NOEXEC OFF;`);
console.log('INSERT statements compile OK (nothing executed)');
process.exit(process.exitCode || 0);
