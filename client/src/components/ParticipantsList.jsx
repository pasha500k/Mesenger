import PropTypes from 'prop-types';

const ParticipantsList = ({ participants, selfId }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold text-white">Участники</h3>
    <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
      {participants.map((participant) => (
        <li
          key={participant.id}
          className={`px-4 py-2 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-sm ${
            participant.id === selfId ? 'ring-1 ring-indigo-400/50' : ''
          }`}
        >
          <span className="text-slate-100">{participant.displayName}</span>
          {participant.id === selfId && <span className="text-xs text-indigo-300">Вы</span>}
        </li>
      ))}
      {participants.length === 0 && <li className="text-xs text-slate-400">Пока никого нет.</li>}
    </ul>
  </div>
);

export default ParticipantsList;

ParticipantsList.propTypes = {
  participants: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      displayName: PropTypes.string.isRequired,
    })
  ).isRequired,
  selfId: PropTypes.string,
};

ParticipantsList.defaultProps = {
  selfId: undefined,
};
