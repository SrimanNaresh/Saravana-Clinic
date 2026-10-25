import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import MyRecords from './MyRecords.jsx';

// Deliberately its own top-level shell, not <AppLayout>/<Sidebar> — a Patient
// login must never render the staff menu system, which (for an unconfigured
// MenuAccess user) defaults to showing every screen in the app.
export default function PatientPortal({ appName }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-100 bg-white/85 px-4 py-3 backdrop-blur-md lg:px-6">
        <img src="/favicon.png" alt="" className="h-9 w-9 rounded-lg" />
        <div className="flex-1">
          <p className="font-display text-lg font-bold tracking-tight text-brand-800">{appName}</p>
          <p className="text-xs text-ink-400">Patient Portal</p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-ink-700">{user?.username}</p>
          <p className="text-xs text-ink-400">Signed in</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          <LogOut size={15} /> Logout
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="mx-auto w-full max-w-3xl animate-fade-in">
          <MyRecords />
        </div>
      </main>
    </div>
  );
}
