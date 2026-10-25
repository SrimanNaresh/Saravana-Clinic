import { useState } from 'react';
import { Printer, Search, CalendarRange } from 'lucide-react';
import { PageHeader, CardHeader, Toast } from '../../components/ui.jsx';
import BillingReportTable from '../../components/BillingReportTable.jsx';
import { useToast } from '../../hooks/useToast.js';
import { billingApi } from '../../api/client.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function BillingCustom() {
  const { toast, show } = useToast();
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!fromDate || !toDate) return show('Select both From and To dates', 'error');
    if (fromDate > toDate) return show('From date must be before To date', 'error');
    setLoading(true);
    try {
      setData(await billingApi.report(fromDate, toDate));
    } catch (err) {
      show(err.response?.data?.error || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Billing - Custom"
        actions={data && <button className="btn-secondary no-print" onClick={() => window.print()}><Printer size={16} /> Print</button>}
      />

      <div className="card">
        <CardHeader icon={CalendarRange} title="Select Date Range" subtitle="Choose a From and To date, then generate the report" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <div>
            <label className="label">From Date</label>
            <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="label">To Date</label>
            <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <button className="btn-primary w-full" onClick={generate} disabled={loading}>
              <Search size={16} /> {loading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      <BillingReportTable loading={loading} data={data} />

      <Toast toast={toast} />
    </div>
  );
}
