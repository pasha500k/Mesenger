import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

const ChatSettings = ({
  chatId,
  partner,
  preferences,
  loading,
  onRename,
  onToggleNotifications,
  notificationsSupported,
  notificationPermission,
  onRequestPermission,
  onGenerateInvite,
  generatingInvite,
  inviteInfo,
}) => {
  const [titleDraft, setTitleDraft] = useState(preferences.customTitle || '');
  const [copyStatus, setCopyStatus] = useState(null);
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    setTitleDraft(preferences.customTitle || '');
  }, [preferences.customTitle]);

  useEffect(() => {
    if (!copyStatus) return;
    const id = setTimeout(() => setCopyStatus(null), 1500);
    return () => clearTimeout(id);
  }, [copyStatus]);

  const normalizedTitle = useMemo(() => titleDraft.trim(), [titleDraft]);
  const inviteLink = inviteInfo?.link || null;
  const inviteError = inviteInfo?.error || null;
  const inviteExpiresAt = inviteInfo?.expiresAt || null;

  const handleRenameSubmit = async (event) => {
    event.preventDefault();
    if (!normalizedTitle && !preferences.customTitle) {
      return;
    }
    if (normalizedTitle === (preferences.customTitle?.trim() || '')) {
      return;
    }
    setRenameBusy(true);
    try {
      await onRename(normalizedTitle);
    } finally {
      setRenameBusy(false);
    }
  };

  const handleNotificationsToggle = async () => {
    await onToggleNotifications(!preferences.notificationsEnabled);
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    try {
      if (!navigator?.clipboard) {
        setCopyStatus('Буфер обмена недоступен');
        return;
      }
      await navigator.clipboard.writeText(inviteLink);
      setCopyStatus('Ссылка скопирована');
    } catch (err) {
      console.error('Copy invite error', err);
      setCopyStatus('Не удалось скопировать');
    }
  };

  return (
    <div className="space-y-6 text-sm text-slate-100">
      <header className="space-y-1">
        <h3 className="text-base font-semibold">Настройки беседы</h3>
        <p className="text-xs text-slate-400">
          Управляйте названием, уведомлениями и приглашениями для чата {chatId}.
        </p>
        {partner?.username && (
          <p className="text-xs text-slate-400">Собеседник: {partner.username}</p>
        )}
      </header>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-white">Название</h4>
        <form onSubmit={handleRenameSubmit} className="flex flex-col gap-2">
          <input
            type="text"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            placeholder="Введите своё название чата"
            disabled={loading || renameBusy}
            className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            maxLength={80}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading || renameBusy}
              className="px-4 py-2 rounded-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              Сохранить
            </button>
            {preferences.customTitle && (
              <button
                type="button"
                disabled={loading || renameBusy}
                onClick={async () => {
                  setRenameBusy(true);
                  try {
                    setTitleDraft('');
                    await onRename('');
                  } finally {
                    setRenameBusy(false);
                  }
                }}
                className="px-3 py-2 rounded-full border border-white/10 hover:border-white/40 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                Сбросить
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-white">Уведомления</h4>
        {!notificationsSupported ? (
          <p className="text-xs text-amber-300">
            Уведомления не поддерживаются в этом браузере.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span>
                {preferences.notificationsEnabled ? 'Уведомления включены' : 'Уведомления выключены'}
              </span>
              <button
                type="button"
                onClick={handleNotificationsToggle}
                className={`px-4 py-2 rounded-full transition ${
                  preferences.notificationsEnabled
                    ? 'bg-emerald-500 hover:bg-emerald-400'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {preferences.notificationsEnabled ? 'Выключить' : 'Включить'}
              </button>
            </div>
            {notificationPermission !== 'granted' && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                Браузер блокирует уведомления.{' '}
                <button
                  type="button"
                  onClick={onRequestPermission}
                  className="underline underline-offset-2"
                >
                  Разрешить уведомления
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-white">Приглашение в чат</h4>
        <p className="text-xs text-slate-400">
          Сгенерируйте ссылку, чтобы быстро пригласить собеседника. После перехода он сможет
          открыть диалог с вами.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onGenerateInvite}
            disabled={generatingInvite || loading}
            className="px-4 py-2 rounded-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {generatingInvite ? 'Создание...' : 'Получить ссылку'}
          </button>
          {copyStatus && <span className="text-xs text-emerald-300">{copyStatus}</span>}
        </div>
        {inviteError && <p className="text-xs text-rose-300">{inviteError}</p>}
        {inviteLink && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="flex flex-col gap-2">
              <code className="text-xs break-words text-slate-200">{inviteLink}</code>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition"
                >
                  Скопировать
                </button>
                {inviteExpiresAt && (
                  <span className="text-[11px] text-slate-300">
                    Действует до {new Date(inviteExpiresAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

ChatSettings.propTypes = {
  chatId: PropTypes.string.isRequired,
  partner: PropTypes.shape({
    username: PropTypes.string.isRequired,
  }),
  preferences: PropTypes.shape({
    customTitle: PropTypes.string,
    notificationsEnabled: PropTypes.bool,
  }).isRequired,
  loading: PropTypes.bool,
  onRename: PropTypes.func.isRequired,
  onToggleNotifications: PropTypes.func.isRequired,
  notificationsSupported: PropTypes.bool.isRequired,
  notificationPermission: PropTypes.string.isRequired,
  onRequestPermission: PropTypes.func.isRequired,
  onGenerateInvite: PropTypes.func.isRequired,
  generatingInvite: PropTypes.bool,
  inviteInfo: PropTypes.shape({
    link: PropTypes.string,
    error: PropTypes.string,
    expiresAt: PropTypes.number,
  }),
};

ChatSettings.defaultProps = {
  partner: null,
  loading: false,
  generatingInvite: false,
  inviteInfo: null,
};

export default ChatSettings;
