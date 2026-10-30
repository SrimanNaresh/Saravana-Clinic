import { useState, useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Menu, LogOut, ChevronDown } from 'lucide-react';
import TopNav from './components/TopNav.jsx';
import { clinicApi } from './api/client.js';
import { useAuth } from './context/AuthContext.jsx';
import { useAppName } from './hooks/useAppName.js';
import Login from './pages/Login.jsx';
import PatientPortal from './pages/patient/PatientPortal.jsx';

import DashboardRedirect from './pages/DashboardRedirect.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import ReceptionDashboard from './pages/ReceptionDashboard.jsx';
import DoctorDashboard from './pages/DoctorDashboard.jsx';
import Medication from './pages/master/Medication.jsx';
import TestMaster from './pages/master/TestMaster.jsx';
import LetterPadPrescription from './pages/comingUp/LetterPadPrescription.jsx';
import MedicationList from './pages/master/MedicationList.jsx';
import UserMaster from './pages/master/UserMaster.jsx';
import MenuAccess from './pages/master/MenuAccess.jsx';
import ClinicDetails from './pages/master/ClinicDetails.jsx';
import Employee from './pages/registration/Employee.jsx';
import EmployeeList from './pages/registration/EmployeeList.jsx';
import Patient from './pages/registration/Patient.jsx';
import PatientList from './pages/registration/PatientList.jsx';
import ConfirmSearch from './pages/confirm/ConfirmSearch.jsx';
import ConfirmList from './pages/confirm/ConfirmList.jsx';
import VitalSign from './pages/confirm/VitalSign.jsx';
import VitalSignList from './pages/confirm/VitalSignList.jsx';
import Prescription from './pages/confirm/Prescription.jsx';
import ReportPatientList from './pages/reports/ReportPatientList.jsx';
import ReportMedicalHistory from './pages/reports/ReportMedicalHistory.jsx';
import ReportPrescriptions from './pages/reports/ReportPrescriptions.jsx';
import ReportVisitList from './pages/reports/ReportVisitList.jsx';
import Supplier from './pages/pharmacy/Supplier.jsx';
import VendorMaster from './pages/pharmacy/VendorMaster.jsx';
import VendorList from './pages/pharmacy/VendorList.jsx';
import PurchaseMaster from './pages/pharmacy/PurchaseMaster.jsx';
import PurchaseMasterList from './pages/pharmacy/PurchaseMasterList.jsx';
import Item from './pages/pharmacy/Item.jsx';
import ItemList from './pages/pharmacy/ItemList.jsx';
import ItemListNew from './pages/pharmacy/ItemListNew.jsx';
import Stock from './pages/pharmacy/Stock.jsx';
import StockInward from './pages/pharmacy/StockInward.jsx';
import StockInwardList from './pages/pharmacy/StockInwardList.jsx';
import PurchaseInvoice from './pages/pharmacy/PurchaseInvoice.jsx';
import PurchaseInvoiceList from './pages/pharmacy/PurchaseInvoiceList.jsx';
import PurchaseReturn from './pages/pharmacy/PurchaseReturn.jsx';
import PurchaseReturnList from './pages/pharmacy/PurchaseReturnList.jsx';
import SalesBilling from './pages/pharmacy/SalesBilling.jsx';
import SalesBillingList from './pages/pharmacy/SalesBillingList.jsx';
import SalesReturn from './pages/pharmacy/SalesReturn.jsx';
import StockReport from './pages/pharmacy/StockReport.jsx';
import VendorPayments from './pages/pharmacy/VendorPayments.jsx';
import PatientRecords from './pages/reports/PatientRecords.jsx';
import FollowUpPatients from './pages/reports/FollowUpPatients.jsx';
import PrescriptionPrint from './pages/confirm/PrescriptionPrint.jsx';
import BillingMonthWise from './pages/billing/BillingMonthWise.jsx';
import BillingCustom from './pages/billing/BillingCustom.jsx';
import BillingPatientBill from './pages/billing/BillingPatientBill.jsx';

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const initials = (user?.username || '?').slice(0, 2).toUpperCase();

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-ink-100"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-sm">
          {initials}
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-semibold text-ink-700">{user?.username || 'Account'}</p>
          <p className="text-xs text-ink-400">Signed in</p>
        </div>
        <ChevronDown size={14} className="hidden text-ink-400 sm:block" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-ink-100 bg-white py-1.5 shadow-elevated">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

