import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import manifestRoutes from './routes/manifest.js';
import appInfoRoutes from './routes/appInfo.js';
import medicationRoutes from './routes/medication.js';
import labTestRoutes from './routes/labTest.js';
import employeeRoutes from './routes/employee.js';
import patientRoutes from './routes/patient.js';
import vitalSignRoutes from './routes/vitalSign.js';
import prescriptionRoutes from './routes/prescription.js';
import reportRoutes from './routes/reports.js';
import confirmationRoutes from './routes/confirmation.js';
import userRoutes from './routes/user.js';
import menuAccessRoutes from './routes/menuAccess.js';
import clinicRoutes from './routes/clinic.js';
import pharmacyRoutes from './routes/pharmacy.js';
import supplierRoutes from './routes/supplier.js';
import vendorRoutes from './routes/vendor.js';
import purchaseMasterRoutes from './routes/purchaseMaster.js';
import genericNameRoutes from './routes/genericName.js';
import manufacturerRoutes from './routes/manufacturer.js';
import itemTypeRoutes from './routes/itemType.js';
import unitRoutes from './routes/unit.js';
import pharmacyItemRoutes from './routes/pharmacyItem.js';
import pharmacyStockRoutes from './routes/pharmacyStock.js';
import purchaseInvoiceRoutes from './routes/purchaseInvoice.js';
import purchaseReturnRoutes from './routes/purchaseReturn.js';
import salesBillingRoutes from './routes/salesBilling.js';
import salesReturnRoutes from './routes/salesReturn.js';
import billingRoutes from './routes/billing.js';
import mailConfigRoutes from './routes/mailConfig.js';
import patientDocumentsRoutes from './routes/patientDocuments.js';
import driveOAuthCallbackRoutes from './routes/driveOAuthCallback.js';
import driveConfigRoutes from './routes/driveConfig.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.use('/api/auth', authRoutes);
// Public: the manifest must be fetchable before login (install prompt, home screen icon).
app.use('/api', manifestRoutes);
app.use('/api', appInfoRoutes);
// Public: Google redirects the browser here after consent, with no auth header of ours.
app.use('/api/drive-config', driveOAuthCallbackRoutes);

app.use('/api', requireAuth);

app.use('/api/medications', medicationRoutes);
app.use('/api/lab-tests', labTestRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/vitals', vitalSignRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/confirmations', confirmationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/menu-access', menuAccessRoutes);
app.use('/api/clinic', clinicRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/purchase-masters', purchaseMasterRoutes);
app.use('/api/generic-names', genericNameRoutes);
app.use('/api/manufacturers', manufacturerRoutes);
app.use('/api/item-types', itemTypeRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/pharmacy-items', pharmacyItemRoutes);
app.use('/api/pharmacy-stock', pharmacyStockRoutes);
app.use('/api/purchase-invoices', purchaseInvoiceRoutes);
app.use('/api/purchase-returns', purchaseReturnRoutes);
app.use('/api/sales-billings', salesBillingRoutes);
app.use('/api/sales-returns', salesReturnRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/mail-config', mailConfigRoutes);
app.use('/api/drive-config', driveConfigRoutes);
app.use('/api/patient-documents', patientDocumentsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
