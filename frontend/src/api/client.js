import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export function setAuthToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

// Let AuthContext react to an expired/invalid session from anywhere API calls happen.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) window.dispatchEvent(new Event('auth:unauthorized'));
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const medicationApi = {
  list: (search = '') => api.get('/medications', { params: { search } }).then((r) => r.data),
  get: (id) => api.get(`/medications/${id}`).then((r) => r.data),
  create: (data) => api.post('/medications', data).then((r) => r.data),
  update: (id, data) => api.put(`/medications/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/medications/${id}`).then((r) => r.data),
  bulk: (rows) => api.post('/medications/bulk', { rows }).then((r) => r.data),
};

export const labTestApi = {
  list: (search = '') => api.get('/lab-tests', { params: { search } }).then((r) => r.data),
  nextId: () => api.get('/lab-tests/next-id').then((r) => r.data),
  create: (data) => api.post('/lab-tests', data).then((r) => r.data),
  update: (id, data) => api.put(`/lab-tests/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/lab-tests/${id}`).then((r) => r.data),
};

export const employeeApi = {
  list: (search = '') => api.get('/employees', { params: { search } }).then((r) => r.data),
  get: (id) => api.get(`/employees/${id}`).then((r) => r.data),
  create: (data) => api.post('/employees', data).then((r) => r.data),
  update: (id, data) => api.put(`/employees/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/employees/${id}`).then((r) => r.data),
  bulk: (rows) => api.post('/employees/bulk', { rows }).then((r) => r.data),
};

export const patientApi = {
  list: (params = {}) => api.get('/patients', { params }).then((r) => r.data),
  nextId: () => api.get('/patients/next-id').then((r) => r.data),
  get: (id) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (data) => api.post('/patients', data).then((r) => r.data),
  update: (id, data) => api.put(`/patients/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/patients/${id}`).then((r) => r.data),
  bulk: (rows) => api.post('/patients/bulk', { rows }).then((r) => r.data),
};

export const vitalApi = {
  list: (params = {}) => api.get('/vitals', { params }).then((r) => r.data),
  get: (id) => api.get(`/vitals/${id}`).then((r) => r.data),
  create: (data) => api.post('/vitals', data).then((r) => r.data),
  update: (id, data) => api.put(`/vitals/${id}`, data).then((r) => r.data),
};

export const prescriptionApi = {
  list: (params = {}) => api.get('/prescriptions', { params }).then((r) => r.data),
  history: (patientId) => api.get(`/prescriptions/history/${patientId}`).then((r) => r.data),
  followUp: (params = {}) => api.get('/prescriptions/follow-up', { params }).then((r) => r.data),
  updateNextVisitDate: (id, nextVisitDate) => api.put(`/prescriptions/${id}/next-visit-date`, { nextVisitDate }).then((r) => r.data),
  create: (data) => api.post('/prescriptions', data).then((r) => r.data),
  update: (id, data) => api.put(`/prescriptions/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/prescriptions/${id}`).then((r) => r.data),
};

export const confirmApi = {
  list: (date, status) =>
    api.get('/confirmations', { params: { ...(date ? { date } : {}), ...(status ? { status } : {}) } }).then((r) => r.data),
  create: (data) => api.post('/confirmations', data).then((r) => r.data),
  examine: (patientId) => api.post('/confirmations/examine', { patientId }).then((r) => r.data),
  remove: (id) => api.delete(`/confirmations/${id}`).then((r) => r.data),
};

