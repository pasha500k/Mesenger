import PropTypes from 'prop-types';

const ControlsBar = ({
  callActive,
  onStartCall,
  onEndCall,
  onRequestBoard,
  onCloseBoard,
  onToggleMic,
  onToggleCamera,
  boardOpen,
  micMuted,
  cameraOff,
  disabled,
}) => (
  <div className="flex flex-wrap gap-3 items-center justify-center py-4">
    {!callActive ? (
      <button
        onClick={onStartCall}
        disabled={disabled}
        className="px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 transition font-semibold text-white shadow-lg disabled:opacity-60"
      >
        Начать звонок
      </button>
    ) : (
      <>
        <button
          onClick={onToggleMic}
          className={`px-5 py-2.5 rounded-full font-semibold shadow-lg transition text-white ${
            micMuted ? 'bg-slate-700 hover:bg-slate-600' : 'bg-emerald-500 hover:bg-emerald-400'
          }`}
        >
          {micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        </button>
        <button
          onClick={onToggleCamera}
          className={`px-5 py-2.5 rounded-full font-semibold shadow-lg transition text-white ${
            cameraOff ? 'bg-slate-700 hover:bg-slate-600' : 'bg-sky-500 hover:bg-sky-400'
          }`}
        >
          {cameraOff ? 'Включить камеру' : 'Выключить камеру'}
        </button>
        {!boardOpen ? (
          <button
            onClick={onRequestBoard}
            className="px-5 py-2.5 rounded-full bg-indigo-500 hover:bg-indigo-400 transition font-semibold text-white shadow-lg"
          >
            Открыть доску
          </button>
        ) : (
          <button
            onClick={onCloseBoard}
            className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 transition font-semibold text-white shadow-lg"
          >
            Скрыть доску
          </button>
        )}
        <button
          onClick={onEndCall}
          className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-400 transition font-semibold text-white shadow-lg"
        >
          Завершить звонок
        </button>
      </>
    )}
  </div>
);

export default ControlsBar;

ControlsBar.propTypes = {
  callActive: PropTypes.bool.isRequired,
  onStartCall: PropTypes.func.isRequired,
  onEndCall: PropTypes.func.isRequired,
  onRequestBoard: PropTypes.func.isRequired,
  onCloseBoard: PropTypes.func.isRequired,
  onToggleMic: PropTypes.func.isRequired,
  onToggleCamera: PropTypes.func.isRequired,
  boardOpen: PropTypes.bool.isRequired,
  micMuted: PropTypes.bool.isRequired,
  cameraOff: PropTypes.bool.isRequired,
  disabled: PropTypes.bool,
};

ControlsBar.defaultProps = {
  disabled: false,
};