function AppLayout({ appName }) {
  // Open by default — the hamburger toggles the nav bar (desktop) / dropdown (mobile) shut.
  const [navOpen, setNavOpen] = useState(true);
  const [clinicName, setClinicName] = useState('');

  useEffect(() => { clinicApi.get().then((c) => setClinicName(c?.Name || '')).catch(() => setClinicName('')); }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="no-print sticky top-0 z-20">
        <header className="relative z-10 flex items-center gap-3 border-b border-ink-100 bg-white/85 px-4 py-1 backdrop-blur-md lg:px-6">
          <button
            onClick={() => setNavOpen((o) => !o)}
            className="rounded-lg p-1.5 text-ink-600 transition-colors hover:bg-ink-100"
            aria-label="Toggle menu"
            title="Show / hide menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1">
            <p className="font-display text-lg font-bold tracking-tight text-brand-800 sm:text-xl">{clinicName || appName}</p>
            <p className="hidden text-xs text-ink-300 sm:block">Healthcare operations dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-ink-100 bg-ink-50 px-3 py-1.5 text-xs text-ink-400 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Connected
            </div>
            <UserMenu />
          </div>
        </header>

        <TopNav open={navOpen} onClose={() => setNavOpen(false)} />
      </div>

      <main className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4 pt-2 lg:px-6 lg:pb-6 lg:pt-2">
        <div className="w-full animate-fade-in">
          <Routes>
              <Route path="/" element={<DashboardRedirect />} />
              <Route path="/dashboard/admin" element={<AdminDashboard />} />
              <Route path="/dashboard/reception" element={<ReceptionDashboard />} />
              <Route path="/dashboard/doctor" element={<DoctorDashboard />} />
              <Route path="/master/medication" element={<Medication />} />
              <Route path="/master/medication-list" element={<MedicationList />} />
              <Route path="/master/test-master" element={<TestMaster />} />
              <Route path="/coming-up/letter-pad-prescription" element={<LetterPadPrescription />} />
              <Route path="/master/user" element={<UserMaster />} />
              <Route path="/master/menu-access" element={<MenuAccess />} />
              <Route path="/master/clinic-details" element={<ClinicDetails />} />
              <Route path="/registration/employee" element={<Employee />} />
              <Route path="/registration/employee-list" element={<EmployeeList />} />
              <Route path="/registration/patient" element={<Patient />} />
              <Route path="/registration/patient-list" element={<PatientList />} />
              <Route path="/confirm/search" element={<ConfirmSearch />} />
              <Route path="/confirm/list" element={<ConfirmList />} />
              <Route path="/confirm/vital-sign" element={<VitalSign />} />
              <Route path="/confirm/vital-sign-list" element={<VitalSignList />} />
              <Route path="/confirm/prescription" element={<Prescription />} />
              <Route path="/confirm/prescription-print" element={<PrescriptionPrint />} />
              <Route path="/reports/patient-list" element={<ReportPatientList />} />
              <Route path="/reports/medical-history" element={<ReportMedicalHistory />} />
              <Route path="/reports/prescriptions" element={<ReportPrescriptions />} />
              <Route path="/reports/patient-records" element={<PatientRecords />} />
              <Route path="/reports/date-wise-visit-list" element={<ReportVisitList />} />
              <Route path="/reports/follow-up-patients" element={<FollowUpPatients />} />
              <Route path="/billing/patient-bill" element={<BillingPatientBill />} />
              <Route path="/billing/month-wise" element={<BillingMonthWise />} />
              <Route path="/billing/custom" element={<BillingCustom />} />
              <Route path="/pharmacy/supplier" element={<Supplier />} />
              <Route path="/pharmacy/item" element={<Item />} />
              <Route path="/pharmacy/item-list" element={<ItemList />} />
              <Route path="/pharmacy/item-list-new" element={<ItemListNew />} />
              <Route path="/pharmacy/stock" element={<Stock />} />
              <Route path="/pharmacy/stock-inward" element={<StockInward />} />
              <Route path="/pharmacy/stock-inward-list" element={<StockInwardList />} />
              <Route path="/pharmacy/vendor-master" element={<VendorMaster />} />
              <Route path="/pharmacy/vendor-list" element={<VendorList />} />
              <Route path="/pharmacy/purchase-master" element={<PurchaseMaster />} />
              <Route path="/pharmacy/purchase-master-list" element={<PurchaseMasterList />} />
              <Route path="/pharmacy/purchase-invoice" element={<PurchaseInvoice />} />
              <Route path="/pharmacy/purchase-invoice-list" element={<PurchaseInvoiceList />} />
              <Route path="/pharmacy/purchase-return" element={<PurchaseReturn />} />
              <Route path="/pharmacy/purchase-return-list" element={<PurchaseReturnList />} />
              <Route path="/pharmacy/sales-billing" element={<SalesBilling />} />
              <Route path="/pharmacy/sales-billing-list" element={<SalesBillingList />} />
              <Route path="/pharmacy/sales-return" element={<SalesReturn />} />
              <Route path="/pharmacy/stock-report" element={<StockReport />} />
              <Route path="/pharmacy/vendor-payments" element={<VendorPayments />} />
            </Routes>
          </div>
        </main>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, user } = useAuth();
  const appName = useAppName();
  if (!isAuthenticated) return <Login appName={appName} />;
  // A Patient login gets its own minimal shell, never the staff Sidebar/Routes —
  // an unconfigured MenuAccess user would otherwise default to seeing every screen.
  if (user?.role === 'Patient') return <PatientPortal appName={appName} />;
  return <AppLayout appName={appName} />;
}
