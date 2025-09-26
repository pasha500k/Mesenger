import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuthStore } from './store/useAuthStore';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import AuthPage from './pages/AuthPage';
import AdminDashboard from './pages/AdminDashboard';
import LoadingScreen from './components/LoadingScreen';
import './App.css';

const RequireAuth = ({ children }) => {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'loading' || status === 'idle') {
    return <LoadingScreen message="Проверяем вашу учетную запись..." />;
  }

  if (status !== 'authenticated') {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return children;
};

RequireAuth.propTypes = {
  children: PropTypes.node.isRequired,
};

const RequireAdmin = ({ children }) => {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (status !== 'authenticated') {
    return <LoadingScreen message="Проверяем права доступа..." />;
  }

  if (!user || user.username !== 'admin') {
    return <Navigate to="/dashboard" state={{ from: location }} replace />;
  }

  return children;
};

RequireAdmin.propTypes = {
  children: PropTypes.node.isRequired,
};

const App = () => {
  const status = useAuthStore((state) => state.status);
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (status === 'idle') {
    return <LoadingScreen message="Загружаем приложение..." />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/chat/:chatId"
        element={
          <RequireAuth>
            <Chat />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
