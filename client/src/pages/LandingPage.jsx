import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

const LandingPage = () => {
  const status = useAuthStore((state) => state.status);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-transparent" />
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold tracking-tight">
            NovaCollab
          </Link>
          <nav className="flex items-center gap-4">
            <a href="#features" className="text-sm text-slate-200 hover:text-white transition">
              Возможности
            </a>
            <a href="#security" className="text-sm text-slate-200 hover:text-white transition">
              Безопасность
            </a>
            <Link
              to={status === 'authenticated' ? '/dashboard' : '/auth'}
              className="px-4 py-2 rounded-full bg-indigo-500 hover:bg-indigo-400 transition text-sm font-semibold"
            >
              {status === 'authenticated' ? 'Перейти в панель' : 'Войти'}
            </Link>
          </nav>
        </div>
        <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-10 items-center relative">
          <div>
            <p className="uppercase tracking-[0.3em] text-indigo-300 text-xs font-semibold mb-4">
              Единственное пространство для совместной работы
            </p>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
              Встречи, доска и чат в одном приложении без лишних усилий
            </h1>
            <p className="text-lg text-slate-300 mb-8 leading-relaxed">
              Запускайте приватные чаты между пользователями, подключайтесь к защищенным видеозвонкам, делитесь идеями на
              векторной доске и отправляйте файлы команде. Всё работает прямо из браузера.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to={status === 'authenticated' ? '/dashboard' : '/auth'}
                className="px-6 py-3 rounded-full bg-indigo-500 hover:bg-indigo-400 transition font-semibold shadow-lg shadow-indigo-500/40"
              >
                Начать бесплатно
              </Link>
              <a
                href="#features"
                className="px-6 py-3 rounded-full border border-white/20 hover:border-white/60 transition font-semibold"
              >
                Узнать больше
              </a>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-2xl">
            <div className="grid gap-4 text-sm text-slate-200">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10">
                <h3 className="text-lg font-semibold mb-1">Видеозвонки 4K</h3>
                <p>Мгновенное подключение без скачивания приложений — просто пригласите коллег.</p>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10">
                <h3 className="text-lg font-semibold mb-1">Векторная доска</h3>
                <p>Рисуйте и комментируйте вместе, доска доступна только во время звонка по запросу участников.</p>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-white/10">
                <h3 className="text-lg font-semibold mb-1">Мгновенный чат и файлы</h3>
                <p>Обменивайтесь сообщениями, видео и документами с шифрованием в реальном времени.</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold mb-8">Почему NovaCollab?</h2>
        <div className="grid md:grid-cols-3 gap-8 text-slate-300">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-xl font-semibold mb-3 text-white">Совместная работа</h3>
            <p>
              Интерактивная доска, чат и обмен файлами работают синхронно, так что вы никогда не теряете контекст обсуждения.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-xl font-semibold mb-3 text-white">Комфортный дизайн</h3>
            <p>
              Тёмная цветовая схема, аккуратные тени и крупная типографика делают интерфейс современным и уютным.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-xl font-semibold mb-3 text-white">Безопасность</h3>
            <p id="security">
              Авторизация по токену, защищённые соединения и контроль доступа к доске только во время активного звонка.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} NovaCollab. Построено для гибридных команд.
      </footer>
    </div>
  );
};

export default LandingPage;
