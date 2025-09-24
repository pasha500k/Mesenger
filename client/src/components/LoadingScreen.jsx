import PropTypes from 'prop-types';

const LoadingScreen = ({ message }) => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 text-white">
    <div className="text-center animate-pulse">
      <div className="w-16 h-16 border-4 border-indigo-400 border-t-transparent rounded-full mx-auto mb-6 animate-spin" />
      <p className="text-lg font-medium tracking-wide">{message}</p>
    </div>
  </div>
);

LoadingScreen.propTypes = {
  message: PropTypes.string,
};

LoadingScreen.defaultProps = {
  message: 'Загрузка...',
};

export default LoadingScreen;
