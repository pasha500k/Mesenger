import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config';
import { useAuthStore } from '../store/useAuthStore';
import ChatPanel from '../components/ChatPanel';
import FileSharing from '../components/FileSharing';
import ParticipantsList from '../components/ParticipantsList';
import ControlsBar from '../components/ControlsBar';
import VideoGrid from '../components/VideoGrid';
import Whiteboard from '../components/Whiteboard';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [callActive, setCallActive] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardStrokes, setBoardStrokes] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [socketReady, setSocketReady] = useState(false);
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const participantsRef = useRef([]);
  const localStreamRef = useRef(null);
  const selfIdRef = useRef(null);

  const cleanupConnections = useCallback(() => {
    peersRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch (err) {
        console.error(err);
      }
    });
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    setRemoteStreams([]);
  }, []);

  const stopLocalMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
  }, []);

  const createPeerConnection = useCallback(
    (peerId, isInitiator) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(peerId, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
      }

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          remoteStreamsRef.current.set(peerId, {
            id: peerId,
            stream,
            label:
              participantsRef.current.find((participant) => participant.id === peerId)?.displayName || 'Участник',
          });
          setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('signal', {
            roomId,
            target: peerId,
            data: { type: 'candidate', candidate: event.candidate },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
          remoteStreamsRef.current.delete(peerId);
          setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
          peersRef.current.delete(peerId);
        }
      };

      if (isInitiator) {
        const createOffer = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current?.emit('signal', { roomId, target: peerId, data: offer });
          } catch (err) {
            console.error('Offer error', err);
          }
        };
        createOffer();
      }

      return pc;
    },
    [roomId]
  );

  const handleSignal = useCallback(
    async ({ sender, data }) => {
      if (!sender || !data) return;
      let peerConnection = peersRef.current.get(sender);
      if (!peerConnection) {
        peerConnection = createPeerConnection(sender, false);
      }
      try {
        if (data.type === 'offer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socketRef.current?.emit('signal', { roomId, target: sender, data: answer });
        } else if (data.type === 'answer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        } else if (data.type === 'candidate' && data.candidate) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (err) {
        console.error('Signal error', err);
      }
    },
    [createPeerConnection, roomId]
  );

  useEffect(() => {
    participantsRef.current = participants;
    remoteStreamsRef.current.forEach((streamInfo, peerId) => {
      const participant = participants.find((item) => item.id === peerId);
      if (participant) {
        streamInfo.label = participant.displayName;
      }
    });
    setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
  }, [participants]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      selfIdRef.current = socket.id;
      setSocketReady(true);
      socket.emit('joinRoom', { roomId, displayName: user?.username });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket error', err);
      setError('Не удалось подключиться к комнате. Попробуйте обновить страницу.');
    });

    socket.on('participantsUpdate', (payload) => {
      setParticipants(payload);
    });

    socket.on('chatMessage', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('callStatus', ({ callActive: active, boardEnabled }) => {
      setCallActive(active);
      setBoardOpen(boardEnabled);
      if (!active) {
        stopLocalMedia();
        cleanupConnections();
        setBoardStrokes([]);
      }
      if (!boardEnabled) {
        setBoardStrokes([]);
      }
    });

    socket.on('boardOpened', () => {
      setBoardOpen(true);
    });

    socket.on('boardClosed', () => {
      setBoardOpen(false);
      setBoardStrokes([]);
    });

    socket.on('boardDraw', (stroke) => {
      setBoardStrokes((prev) => [...prev, stroke]);
    });

    socket.on('boardClear', () => {
      setBoardStrokes([]);
    });

    socket.on('signal', handleSignal);

    socket.on('fileShare', (file) => {
      setFiles((prev) => [...prev, file]);
    });

    return () => {
      socket.emit('leaveRoom', { roomId });
      socket.removeAllListeners();
      socket.disconnect();
      stopLocalMedia();
      cleanupConnections();
    };
  }, [cleanupConnections, handleSignal, roomId, stopLocalMedia, user?.username]);

  useEffect(() => {
    if (!callActive) return;
    const hasLocalStream = Boolean(localStreamRef.current);
    participants
      .filter((participant) => participant.id !== selfIdRef.current)
      .forEach((participant) => {
        if (!peersRef.current.has(participant.id)) {
          createPeerConnection(participant.id, hasLocalStream);
        }
      });

    peersRef.current.forEach((_, peerId) => {
      if (!participants.some((participant) => participant.id === peerId)) {
        peersRef.current.get(peerId)?.close();
        peersRef.current.delete(peerId);
        remoteStreamsRef.current.delete(peerId);
        setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
      }
    });
  }, [callActive, createPeerConnection, participants]);

  const handleSendMessage = (message) => {
    if (!socketRef.current) return;
    socketRef.current.emit('chatMessage', { roomId, message });
  };

  const handleSendFile = (file) => {
    if (!socketRef.current) return;
    socketRef.current.emit('fileShare', { roomId, ...file });
  };

  const handleStartCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      socketRef.current?.emit('startCall', { roomId });
    } catch (err) {
      console.error(err);
      setError('Не удалось получить доступ к камере или микрофону.');
    }
  };

  const handleEndCall = () => {
    socketRef.current?.emit('endCall', { roomId });
    stopLocalMedia();
    cleanupConnections();
    setBoardStrokes([]);
  };

  const handleRequestBoard = () => {
    socketRef.current?.emit('requestBoard', { roomId });
  };

  const handleCloseBoard = () => {
    socketRef.current?.emit('closeBoard', { roomId });
  };

  const handleDrawStroke = (stroke) => {
    setBoardStrokes((prev) => [...prev, stroke]);
    socketRef.current?.emit('boardDraw', { roomId, stroke });
  };

  const handleClearBoard = () => {
    setBoardStrokes([]);
    socketRef.current?.emit('boardClear', { roomId });
  };

  const handleLeave = () => {
    handleEndCall();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Комната {roomId}</h1>
            <p className="text-sm text-slate-400">Пригласите коллег, отправив им этот код комнаты.</p>
            {error && <p className="text-sm text-rose-300 mt-2">{error}</p>}
          </div>
          <button
            onClick={handleLeave}
            className="self-start md:self-auto px-5 py-2.5 rounded-full border border-white/20 hover:border-white/60 transition"
          >
            Выйти из комнаты
          </button>
        </header>

        <ControlsBar
          callActive={callActive}
          onStartCall={handleStartCall}
          onEndCall={handleEndCall}
          onRequestBoard={handleRequestBoard}
          onCloseBoard={handleCloseBoard}
          boardOpen={boardOpen}
          disabled={!socketReady}
        />

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 min-h-[320px]">
              <VideoGrid localStream={localStream} remoteStreams={remoteStreams} callActive={callActive} />
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
              <ChatPanel messages={messages} onSendMessage={handleSendMessage} disabled={!socketReady} />
            </div>
          </div>
          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
              <ParticipantsList participants={participants} selfId={selfIdRef.current} />
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
              <FileSharing files={files} onSendFile={handleSendFile} disabled={!callActive} />
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
              <Whiteboard
                strokes={boardStrokes}
                onDrawStroke={handleDrawStroke}
                onClear={handleClearBoard}
                disabled={!boardOpen || !callActive}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Room;
