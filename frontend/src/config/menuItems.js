// Master list of assignable menu items (leaf pages), grouped for display.
// MenuKey is the stable identifier stored in the MenuAccess table.
// `to` is the route path — the Sidebar builds its nav from this single source
// of truth so it can filter items by the signed-in user's granted access.
export const MENU_GROUPS = [
  {
    group: 'Dashboard',
    items: [
      { key: 'dashboard.admin', label: 'Admin Dashboard', to: '/dashboard/admin' },
      { key: 'dashboard.reception', label: 'Reception Dashboard', to: '/dashboard/reception' },
      { key: 'dashboard.doctor', label: 'Doctor Dashboard', to: '/dashboard/doctor' },
    ],
  },
  {
    group: 'Settings',
    items: [
      { key: 'settings.user', label: 'User Master', to: '/master/user' },
      { key: 'settings.menu-access', label: 'Menu Access', to: '/master/menu-access' },
    ],
  },
  {
    group: 'Registration',
    items: [
      { key: 'registration.employee', label: 'Employee', to: '/registration/employee' },
      { key: 'registration.employee-list', label: 'Employee List', to: '/registration/employee-list' },
      { key: 'registration.patient', label: 'Patient', to: '/registration/patient' },
      { key: 'registration.patient-list', label: 'Patient List', to: '/registration/patient-list' },
    ],
  },
  {
    group: 'Pharmacy',
    items: [
      { key: 'pharmacy.supplier', label: 'Supplier', to: '/pharmacy/supplier' },
      { key: 'pharmacy.item', label: 'Item', to: '/pharmacy/item' },
      { key: 'pharmacy.item-list', label: 'Item List', to: '/pharmacy/item-list' },
      { key: 'pharmacy.item-list-new', label: 'ItemList new', to: '/pharmacy/item-list-new' },
      {
        label: 'Vendor',
        submenu: [
          { key: 'pharmacy.vendor-master', label: 'Vendor Master', to: '/pharmacy/vendor-master' },
          { key: 'pharmacy.vendor-list', label: 'Vendor List', to: '/pharmacy/vendor-list' },
        ],
      },
      {
        label: 'Purchase',
        submenu: [
          { key: 'pharmacy.purchase-master', label: 'Purchase Master', to: '/pharmacy/purchase-master' },
          { key: 'pharmacy.purchase-master-list', label: 'Purchase Master List', to: '/pharmacy/purchase-master-list' },
          { key: 'pharmacy.purchase-invoice',label: 'Invoice', to: '/pharmacy/purchase-invoice' },
          { key: 'pharmacy.purchase-invoice-list', label: 'Invoice List', to: '/pharmacy/purchase-invoice-list' },
          { key: 'pharmacy.purchase-return', label: 'Return', to: '/pharmacy/purchase-return' },
          { key: 'pharmacy.purchase-return-list', label: 'Return List', to: '/pharmacy/purchase-return-list' },
        ],
      },
      {
        label: 'Sales',
        submenu: [
          { key: 'pharmacy.sales-billing', label: 'Billing', to: '/pharmacy/sales-billing' },
          { key: 'pharmacy.sales-billing-list', label: 'Billing List', to: '/pharmacy/sales-billing-list' },
          { key: 'pharmacy.sales-return', label: 'Return', to: '/pharmacy/sales-return' },
        ],
      },
      { key: 'pharmacy.stock', label: 'Stock', to: '/pharmacy/stock' },
    ],
  },
  {
    // Consultation, Patient Queue, Communication, Billing and Coming Up's
    // all live nested under Clinic rather than as their own top-level
    // groups — each is a submenu entry here, and Consultation keeps its own
    // Medication/Lab submenus nested a level deeper still, so the menu tree
    // is 3 levels deep in places. Rendering (TopNav) and permissions
    // (MenuAccess) both walk this recursively, so any depth works, not just
    // these specific levels.
    group: 'Clinic',
    items: [
      { key: 'settings.clinic-master', label: 'Clinic Master', to: '/master/clinic-details' },
      {
        label: 'Consultation',
        submenu: [
          { key: 'confirm.prescription', label: "Doctor's", to: '/confirm/prescription' },
          { key: 'confirm.prescription-print', label: 'Prescription Preview', to: '/confirm/prescription-print' },
          { key: 'reports.medical-history', label: 'Patient Medical History', to: '/reports/medical-history' },
          {
            label: 'Medication',
            submenu: [
              { key: 'master.medication', label: 'Medication', to: '/master/medication' },
              { key: 'master.medication-list', label: 'Medication List', to: '/master/medication-list' },
            ],
          },
          {
            label: 'Lab',
            submenu: [
              { key: 'master.test-master', label: 'Test Master', to: '/master/test-master' },
            ],
          },
        ],
      },
      {
        label: 'Patient Queue',
        submenu: [
          { key: 'confirm.search', label: 'Confirm & Search', to: '/confirm/search' },
          { key: 'confirm.list', label: 'Confirm List', to: '/confirm/list' },
          { key: 'confirm.vital-sign', label: 'Vital Sign', to: '/confirm/vital-sign' },
          { key: 'confirm.vital-sign-list', label: 'Vital Sign List', to: '/confirm/vital-sign-list' },
        ],
      },
      {
        label: 'Communication',
        submenu: [
          { key: 'reports.follow-up-patients', label: 'Follow Up Patients', to: '/reports/follow-up-patients' },
        ],
      },
      {
        label: 'Billing',
        submenu: [
          { key: 'billing.patient-bill', label: 'Patient Bill', to: '/billing/patient-bill' },
          { key: 'billing.month-wise', label: 'Month Wise', to: '/billing/month-wise' },
          { key: 'billing.custom', label: 'Custom', to: '/billing/custom' },
        ],
      },
      {
        label: "Coming Up's",
        submenu: [
          { key: 'coming-up.letter-pad-prescription', label: 'Prescription for Your Letter Pad', to: '/coming-up/letter-pad-prescription' },
        ],
      },
    ],
  },
  {
    group: 'Reports',
    items: [
      { key: 'reports.patient-list', label: 'Patient List', to: '/reports/patient-list' },
      { key: 'reports.prescriptions', label: 'Patient Prescriptions', to: '/reports/prescriptions' },
      { key: 'reports.patient-records', label: 'Patient Records', to: '/reports/patient-records' },
      { key: 'reports.date-wise-visit-list', label: 'Date Wise Visit List', to: '/reports/date-wise-visit-list' },
    ],
  },
];

// A group's items can nest submenus to arbitrary depth (see Clinic above) —
// recurse all the way down so access checks/grants still see every real leaf.
function flattenLeaves(items, groupLabel) {
  return items.flatMap((it) =>
    it.submenu ? flattenLeaves(it.submenu, groupLabel) : [{ ...it, group: groupLabel }]
  );
}
export const ALL_MENU_ITEMS = MENU_GROUPS.flatMap((g) => flattenLeaves(g.items, g.group));

export const ACCESS_LEVELS = ['Full', 'View', 'No Access'];
