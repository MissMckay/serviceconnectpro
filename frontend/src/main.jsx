import { createRoot } from 'react-dom/client'
import { AuthProvider } from "./context/AuthContext";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </AppErrorBoundary>,
);

