import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext';
import { ToastProvider } from './components/ToastContext';
import LoginPage      from './pages/LoginPage';
import RepDashboard   from './pages/RepDashboard';
import CountEntry     from './pages/CountEntry';
import AdminDashboard from './pages/AdminDashboard';
import RequestAccount from './pages/RequestAccount';
import './index.css';

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  if (loading) return (
    <div className="loading-center" style={{ minHeight: '100vh' }}>
      <div className="spinner" />
      <span>Loading...</span>
    </div>
  );

  if (!user || !profile) return <LoginPage />;

  const isAdmin   = profile.role === 'admin';
  const isManager = profile.role === 'manager';

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" />} />
      <Route path="/"
        element={isAdmin || isManager ? <AdminDashboard /> : <RepDashboard />}
      />
      <Route path="/count/:countId" element={<CountEntry />} />
      <Route path="/request-account" element={<RequestAccount />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
