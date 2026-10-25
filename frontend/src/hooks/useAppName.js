import { useEffect } from 'react';

// Fixed product brand name (sidebar, login screen, browser tab) — this does
// NOT come from Clinic Master's App Name field. That field only controls the
// PWA install/download name (see backend/src/routes/manifest.js), by design.
const APP_NAME = 'Ayush Pro';

export function useAppName() {
  useEffect(() => { document.title = APP_NAME; }, []);
  return APP_NAME;
}
