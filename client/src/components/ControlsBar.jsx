import PropTypes from 'prop-types';

const ControlsBar = ({
  callActive,
  onStartCall,
  onEndCall,
  onRequestBoard,
  onCloseBoard,
  boardOpen,
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
          onClick={onEndCall}
          className="px-6 py-3 rounded-full bg-rose-500 hover:bg-rose-400 transition font-semibold text-white shadow-lg"
        >
          Завершить звонок
        </button>
        {!boardOpen ? (
          <button
            onClick={onRequestBoard}
            className="px-6 py-3 rounded-full bg-indigo-500 hover:bg-indigo-400 transition font-semibold text-white shadow-lg"
          >
            Открыть доску
          </button>
        ) : (
          <button
            onClick={onCloseBoard}
            className="px-6 py-3 rounded-full bg-amber-500 hover:bg-amber-400 transition font-semibold text-white shadow-lg"
          >
            Скрыть доску
          </button>
        )}
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
  boardOpen: PropTypes.bool.isRequired,
  disabled: PropTypes.bool,
};

ControlsBar.defaultProps = {
  disabled: false,
};
