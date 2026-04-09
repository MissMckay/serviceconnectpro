import { createRoot } from 'react-dom/client'
import { AuthProvider } from "./context/AuthContext";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { prewarmPublicData } from "./firebase/firestoreServices";
import './index.css'
import App from './App.jsx'

if (typeof window !== "undefined") {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => {
      prewarmPublicData().catch(() => null);
    }, { timeout: 1200 });
  } else {
    window.setTimeout(() => {
      prewarmPublicData().catch(() => null);
    }, 250);
  }
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </AppErrorBoundary>,
);

