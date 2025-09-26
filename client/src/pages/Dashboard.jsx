import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import { useAuthStore } from '../store/useAuthStore';

const Dashboard = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [startingChat, setStartingChat] = useState(false);
  const [error, setError] = useState(null);

  const fetchChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const data = await apiRequest('/api/chats', { method: 'GET' });
      setChats(data.chats || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const handler = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const data = await apiRequest(`/api/users/search?query=${encodeURIComponent(query.trim())}`, {
          method: 'GET',
          signal: controller.signal,
        });
        setSearchResults(data.users || []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSearchError(err.message);
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(handler);
      setSearching(false);
    };
  }, [query]);

  const handleStartChat = async (username) => {
    if (!username || startingChat) return;
    setStartingChat(true);
    setError(null);
    try {
      const data = await apiRequest('/api/chats', {
        method: 'POST',
        body: JSON.stringify({ username }),
      });
      if (data.chat?.id) {
        await fetchChats();
        setQuery('');
        setSearchResults([]);
        navigate(`/chat/${data.chat.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setStartingChat(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold">Привет, {user?.username}!</h1>
            <p className="text-slate-300 mt-2">
              Ваши чаты синхронизируются и сохраняют историю сообщений. При необходимости начните звонок прямо из диалога.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {user?.username === 'admin' && (
              <button
                onClick={() => navigate('/admin')}
                className="self-start md:self-auto px-5 py-2.5 rounded-full bg-indigo-500/80 hover:bg-indigo-400 transition"
              >
                Открыть админ-панель
              </button>
            )}
            <button
              onClick={logout}
              className="self-start md:self-auto px-5 py-2.5 rounded-full border border-white/20 hover:border-white/60 transition"
            >
              Выйти
            </button>
          </div>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Найти собеседника</h2>
                <p className="text-sm text-slate-300 mt-2">
                  Начните диалог, найдя пользователя по логину. Можно вводить часть логина, чтобы увидеть совпадения.
                </p>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Введите логин пользователя"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                />
                {searching && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-indigo-300">Поиск...</span>
                )}
              </div>
              {searchError && <p className="text-sm text-rose-300">{searchError}</p>}
              {query.trim() && !searching && searchResults.length === 0 && !searchError && (
                <p className="text-sm text-slate-400">Не найдено пользователей с таким логином.</p>
              )}
              {searchResults.length > 0 && (
                <ul className="space-y-3">
                  {searchResults.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-900/60 border border-white/10"
                    >
                      <div>
                        <p className="font-semibold">{item.username}</p>
                        <p className="text-xs text-slate-400 mt-1">Личная переписка</p>
                      </div>
                      <button
                        onClick={() => handleStartChat(item.username)}
                        disabled={startingChat}
                        className="px-4 py-2 rounded-full bg-indigo-500/80 hover:bg-indigo-400 transition text-sm disabled:opacity-60"
                      >
                        {startingChat ? 'Создаем...' : 'Начать чат'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && <p className="text-sm text-rose-300">{error}</p>}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Недавние чаты</h2>
                <button
                  onClick={fetchChats}
                  className="text-sm text-indigo-300 hover:text-indigo-200 transition"
                >
                  Обновить
                </button>
              </div>
              {loadingChats ? (
                <p className="text-slate-300">Загружаем список диалогов...</p>
              ) : chats.length === 0 ? (
                <p className="text-slate-400">У вас пока нет диалогов. Создайте первый чат!</p>
              ) : (
                <ul className="space-y-3">
                  {chats.map((chat) => (
                    <li
                      key={chat.id}
                      className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-900/60 border border-white/10"
                    >
                      <div>
                        <p className="font-medium">
                          {chat.title || (chat.partner?.username ? `Чат с ${chat.partner.username}` : `Чат ${chat.id}`)}
                        </p>
                        {chat.last_sender ? (
                          <p className="text-xs text-slate-300 mt-1">
                            <span className="font-semibold text-indigo-200">{chat.last_sender}</span>:{' '}
                            {(chat.last_message || 'нет сообщений').slice(0, 80)}
                            {chat.last_message && chat.last_message.length > 80 ? '…' : ''}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 mt-1">Сообщений пока нет</p>
                        )}
                        <p className="text-[11px] text-slate-500 mt-1">
                          Обновлено{' '}
                          {chat.last_timestamp
                            ? new Date(Number(chat.last_timestamp)).toLocaleString()
                            : chat.created_at
                            ? new Date(chat.created_at).toLocaleString()
                            : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(`/chat/${chat.id}`)}
                        className="px-4 py-2 rounded-full bg-indigo-500/80 hover:bg-indigo-400 transition text-sm"
                      >
                        Открыть чат
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
                <li>Отправляйте документы напрямую в чат.</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-lg font-semibold mb-3">Как начать общение</h3>
              <p className="text-sm text-slate-300 mb-4">
                Найдите коллегу по логину и отправьте первое сообщение. Из чата можно запустить звонок или поделиться файлами, когда это потребуется.
              </p>
              <div className="text-xs text-slate-400">
                Диалоги защищены авторизацией, а доступ к звонкам и доске открыт только по запросу участников.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
