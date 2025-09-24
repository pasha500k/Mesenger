import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

const MediaStreamType = typeof MediaStream === 'undefined' ? PropTypes.any : PropTypes.instanceOf(MediaStream);

const VideoTile = ({ stream, label, muted = false, showPlaceholder = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative rounded-3xl overflow-hidden bg-slate-900/80 border border-white/10 shadow-2xl">
      {showPlaceholder ? (
        <div className="w-full h-48 flex items-center justify-center text-slate-300 bg-slate-950/60">
          Камера выключена
        </div>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-sm text-white">
        {label}
      </div>
    </div>
  );
};

VideoTile.propTypes = {
  stream: MediaStreamType,
  label: PropTypes.string.isRequired,
  muted: PropTypes.bool,
  showPlaceholder: PropTypes.bool,
};

VideoTile.defaultProps = {
  stream: undefined,
  muted: false,
  showPlaceholder: false,
};

const VideoGrid = ({ localStream, remoteStreams, callActive, localCameraOff }) => {
  if (!callActive) {
    return (
      <div className="h-full rounded-3xl border border-dashed border-white/20 flex items-center justify-center text-slate-400 bg-white/5">
        Чтобы увидеть участников, начните видеозвонок.
      </div>
    );
  }

  const streams = [];
  if (localStream || localCameraOff) {
    streams.push({ id: 'local', stream: localStream, label: 'Вы', muted: true, showPlaceholder: localCameraOff });
  }
  remoteStreams.forEach((item) => {
    streams.push({ id: item.id, stream: item.stream, label: item.label, muted: false });
  });

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: streams.length > 1 ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr' }}>
      {streams.map((item) => (
        <VideoTile
          key={item.id}
          stream={item.stream}
          label={item.label}
          muted={item.muted}
          showPlaceholder={item.showPlaceholder}
        />
      ))}
      {streams.length === 0 && (
        <div className="h-full rounded-3xl border border-dashed border-white/20 flex items-center justify-center text-slate-400 bg-white/5">
          Ожидаем подключения других участников...
        </div>
      )}
    </div>
  );
};

export default VideoGrid;

VideoGrid.propTypes = {
  localStream: MediaStreamType,
  remoteStreams: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      stream: MediaStreamType,
      label: PropTypes.string.isRequired,
      muted: PropTypes.bool,
      showPlaceholder: PropTypes.bool,
    })
  ).isRequired,
  callActive: PropTypes.bool.isRequired,
  localCameraOff: PropTypes.bool,
};

VideoGrid.defaultProps = {
  localStream: undefined,
  localCameraOff: false,
};
