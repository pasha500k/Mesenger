import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SOCKET_URL, API_BASE_URL } from '../config';
import { useAuthStore } from '../store/useAuthStore';
import ChatPanel from '../components/ChatPanel';
import FileSharing from '../components/FileSharing';
import ParticipantsList from '../components/ParticipantsList';
import ControlsBar from '../components/ControlsBar';
import VideoGrid from '../components/VideoGrid';
import Whiteboard from '../components/Whiteboard';
import ChatSettings from '../components/ChatSettings';
import { apiRequest } from '../api';
import LoadingScreen from '../components/LoadingScreen';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const normalizeMessage = (payload, apiBaseUrl) => {
  if (!payload) return null;
  const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : Date.parse(payload.timestamp);
  let metadata = payload.metadata || null;
  if (metadata && typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (err) {
      metadata = null;
    }
  }
  const audioUrl = payload.audioUrl
    ? payload.audioUrl.startsWith('http')
      ? payload.audioUrl
      : `${apiBaseUrl}${payload.audioUrl}`
    : null;
  return {
    id: payload.id?.toString() || `${Date.now()}-${Math.random()}`,
    sender: payload.sender,
    type: payload.type || 'text',
    message: payload.message || '',
    metadata,
    audioUrl,
    timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
  };
};