export const userApi = {
  list: (search = '') => api.get('/users', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/users', data).then((r) => r.data),
  update: (id, data) => api.put(`/users/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`).then((r) => r.data),
};

export const menuAccessApi = {
  get: (userId) => api.get(`/menu-access/${userId}`).then((r) => r.data),
  save: (userId, items) => api.put(`/menu-access/${userId}`, { items }).then((r) => r.data),
};

export const clinicApi = {
  get: () => api.get('/clinic').then((r) => r.data),
  save: (data) => api.put('/clinic', data).then((r) => r.data),
  remove: () => api.delete('/clinic').then((r) => r.data),
  saveLetterPad: (data) => api.put('/clinic/letter-pad', data).then((r) => r.data),
};

export const pharmacyApi = {
  list: (search = '') => api.get('/pharmacy', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/pharmacy', data).then((r) => r.data),
  update: (id, data) => api.put(`/pharmacy/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/pharmacy/${id}`).then((r) => r.data),
};

export const supplierApi = {
  list: (search = '') => api.get('/suppliers', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/suppliers', data).then((r) => r.data),
  update: (id, data) => api.put(`/suppliers/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/suppliers/${id}`).then((r) => r.data),
};

export const vendorApi = {
  list: (search = '') => api.get('/vendors', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/vendors', data).then((r) => r.data),
  update: (id, data) => api.put(`/vendors/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/vendors/${id}`).then((r) => r.data),
};

export const purchaseMasterApi = {
  list: (search = '') => api.get('/purchase-masters', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/purchase-masters', data).then((r) => r.data),
  update: (id, data) => api.put(`/purchase-masters/${id}`, data).then((r) => r.data),
  bulk: (rows) => api.post('/purchase-masters/bulk', { rows }).then((r) => r.data),
  createMany: (vendorId, lines) => api.post('/purchase-masters/multi', { vendorId, lines }).then((r) => r.data),
  // Renames (or, with a blank `to`, clears) a Qty / price / GST / discount value on every entry using it.
  replaceValue: (field, from, to) => api.post('/purchase-masters/replace-value', { field, from, to }).then((r) => r.data),
  remove: (id) => api.delete(`/purchase-masters/${id}`).then((r) => r.data),
};

export const stockInwardApi = {
  list: (search = '') => api.get('/stock-inwards', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/stock-inwards', data).then((r) => r.data),
  update: (id, data) => api.put(`/stock-inwards/${id}`, data).then((r) => r.data),
  bulk: (rows) => api.post('/stock-inwards/bulk', { rows }).then((r) => r.data),
  remove: (id) => api.delete(`/stock-inwards/${id}`).then((r) => r.data),
};

export const genericNameApi = {
  list: (search = '') => api.get('/generic-names', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/generic-names', data).then((r) => r.data),
  update: (id, data) => api.put(`/generic-names/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/generic-names/${id}`).then((r) => r.data),
};

export const manufacturerApi = {
  list: (search = '') => api.get('/manufacturers', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/manufacturers', data).then((r) => r.data),
  update: (id, data) => api.put(`/manufacturers/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/manufacturers/${id}`).then((r) => r.data),
};

export const itemTypeApi = {
  list: (search = '') => api.get('/item-types', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/item-types', data).then((r) => r.data),
  update: (id, data) => api.put(`/item-types/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/item-types/${id}`).then((r) => r.data),
};

export const unitApi = {
  list: (search = '') => api.get('/units', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/units', data).then((r) => r.data),
  update: (id, data) => api.put(`/units/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/units/${id}`).then((r) => r.data),
};

export const pharmacyItemApi = {
  list: (search = '') => api.get('/pharmacy-items', { params: { search } }).then((r) => r.data),
  create: (data) => api.post('/pharmacy-items', data).then((r) => r.data),
  update: (id, data) => api.put(`/pharmacy-items/${id}`, data).then((r) => r.data),
  // Changes only the template-keyed fields given, e.g. { GenericName, Rack }.
  patch: (id, fields) => api.patch(`/pharmacy-items/${id}`, fields).then((r) => r.data),
  // Renames (or, with a blank `to`, clears) a HSN / GST / Rack / Box No / Pack value on every item using it.
  replaceValue: (field, from, to) => api.post('/pharmacy-items/replace-value', { field, from, to }).then((r) => r.data),
  remove: (id) => api.delete(`/pharmacy-items/${id}`).then((r) => r.data),
  bulk: (rows) => api.post('/pharmacy-items/bulk', { rows }).then((r) => r.data),
};

export const pharmacyStockApi = {
  list: (search = '') => api.get('/pharmacy-stock', { params: { search } }).then((r) => r.data),
  batches: (itemId) => api.get(`/pharmacy-stock/${itemId}/batches`).then((r) => r.data),
};

// Purchase Invoice/Return and Sales Billing/Return share this exact shape
// (list, line items, create, remove) on the backend — see
// routes/_transactionFactory.js — so the client side mirrors that here too.
function transactionApi(basePath) {
  return {
    list: (search = '') => api.get(`/${basePath}`, { params: { search } }).then((r) => r.data),
    items: (id) => api.get(`/${basePath}/${id}/items`).then((r) => r.data),
    create: (data) => api.post(`/${basePath}`, data).then((r) => r.data),
    update: (id, data) => api.put(`/${basePath}/${id}`, data).then((r) => r.data),
    remove: (id) => api.delete(`/${basePath}/${id}`).then((r) => r.data),
  };
}
export const purchaseInvoiceApi = transactionApi('purchase-invoices');
export const purchaseReturnApi = transactionApi('purchase-returns');
export const salesBillingApi = transactionApi('sales-billings');
export const salesReturnApi = transactionApi('sales-returns');

export const reportApi = {
  patients: (from, to) => api.get('/reports/patients', { params: from && to ? { from, to } : {} }).then((r) => r.data),
  medicalHistory: (patientId) => api.get(`/reports/medical-history/${patientId}`).then((r) => r.data),
  visits: (from, to) => api.get('/reports/visits', { params: { from, to } }).then((r) => r.data),
};

export const billingApi = {
  report: (from, to) => api.get('/billing', { params: { from, to } }).then((r) => r.data),
  patients: (date) => api.get('/billing/patients', { params: { date } }).then((r) => r.data),
  saveFees: (patientId, data) => api.put(`/billing/patients/${patientId}`, data).then((r) => r.data),
};

export const patientDocumentApi = {
  // patientId omitted for a Patient-role login — the backend infers their own.
  list: (patientId) => api.get('/patient-documents', { params: patientId ? { patientId } : {} }).then((r) => r.data),
  upload: (formData) => api.post('/patient-documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  remove: (id) => api.delete(`/patient-documents/${id}`).then((r) => r.data),
  download: async (id, filename) => {
    const res = await api.get(`/patient-documents/${id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  // For in-page preview (not a save-file download). Caller must
  // URL.revokeObjectURL(url) once done with it.
  getBlobUrl: async (id) => {
    const res = await api.get(`/patient-documents/${id}/download`, { responseType: 'blob' });
    return { url: URL.createObjectURL(res.data), mimeType: res.data.type };
  },
};

export default api;
