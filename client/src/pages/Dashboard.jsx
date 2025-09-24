import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import { useAuthStore } from '../store/useAuthStore';

const Dashboard = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/rooms', { method: 'GET' });
      setRooms(data.rooms || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleCreateRoom = async () => {
    const newRoomId = crypto.randomUUID().slice(0, 8).toUpperCase();
    setCreating(true);
    setError(null);
    try {
      await apiRequest('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ roomId: newRoomId }),
      });
      navigate(`/room/${newRoomId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = (event) => {
    event.preventDefault();
    if (!roomId.trim()) return;
    navigate(`/room/${roomId.trim()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold">Привет, {user?.username}!</h1>
            <p className="text-slate-300 mt-2">
              Создайте новую комнату или присоединитесь к существующей, чтобы начать совместную работу.
            </p>
          </div>
          <button
            onClick={logout}
            className="self-start md:self-auto px-5 py-2.5 rounded-full border border-white/20 hover:border-white/60 transition"
          >
            Выйти
          </button>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
              <h2 className="text-xl font-semibold mb-4">Быстрый старт</h2>
              <div className="flex flex-col md:flex-row gap-4">
                <button
                  onClick={handleCreateRoom}
                  disabled={creating}
                  className="flex-1 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-400 transition font-semibold shadow-lg shadow-indigo-500/40 disabled:opacity-60"
                >
                  {creating ? 'Создаем комнату...' : 'Создать новую комнату'}
                </button>
                <form className="flex-1 flex gap-2" onSubmit={handleJoinRoom}>
                  <input
                    type="text"
                    placeholder="Введите код комнаты"
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value.toUpperCase())}
                    className="flex-1 px-4 py-3 rounded-2xl bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                  />
                  <button
                    type="submit"
                    className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 transition font-semibold"
                  >
                    Войти
                  </button>
                </form>
              </div>
              {error && <p className="text-sm text-rose-300 mt-4">{error}</p>}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Недавние комнаты</h2>
                <button
                  onClick={fetchRooms}
                  className="text-sm text-indigo-300 hover:text-indigo-200 transition"
                >
                  Обновить
                </button>
              </div>
              {loading ? (
                <p className="text-slate-300">Загружаем список комнат...</p>
              ) : rooms.length === 0 ? (
                <p className="text-slate-400">У вас пока нет комнат. Создайте первую!</p>
              ) : (
                <ul className="space-y-3">
                  {rooms.map((room) => (
                    <li
                      key={room.id}
                      className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-900/60 border border-white/10"
                    >
                      <div>
                        <p className="font-medium">Комната {room.id}</p>
                        <p className="text-xs text-slate-400">Создана {new Date(room.created_at).toLocaleString()}</p>
                      </div>
                      <button
                        onClick={() => navigate(`/room/${room.id}`)}
                        className="px-4 py-2 rounded-full bg-indigo-500/80 hover:bg-indigo-400 transition text-sm"
                      >
                        Открыть
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-6">
              <h3 className="text-lg font-semibold mb-3">Советы по видеовстречам</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>Используйте гарнитуру для лучшего звука.</li>
                <li>Включите доску, когда нужно визуализировать идеи.</li>
                <li>Отправляйте документы напрямую в комнату.</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-lg font-semibold mb-3">Поделиться комнатой</h3>
              <p className="text-sm text-slate-300 mb-4">
                Сообщите коллегам код комнаты — они смогут подключиться и работать вместе с вами.
              </p>
              <div className="text-xs text-slate-400">
                Аккаунты защищены токенами, а комнаты активируются только после вашего входа.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
