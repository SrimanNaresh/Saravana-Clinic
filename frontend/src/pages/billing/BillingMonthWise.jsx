import { useState, useMemo } from 'react';
import { Printer, CalendarDays } from 'lucide-react';
import { PageHeader, CardHeader, Toast } from '../../components/ui.jsx';
import BillingReportTable from '../../components/BillingReportTable.jsx';
import { useToast } from '../../hooks/useToast.js';
import { billingApi } from '../../api/client.js';

// Last 24 months, newest first — "January 2026" style labels.
const monthOptions = () => {
  const now = new Date();
  const opts = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
};

const monthRange = (value) => {
  const [y, m] = value.split('-').map(Number);
  const from = `${value}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${value}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
};

export default function BillingMonthWise() {
  const { toast, show } = useToast();
  const options = useMemo(monthOptions, []);
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const onSelect = async (value) => {
    setMonth(value);
    if (!value) return setData(null);
    const { from, to } = monthRange(value);
    setLoading(true);
    try {
      setData(await billingApi.report(from, to));
    } catch (err) {
      show(err.response?.data?.error || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Billing - Month Wise"
        actions={data && <button className="btn-secondary no-print" onClick={() => window.print()}><Printer size={16} /> Print</button>}
      />

      <div className="card">
        <CardHeader icon={CalendarDays} title="Select Month" subtitle="Choose a month to generate the report" />
        <div className="max-w-xs">
          <label className="label">Month</label>
          <select className="input" value={month} onChange={(e) => onSelect(e.target.value)}>
            <option value="">Select month</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <BillingReportTable loading={loading} data={data} />

      <Toast toast={toast} />
    </div>
  );
}
