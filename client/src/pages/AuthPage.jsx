import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

const AuthPage = () => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(form);
      } else {
        await register(form);
      }
      const redirect = location.state?.from?.pathname || '/dashboard';
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
    setForm({ username: '', password: '' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md backdrop-blur-xl bg-white/10 border border-white/10 rounded-3xl shadow-2xl p-8">
        <h1 className="text-2xl font-semibold text-white text-center mb-2">Lynxoria</h1>
        <p className="text-center text-slate-300 mb-6">
          {mode === 'login'
            ? 'Войдите, чтобы продолжить общение и звонки'
            : 'Создайте аккаунт Lynxoria за пару секунд'}
        </p>
        <div className="flex mb-6 rounded-full bg-white/10 p-1">
          <button
            className={`flex-1 py-2 rounded-full text-sm font-semibold transition ${
              mode === 'login' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-300'
            }`}
            onClick={() => switchMode('login')}
            type="button"
          >
            Войти
          </button>
          <button
            className={`flex-1 py-2 rounded-full text-sm font-semibold transition ${
              mode === 'register' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-300'
            }`}
            onClick={() => switchMode('register')}
            type="button"
          >
            Регистрация
          </button>
        </div>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm text-slate-200 mb-2">Имя пользователя</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value.trimStart() })}
              className="w-full px-4 py-3 rounded-2xl bg-slate-900/60 border border-white/10 text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              placeholder="Введите имя"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-200 mb-2">Пароль</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              className="w-full px-4 py-3 rounded-2xl bg-slate-900/60 border border-white/10 text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              placeholder="Минимум 6 символов"
            />
          </div>
          {error && <p className="text-sm text-rose-300 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-400 transition font-semibold text-white shadow-lg shadow-indigo-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Обрабатываем...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthPage;
