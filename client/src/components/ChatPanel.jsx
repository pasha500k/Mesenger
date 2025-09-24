import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const ChatPanel = ({ messages, onSendMessage, disabled }) => {
  const [value, setValue] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!value.trim()) return;
    onSendMessage(value.trim());
    setValue('');
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((message) => (
          <div key={message.id} className="bg-white/5 border border-white/10 rounded-2xl p-3">
            <div className="text-xs text-indigo-300 mb-1">
              {message.sender}{' '}
              <span className="text-slate-400">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-sm text-slate-100 whitespace-pre-wrap break-words">{message.message}</p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-slate-400 text-center mt-6">Общайтесь здесь во время встречи.</p>
        )}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={disabled ? 'Чат недоступен' : 'Напишите сообщение...'}
          disabled={disabled}
          className="flex-1 px-3 py-2 rounded-2xl bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="px-4 py-2 rounded-2xl bg-indigo-500 hover:bg-indigo-400 transition text-sm font-semibold disabled:opacity-60"
        >
          Отправить
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;

ChatPanel.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      sender: PropTypes.string.isRequired,
      message: PropTypes.string.isRequired,
      timestamp: PropTypes.number.isRequired,
    })
  ).isRequired,
  onSendMessage: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

ChatPanel.defaultProps = {
  disabled: false,
};
