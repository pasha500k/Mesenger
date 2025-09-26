import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const ChatPanel = ({ messages, onSendMessage, onSendAudioMessage, disabled }) => {
  const [value, setValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
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

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const handleStartRecording = async () => {
    if (disabled) return;
    setRecordingError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setRecordingError('Браузер не поддерживает запись аудио.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (blob.size === 0) {
          setRecordingTime(0);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          if (typeof result === 'string') {
            onSendAudioMessage({
              dataUrl: result,
              duration: recordingTime,
            });
          }
          setRecordingTime(0);
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error(err);
      setRecordingError('Не удалось получить доступ к микрофону.');
    }
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  useEffect(
    () => () => {
      stopRecording();
    },
    []
  );

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((message) => (
          <div key={message.id} className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-indigo-300 font-medium">{message.sender}</span>
              <span className="text-slate-400">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {message.type === 'audio' ? (
              <div className="flex items-center gap-3">
                <audio controls src={message.audioUrl} className="w-full" preload="metadata" />
                {message.metadata?.duration ? (
                  <span className="text-xs text-slate-400 min-w-[48px] text-right">
                    {Math.round(message.metadata.duration)} сек.
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-100 whitespace-pre-wrap break-words">{message.message}</p>
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-slate-400 text-center mt-6">
            Здесь сохраняется история сообщений — начните беседу или отправьте голосовое сообщение.
          </p>
        )}
      </div>
      {recordingError && <p className="text-xs text-rose-300 mt-2">{recordingError}</p>}
      <div className="mt-4 flex flex-col gap-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
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
        <div className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
          <div className="text-xs text-slate-300">
            {isRecording ? `Запись... ${recordingTime} c` : 'Отправьте голосовое сообщение'}
          </div>
          {!isRecording ? (
            <button
              type="button"
              onClick={handleStartRecording}
              disabled={disabled}
              className="px-3 py-1.5 rounded-full bg-emerald-500/80 hover:bg-emerald-400 transition text-xs font-semibold disabled:opacity-60"
            >
              Начать запись
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopRecording}
              className="px-3 py-1.5 rounded-full bg-rose-500/80 hover:bg-rose-400 transition text-xs font-semibold"
            >
              Остановить
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;

ChatPanel.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      sender: PropTypes.string.isRequired,
      message: PropTypes.string,
      type: PropTypes.string.isRequired,
      metadata: PropTypes.object,
      audioUrl: PropTypes.string,
      timestamp: PropTypes.number.isRequired,
    })
  ).isRequired,
  onSendMessage: PropTypes.func.isRequired,
  onSendAudioMessage: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

ChatPanel.defaultProps = {
  disabled: false,
};
