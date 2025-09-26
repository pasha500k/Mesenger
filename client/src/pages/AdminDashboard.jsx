import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import LoadingScreen from '../components/LoadingScreen';

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString();
  } catch (err) {
    return '—';
  }
};

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const fetchDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await apiRequest('/api/admin/dashboard', { method: 'GET' });
      setData(response);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const activeCalls = useMemo(
    () => (Array.isArray(data?.activeCalls) ? data.activeCalls : []),
    [data]
  );
  const overview = data?.overview || {};
  const recentUsers = data?.recentUsers || [];
  const recentChats = data?.recentChats || [];

  const liveChatIds = useMemo(() => new Set(activeCalls.map((call) => call.chatId)), [activeCalls]);

  if (loading && !data) {
    return <LoadingScreen message="Загружаем панель администратора..." />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Панель администратора</h1>
            <p className="text-sm text-slate-300 mt-2">
              Следите за активными звонками, просматривайте свежие регистрации и быстро подключайтесь к любому чату в
              режиме скрытого наблюдателя.
            </p>
            {error && <p className="text-sm text-rose-300 mt-2">{error}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 rounded-full border border-white/20 hover:border-white/60 transition text-sm"
            >
              Вернуться в пользовательский режим
            </button>
            <button
              onClick={fetchDashboard}
              disabled={refreshing}
              className="px-4 py-2 rounded-full bg-indigo-500 hover:bg-indigo-400 transition text-sm font-semibold disabled:opacity-60"
            >
              {refreshing ? 'Обновляем...' : 'Обновить данные'}
            </button>
          </div>
        </header>

        <section className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-3xl bg-white/5 border border-white/10 p-5">
            <p className="text-sm text-slate-300">Пользователи</p>
            <p className="text-3xl font-semibold mt-2">{overview.totalUsers ?? '—'}</p>
          </div>
          <div className="rounded-3xl bg-white/5 border border-white/10 p-5">
            <p className="text-sm text-slate-300">Чаты</p>
            <p className="text-3xl font-semibold mt-2">{overview.totalChats ?? '—'}</p>
          </div>
          <div className="rounded-3xl bg-white/5 border border-white/10 p-5">
            <p className="text-sm text-slate-300">Активные звонки</p>
            <p className="text-3xl font-semibold mt-2">{overview.activeCalls ?? 0}</p>
          </div>
          <div className="rounded-3xl bg-white/5 border border-white/10 p-5">
            <p className="text-sm text-slate-300">Открытые доски</p>
            <p className="text-3xl font-semibold mt-2">{overview.boardsOpen ?? 0}</p>
          </div>
        </section>

        <section className="grid xl:grid-cols-2 gap-6">
          <div className="rounded-3xl bg-white/5 border border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Активные звонки</h2>
              <span className="text-xs text-slate-300">Автообновление каждые 15 секунд</span>
            </div>
            {activeCalls.length === 0 ? (
              <p className="text-sm text-slate-400">Сейчас нет активных звонков.</p>
            ) : (
              <ul className="space-y-3">
                {activeCalls.map((call) => (
                  <li key={call.chatId} className="rounded-2xl bg-slate-900/60 border border-white/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-300">Чат {call.chatId}</p>
                        <p className="text-xs text-slate-400">
                          Участники: {call.participants.filter((participant) => !participant.hidden).length} &bull; Наблюдатели:{' '}
                          {call.observers}
                        </p>
                        {call.boardEnabled && <p className="text-xs text-emerald-300 mt-1">Доска активна</p>}
                      </div>
                      <button
                        onClick={() => navigate(`/chat/${call.chatId}?stealth=1`, {
                          state: { stealthObserver: true, fromAdmin: true },
                        })}
                        className="px-4 py-2 rounded-full bg-indigo-500 hover:bg-indigo-400 transition text-sm font-semibold"
                      >
                        Подключиться скрытно
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-5 space-y-4">
            <h2 className="text-xl font-semibold">Новые пользователи</h2>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-slate-400">Регистраций пока не было.</p>
            ) : (
              <ul className="space-y-2">
                {recentUsers.map((user) => (
                  <li key={user.id} className="flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/60 border border-white/10 text-sm">
                    <span className="font-medium">{user.username}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(user.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-white/5 border border-white/10 p-5 space-y-4">
          <h2 className="text-xl font-semibold">Недавние диалоги</h2>
          {recentChats.length === 0 ? (
            <p className="text-sm text-slate-400">Диалогов пока нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-slate-300">
                    <th className="py-2 pr-4 font-medium">Чат</th>
                    <th className="py-2 pr-4 font-medium">Участники</th>
                    <th className="py-2 pr-4 font-medium">Последняя активность</th>
                    <th className="py-2 pr-4 font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {recentChats.map((chat) => (
                    <tr key={chat.id} className="border-t border-white/10">
                      <td className="py-3 pr-4 font-mono text-xs text-slate-300">{chat.id}</td>
                      <td className="py-3 pr-4 text-slate-200">{chat.users.join(' • ')}</td>
                      <td className="py-3 pr-4 text-slate-400">{formatDateTime(chat.last_activity || chat.created_at)}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => navigate(`/chat/${chat.id}?stealth=1`, {
                              state: { stealthObserver: true, fromAdmin: true },
                            })}
                            className="px-3 py-1.5 rounded-full bg-indigo-500/80 hover:bg-indigo-400 transition text-xs font-semibold"
                          >
                            Наблюдать
                          </button>
                          {liveChatIds.has(chat.id) && (
                            <span className="px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-semibold">
                              В эфире
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