const Chat = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [callActive, setCallActive] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardObjects, setBoardObjects] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [socketReady, setSocketReady] = useState(false);
  const [error, setError] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [chatInfo, setChatInfo] = useState(null);
  const [chatInfoError, setChatInfoError] = useState(null);
  const [loadingChat, setLoadingChat] = useState(true);
  const [preferences, setPreferences] = useState({ customTitle: null, notificationsEnabled: true });
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteInfo, setInviteInfo] = useState(null);
  const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;
  const [notificationPermission, setNotificationPermission] = useState(
    notificationsSupported ? Notification.permission : 'default'
  );

  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const participantsRef = useRef([]);
  const localStreamRef = useRef(null);
  const selfIdRef = useRef(null);
  const boardStateRef = useRef([]);

  const addTracksToPeer = useCallback((peerConnection, stream) => {
    if (!peerConnection || !stream) return;
    const senders = peerConnection.getSenders ? peerConnection.getSenders() : [];
    stream.getTracks().forEach((track) => {
      const existingSender = senders.find((sender) => sender.track && sender.track.kind === track.kind);
      if (existingSender) {
        existingSender.replaceTrack(track);
      } else {
        peerConnection.addTrack(track, stream);
      }
    });
  }, []);

  const attachStreamToPeers = useCallback(
    (stream) => {
      if (!stream) return;
      peersRef.current.forEach((peerConnection) => {
        addTracksToPeer(peerConnection, stream);
      });
    },
    [addTracksToPeer]
  );

  const updateBoardObjects = useCallback((updater) => {
    setBoardObjects((prev) => {
      const next = updater(prev);
      boardStateRef.current = next;
      return next;
    });
  }, []);

  const maybeNotify = useCallback(
    (message) => {
      if (!notificationsSupported) return;
      if (!preferences.notificationsEnabled) return;
      if (!message || message.sender === user?.username) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') return;
      if (notificationPermission !== 'granted') return;
      const fallbackTitle =
        chatInfo?.title ||
        (chatInfo?.partner?.username ? `Чат с ${chatInfo.partner.username}` : 'Новый чат');
      const title = preferences.customTitle || fallbackTitle;
      const body = message.type === 'audio' ? 'Голосовое сообщение' : message.message || 'Новое сообщение';
      try {
        new Notification(title, {
          body,
          tag: `chat-${chatId}`,
        });
      } catch (err) {
        console.error('Не удалось показать уведомление', err);
      }
    },
    [
      notificationsSupported,
      preferences.notificationsEnabled,
      preferences.customTitle,
      notificationPermission,
      chatInfo?.title,
      chatInfo?.partner?.username,
      chatId,
      user?.username,
    ]
  );

  const requestNotificationPermission = useCallback(async () => {
    if (!notificationsSupported) return notificationPermission;
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      return result;
    } catch (err) {
      console.error('Не удалось запросить разрешение на уведомления', err);
      return notificationPermission;
    }
  }, [notificationPermission, notificationsSupported]);

  const persistPreferences = useCallback(
    async (changes = {}) => {
      if (!chatId) return null;
      const payload = {
        customTitle:
          Object.prototype.hasOwnProperty.call(changes, 'customTitle')
            ? changes.customTitle
            : preferences.customTitle,
        notificationsEnabled:
          Object.prototype.hasOwnProperty.call(changes, 'notificationsEnabled')
            ? changes.notificationsEnabled
            : preferences.notificationsEnabled,
      };
      try {
        const data = await apiRequest(`/api/chats/${chatId}/preferences`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        const prefs = data?.preferences || {};
        setPreferences({
          customTitle: prefs.customTitle || null,
          notificationsEnabled:
            prefs.notificationsEnabled == null ? true : Boolean(prefs.notificationsEnabled),
        });
        setPreferencesError(null);
        return { success: true, preferences: prefs };
      } catch (err) {
        setPreferencesError(err.message);
        return { success: false, error: err.message };
      }
    },
    [chatId, preferences.customTitle, preferences.notificationsEnabled]
  );

  const handleRenameChat = useCallback(
    async (title) => {
      await persistPreferences({ customTitle: title });
    },
    [persistPreferences]
  );

  const handleNotificationsChange = useCallback(
    async (enabled) => {
      let nextValue = enabled;
      if (nextValue && notificationPermission !== 'granted') {
        const result = await requestNotificationPermission();
        if (result !== 'granted') {
          setPreferencesError('Уведомления заблокированы браузером. Разрешите их в настройках.');
          nextValue = false;
        }
      }
      await persistPreferences({ notificationsEnabled: nextValue });
    },
    [notificationPermission, persistPreferences, requestNotificationPermission]
  );

  const handleGenerateInvite = useCallback(async () => {
    if (!chatId) return;
    setGeneratingInvite(true);
    setInviteInfo((prev) => (prev ? { ...prev, error: null } : null));
    try {
      const data = await apiRequest(`/api/chats/${chatId}/invitations`, {
        method: 'POST',
      });
      const invite = data?.invite;
      if (invite) {
        const link =
          typeof window !== 'undefined'
            ? `${window.location.origin}/invite/${invite.id}`
            : `/invite/${invite.id}`;
        setInviteInfo({ ...invite, link, error: null });
      }
    } catch (err) {
      setInviteInfo({ error: err.message });
    } finally {
      setGeneratingInvite(false);
    }
  }, [chatId]);

  useEffect(() => {
    let active = true;
    setChatInfo(null);
    setChatInfoError(null);
    setLoadingChat(true);
    if (!chatId) {
      setChatInfoError('Чат не найден');
      setLoadingChat(false);
      return () => {};
    }
    apiRequest(`/api/chats/${chatId}`, { method: 'GET' })
      .then((data) => {
        if (!active) return;
        setChatInfo(data.chat || null);
        if (!data.chat) {
          setChatInfoError('Чат не найден или недоступен');
        }
      })
      .catch((err) => {
        if (!active) return;
        setChatInfoError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoadingChat(false);
      });
    return () => {
      active = false;
    };
  }, [chatId]);

  useEffect(() => {
    if (!chatId || loadingChat || chatInfoError) {
      return;
    }
    let active = true;
    setLoadingHistory(true);
    setHistoryError(null);
    setMessages([]);
    apiRequest(`/api/chats/${chatId}/messages`, { method: 'GET' })
      .then((data) => {
        if (!active) return;
        const normalized = (data.messages || [])
          .map((item) => normalizeMessage(item, API_BASE_URL))
          .filter(Boolean);
        setMessages(normalized);
      })
      .catch((err) => {
        if (!active) return;
        setHistoryError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [chatId, loadingChat, chatInfoError]);

  useEffect(() => {
    setInviteInfo(null);
  }, [chatId]);

  useEffect(() => {
    if (!chatId || loadingChat || chatInfoError) {
      return;
    }
    let active = true;
    setPreferencesLoading(true);
    setPreferencesError(null);
    apiRequest(`/api/chats/${chatId}/preferences`, { method: 'GET' })
      .then((data) => {
        if (!active) return;
        const prefs = data?.preferences || {};
        setPreferences({
          customTitle: prefs.customTitle || null,
          notificationsEnabled:
            prefs.notificationsEnabled == null ? true : Boolean(prefs.notificationsEnabled),
        });
      })
      .catch((err) => {
        if (!active) return;
        setPreferencesError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setPreferencesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [chatId, loadingChat, chatInfoError]);

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
    peersRef.current.forEach((peerConnection) => {
      if (!peerConnection.getSenders) return;
      peerConnection.getSenders().forEach((sender) => {
        try {
          if (sender.track) {
            sender.replaceTrack(null);
          }
        } catch (err) {
          console.error('Failed to clear sender track', err);
        }
      });
    });
    setLocalStream(null);
  }, []);

  const createPeerConnection = useCallback(
    (peerId, isInitiator) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc.__negotiating = false;
      peersRef.current.set(peerId, pc);

      if (localStreamRef.current) {
        addTracksToPeer(pc, localStreamRef.current);
      }

      pc.ontrack = (event) => {
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        if (stream) {
          const existing = remoteStreamsRef.current.get(peerId);
          if (existing && existing.stream) {
            if (!existing.stream.getTracks().some((track) => track.id === event.track.id)) {
              existing.stream.addTrack(event.track);
            }
            remoteStreamsRef.current.set(peerId, { ...existing });
          } else {
            remoteStreamsRef.current.set(peerId, {
              id: peerId,
              stream,
              label:
                participantsRef.current.find((participant) => participant.id === peerId)?.displayName || 'Участник',
            });
          }
          setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('signal', {
            chatId,
            target: peerId,
            data: { type: 'candidate', candidate: event.candidate },
          });
        }
      };

      pc.onnegotiationneeded = async () => {
        if (!localStreamRef.current) return;
        if (!socketRef.current) return;
        if (pc.signalingState !== 'stable') return;
        if (pc.__negotiating) return;
        pc.__negotiating = true;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current.emit('signal', { chatId, target: peerId, data: offer });
        } catch (err) {
          console.error('Negotiation error', err);
        } finally {
          pc.__negotiating = false;
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
            socketRef.current?.emit('signal', { chatId, target: peerId, data: offer });
          } catch (err) {
            console.error('Offer error', err);
          }
        };
        createOffer();
      }

      return pc;
    },
    [addTracksToPeer, chatId]
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
          socketRef.current?.emit('signal', { chatId, target: sender, data: answer });
        } else if (data.type === 'answer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        } else if (data.type === 'candidate' && data.candidate) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (err) {
        console.error('Signal error', err);
      }
    },
    [createPeerConnection, chatId]
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
    if (loadingChat || chatInfoError || !chatId) {
      return undefined;
    }
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      selfIdRef.current = socket.id;
      setSocketReady(true);
      socket.emit('joinChat', { chatId, displayName: user?.username });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket error', err);
      setError('Не удалось подключиться к комнате. Попробуйте обновить страницу.');
    });

    socket.on('participantsUpdate', (payload) => {
      setParticipants(payload);
    });

    socket.on('chatMessage', (message) => {
      const normalized = normalizeMessage(message, API_BASE_URL);
      if (normalized) {
        setMessages((prev) => [...prev, normalized]);
        maybeNotify(normalized);
      }
    });

    socket.on('callStatus', ({ callActive: active, boardEnabled }) => {
      setCallActive(active);
      setBoardOpen(boardEnabled);
      if (!active) {
        stopLocalMedia();
        cleanupConnections();
        updateBoardObjects(() => []);
        setMicMuted(false);
        setCameraOff(false);
      }
      if (!boardEnabled) {
        updateBoardObjects(() => []);
      }
    });

    socket.on('boardOpened', () => {
      setBoardOpen(true);
    });

    socket.on('boardClosed', () => {
      setBoardOpen(false);
      updateBoardObjects(() => []);
    });

    socket.on('boardAddObject', (object) => {
      if (!object || !object.id) return;
      updateBoardObjects((prev) => {
        const exists = prev.find((item) => item.id === object.id);
        if (exists) {
          return prev.map((item) => (item.id === object.id ? { ...item, ...object } : item));
        }
        return [...prev, JSON.parse(JSON.stringify(object))];
      });
    });

    socket.on('boardUpdateObject', ({ objectId, updates }) => {
      if (!objectId || !updates) return;
      updateBoardObjects((prev) =>
        prev.map((item) => (item.id === objectId ? { ...item, ...updates } : item))
      );
    });

    socket.on('boardRemoveObject', ({ objectId }) => {
      if (!objectId) return;
      updateBoardObjects((prev) => prev.filter((item) => item.id !== objectId));
    });

    socket.on('boardClear', () => {
      updateBoardObjects(() => []);
    });

    socket.on('boardSync', (boardState) => {
      if (boardState && Array.isArray(boardState.objects)) {
        const snapshot = JSON.parse(JSON.stringify(boardState.objects));
        updateBoardObjects(() => snapshot);
      }
    });

    socket.on('signal', handleSignal);

    socket.on('fileShare', (file) => {
      setFiles((prev) => [...prev, file]);
    });

    socket.on('disconnect', () => {
      setSocketReady(false);
    });

    return () => {
      socket.emit('leaveChat', { chatId });
      socket.removeAllListeners();
      socket.disconnect();
      stopLocalMedia();
      cleanupConnections();
    };
  }, [
    cleanupConnections,
    handleSignal,
    chatId,
    chatInfoError,
    loadingChat,
    stopLocalMedia,
    updateBoardObjects,
    maybeNotify,
    user?.username,
  ]);

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

  const lastBoardSyncRef = useRef(0);

  useEffect(() => {
    if (!socketReady || !boardOpen || !callActive || !chatId) {
      return;
    }
    const now = Date.now();
    if (now - lastBoardSyncRef.current < 1500) {
      return;
    }
    lastBoardSyncRef.current = now;
    socketRef.current?.emit('boardRequestSync', { chatId });
  }, [socketReady, boardOpen, callActive, chatId]);

  const handleSendMessage = (message) => {
    if (!socketRef.current) return;
    socketRef.current.emit('chatMessage', { chatId, message });
  };

  const handleSendAudioMessage = ({ dataUrl, duration }) => {
    if (!socketRef.current || !dataUrl) return;
    socketRef.current.emit('voiceMessage', { chatId, audioData: dataUrl, duration });
  };

  const handleSendFile = (file) => {
    if (!socketRef.current) return;
    socketRef.current.emit('fileShare', { chatId, ...file });
  };

  const handleStartCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      attachStreamToPeers(stream);
      socketRef.current?.emit('startCall', { chatId });
      setMicMuted(false);
      setCameraOff(false);
      participantsRef.current
        .filter((participant) => participant.id !== selfIdRef.current)
        .forEach((participant) => {
          if (!peersRef.current.has(participant.id)) {
            createPeerConnection(participant.id, true);
          }
        });
    } catch (err) {
      console.error(err);
      setError('Не удалось получить доступ к камере или микрофону.');
    }
  };

  const handleEndCall = () => {
    socketRef.current?.emit('endCall', { chatId });
    stopLocalMedia();
    cleanupConnections();
    setCallActive(false);
    setBoardOpen(false);
    updateBoardObjects(() => []);
    setMicMuted(false);
    setCameraOff(false);
  };

  const handleRequestBoard = () => {
    socketRef.current?.emit('requestBoard', { chatId });
  };

  const handleCloseBoard = () => {
    socketRef.current?.emit('closeBoard', { chatId });
  };

  const handleAddBoardObject = (object) => {
    if (!object || !object.id) return;
    const payload = JSON.parse(JSON.stringify(object));
    updateBoardObjects((prev) => {
      const exists = prev.find((item) => item.id === payload.id);
      if (exists) {
        return prev.map((item) => (item.id === payload.id ? { ...exists, ...payload } : item));
      }
      return [...prev, payload];
    });
    socketRef.current?.emit('boardAddObject', { chatId, object: payload });
  };

  const handleUpdateBoardObject = (objectId, updates) => {
    if (!objectId || !updates) return;
    const sanitized = JSON.parse(JSON.stringify(updates));
    updateBoardObjects((prev) =>
      prev.map((item) => (item.id === objectId ? { ...item, ...sanitized } : item))
    );
    socketRef.current?.emit('boardUpdateObject', { chatId, objectId, updates: sanitized });
  };

  const handleRemoveBoardObject = (objectId) => {
    if (!objectId) return;
    updateBoardObjects((prev) => prev.filter((item) => item.id !== objectId));
    socketRef.current?.emit('boardRemoveObject', { chatId, objectId });
  };

  const handleClearBoard = () => {
    updateBoardObjects(() => []);
    socketRef.current?.emit('boardClear', { chatId });
  };

  const handleLeave = () => {
    handleEndCall();
    navigate('/dashboard');
  };

  const handleToggleMic = () => {
    if (!localStreamRef.current) {
      setMicMuted((prev) => !prev);
      return;
    }
    setMicMuted((prev) => {
      const next = !prev;
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  };

  const handleToggleCamera = () => {
    if (!localStreamRef.current) {
      setCameraOff((prev) => !prev);
      return;
    }
    setCameraOff((prev) => {
      const next = !prev;
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  };

  const resolvedCustomTitle = preferences.customTitle?.trim() || null;
  const displayTitle =
    resolvedCustomTitle ||
    chatInfo?.title ||
    (chatInfo?.partner ? `Чат с ${chatInfo.partner.username}` : 'Личный чат');

  if (loadingChat) {
    return <LoadingScreen message="Открываем чат..." />;
  }

  if (chatInfoError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Не удалось открыть диалог</h1>
          <p className="text-slate-300">{chatInfoError}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-5 py-2.5 rounded-full bg-indigo-500 hover:bg-indigo-400 transition"
          >
            Вернуться к списку чатов
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {displayTitle}
            </h1>
            <p className="text-sm text-slate-400">
              История сообщений сохранится автоматически. Идентификатор чата: <span className="font-mono">{chatId}</span>
            </p>
            {error && <p className="text-sm text-rose-300 mt-2">{error}</p>}
            {preferencesError && (
              <p className="text-sm text-amber-300 mt-2">{preferencesError}</p>
            )}
          </div>
          <button
            onClick={handleLeave}
            className="self-start md:self-auto px-5 py-2.5 rounded-full border border-white/20 hover:border-white/60 transition"
          >
            Выйти из чата
          </button>
        </header>

        <ControlsBar
          callActive={callActive}
          onStartCall={handleStartCall}
          onEndCall={handleEndCall}
          onRequestBoard={handleRequestBoard}
          onCloseBoard={handleCloseBoard}
          onToggleMic={handleToggleMic}
          onToggleCamera={handleToggleCamera}
          boardOpen={boardOpen}
          micMuted={micMuted}
          cameraOff={cameraOff}
          disabled={!socketReady}
        />

        <div className="grid xl:grid-cols-[minmax(320px,380px),1fr] gap-6">
          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 h-full min-h-[360px] flex flex-col">
              <h2 className="text-lg font-semibold mb-4">
                Диалог
                {chatInfo?.partner ? (
                  <span className="block text-xs text-slate-300 font-normal mt-1">
                    Собеседник: {chatInfo.partner.username}
                  </span>
                ) : null}
              </h2>
              {historyError && <p className="text-xs text-rose-300 mb-2">{historyError}</p>}
              {loadingHistory ? (
                <p className="text-sm text-slate-400">Загружаем историю сообщений...</p>
              ) : (
                <ChatPanel
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onSendAudioMessage={handleSendAudioMessage}
                  disabled={!socketReady}
                />
              )}
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
              <FileSharing files={files} onSendFile={handleSendFile} disabled={!socketReady} />
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 min-h-[320px]">
              <VideoGrid
                localStream={localStream}
                remoteStreams={remoteStreams}
                callActive={callActive}
                localCameraOff={cameraOff}
              />
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
              <Whiteboard
                objects={boardObjects}
                onAddObject={handleAddBoardObject}
                onUpdateObject={handleUpdateBoardObject}
                onRemoveObject={handleRemoveBoardObject}
                onClear={handleClearBoard}
                disabled={!boardOpen || !callActive}
              />
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
              <ChatSettings
                chatId={chatId}
                partner={chatInfo?.partner || null}
                preferences={preferences}
                loading={preferencesLoading}
                onRename={handleRenameChat}
                onToggleNotifications={handleNotificationsChange}
                notificationsSupported={notificationsSupported}
                notificationPermission={notificationPermission}
                onRequestPermission={requestNotificationPermission}
                onGenerateInvite={handleGenerateInvite}
                generatingInvite={generatingInvite}
                inviteInfo={inviteInfo}
              />
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
              <ParticipantsList participants={participants} selfId={selfIdRef.current} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Chat;
