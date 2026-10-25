import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { menuAccessApi } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from '../components/ui.jsx';

// Sends a freshly logged-in user straight to whichever role dashboard their
// Menu Access grants them (Admin first, then Reception, then Doctor); an
// unconfigured user (sees everything) lands on Admin by default.
export default function DashboardRedirect() {
  const { user } = useAuth();
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (!user?.userId) return;
    menuAccessApi.get(user.userId).then((rows) => {
      const map = new Map(rows.map((r) => [r.MenuKey, r.AccessLevel]));
      const granted = (key) => map.size === 0 || ['Full', 'View'].includes(map.get(key));
      if (granted('dashboard.admin')) setTarget('/dashboard/admin');
      else if (granted('dashboard.reception')) setTarget('/dashboard/reception');
      else if (granted('dashboard.doctor')) setTarget('/dashboard/doctor');
      else setTarget('/dashboard/admin');
    }).catch(() => setTarget('/dashboard/admin'));
  }, [user?.userId]);

  if (!target) return <Spinner />;
  return <Navigate to={target} replace />;
}
