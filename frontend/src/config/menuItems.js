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
      // Laid out as the Pharmacy spec's parts (Item, Vendor, Purchase / Order,
      // Stock In, Return, Sales, Report), each with Master / List. Keys are
      // unchanged so existing Menu Access grants still apply. Supplier,
      // Purchase Invoice, Sales Return, the old Stock screen, the old Purchase
      // Master, Bulk Itemlist, Stock Inward and Purchase Return are off the menu
      // but their routes still work.
      {
        label: 'Item',
        submenu: [
          { key: 'pharmacy.item', label: 'Master', to: '/pharmacy/item' },
          { key: 'pharmacy.item-list', label: 'List', to: '/pharmacy/item-list' },
          { key: 'pharmacy.item-list-new', label: 'Bulk Update', to: '/pharmacy/item-bulk-update' },
        ],
      },
      {
        label: 'Vendor',
        submenu: [
          { key: 'pharmacy.vendor-master', label: 'Master', to: '/pharmacy/vendor-master' },
          { key: 'pharmacy.vendor-list', label: 'List', to: '/pharmacy/vendor-list' },
        ],
      },
      {
        label: 'Purchase / Order',
        submenu: [
          { key: 'pharmacy.purchase-master', label: 'Master', to: '/pharmacy/purchase-order' },
          { key: 'pharmacy.purchase-master-list', label: 'List', to: '/pharmacy/purchase-order-list' },
        ],
      },
      {
        label: 'Stock In',
        submenu: [
          { key: 'pharmacy.stock-inward', label: 'Master', to: '/pharmacy/stock-in' },
          { key: 'pharmacy.stock-inward-list', label: 'List', to: '/pharmacy/stock-in-list' },
        ],
      },
      {
        label: 'Return',
        submenu: [
          { key: 'pharmacy.purchase-return', label: 'Master', to: '/pharmacy/return' },
          { key: 'pharmacy.purchase-return-list', label: 'List', to: '/pharmacy/return-list' },
        ],
      },
      {
        label: 'Sales',
        submenu: [
          { key: 'pharmacy.sales-billing', label: 'Master', to: '/pharmacy/sales-billing' },
          { key: 'pharmacy.sales-billing-list', label: 'List', to: '/pharmacy/sales-billing-list' },
        ],
      },
      {
        label: 'Report',
        submenu: [
          { key: 'pharmacy.stock-report', label: 'Stock Report', to: '/pharmacy/stock-report' },
          { key: 'pharmacy.vendor-payments', label: 'Vendor Payments', to: '/pharmacy/vendor-payments' },
        ],
      },
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
