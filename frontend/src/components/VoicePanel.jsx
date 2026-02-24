import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../services/socket';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function RemoteAudio({ stream }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={ref} autoPlay />;
}

export default function VoicePanel({ channelKey }) {
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState({});
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const isSecureContext = window.isSecureContext;

  const describeMediaError = (err) => {
    if (!err) return 'Mic access denied or unavailable.';
    if (err.name === 'NotAllowedError') return 'Mic permission denied.';
    if (err.name === 'NotFoundError') return 'No microphone found.';
    if (err.name === 'NotReadableError') return 'Mic is in use by another app.';
    if (err.name === 'SecurityError') return 'Insecure context: HTTPS is required.';
    if (err.message === 'MediaDevicesUnavailable') return 'Media devices not available.';
    return `Mic error: ${err.name || 'unknown'}`;
  };

  const addParticipant = (id, username) => {
    setParticipants((prev) => {
      if (prev.some((p) => p.id === id)) return prev;
      return [...prev, { id, username, hasAudio: false }];
    });
  };

  const removeParticipant = (id) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const peer = peersRef.current.get(id);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(id);
    }
  };

  const markAudio = (id) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, hasAudio: true } : p)));
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('MediaDevicesUnavailable');
      err.name = 'NotSupportedError';
      throw err;
    }
    if (!isSecureContext) {
      const err = new Error('InsecureContext');
      err.name = 'SecurityError';
      throw err;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    return stream;
  };

  const createPeerConnection = (targetId) => {
    if (peersRef.current.has(targetId)) {
      return peersRef.current.get(targetId).pc;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('voice:signal', {
          targetId,
          data: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => ({ ...prev, [targetId]: remoteStream }));
      markAudio(targetId);
    };

    peersRef.current.set(targetId, { pc });
    return pc;
  };

  const startOffer = async (targetId) => {
    const pc = createPeerConnection(targetId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('voice:signal', {
      targetId,
      data: { type: 'offer', sdp: pc.localDescription }
    });
  };

  const handleJoin = async () => {
    setError('');
    try {
      await ensureLocalStream();
      socket.emit('voice:join', { channelKey });
      setJoined(true);
    } catch (err) {
      setError(describeMediaError(err));
    }
  };

  const handleLeave = () => {
    socket.emit('voice:leave');
    setJoined(false);
    setParticipants([]);
    setRemoteStreams({});
    peersRef.current.forEach((peer) => peer.pc.close());
    peersRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  };

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const onPeerList = async ({ peers }) => {
      setParticipants(peers.map((p) => ({ ...p, hasAudio: false })));
      for (const peer of peers) {
        await startOffer(peer.id);
      }
    };

    const onPeerJoined = ({ id, username }) => {
      addParticipant(id, username);
    };

    const onPeerLeft = ({ id }) => {
      removeParticipant(id);
    };

    const onSignal = async ({ fromId, data, username }) => {
      if (!joined) return;
      if (username) addParticipant(fromId, username);

      const pc = createPeerConnection(fromId);

      if (data.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice:signal', {
          targetId: fromId,
          data: { type: 'answer', sdp: pc.localDescription }
        });
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (data.type === 'candidate') {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.warn('ICE candidate error', err);
        }
      }
    };

    const onVoiceError = (payload) => {
      setError(payload?.error || 'Voice error.');
    };

    socket.on('voice:peer_list', onPeerList);
    socket.on('voice:peer_joined', onPeerJoined);
    socket.on('voice:peer_left', onPeerLeft);
    socket.on('voice:signal', onSignal);
    socket.on('voice:error', onVoiceError);

    return () => {
      socket.off('voice:peer_list', onPeerList);
      socket.off('voice:peer_joined', onPeerJoined);
      socket.off('voice:peer_left', onPeerLeft);
      socket.off('voice:signal', onSignal);
      socket.off('voice:error', onVoiceError);
    };
  }, [joined]);

  useEffect(() => {
    if (joined) {
      handleLeave();
    }
  }, [channelKey]);

  useEffect(() => {
    return () => {
      if (joined) handleLeave();
    };
  }, []);

  const participantCount = participants.length + (joined ? 1 : 0);

  return (
    <div className="voice-panel">
      <div className="voice-header">
        <div>
          <div className="voice-title">Voice Chat</div>
          <div className="voice-subtitle">Channel: {channelKey}</div>
        </div>
        {!joined ? (
          <button className="ghost-button" onClick={handleJoin}>Join Voice</button>
        ) : (
          <button className="danger-button" onClick={handleLeave}>Leave Voice</button>
        )}
      </div>
      {error && <div className="panel-error">{error}</div>}
      <div className="voice-status">
        Secure context: {isSecureContext ? 'yes' : 'no'} · {window.location.protocol}
      </div>
      <div className="voice-status">
        {joined ? `Connected · ${participantCount} in voice` : 'Not connected'}
      </div>
      {joined && (
        <div className="voice-participants">
          <div className="voice-you">You (mic on)</div>
          {participants.map((p) => (
            <div key={p.id} className="voice-user">
              {p.username} {p.hasAudio ? '· audio' : ''}
            </div>
          ))}
        </div>
      )}
      {Object.entries(remoteStreams).map(([id, stream]) => (
        <RemoteAudio key={id} stream={stream} />
      ))}
    </div>
  );
}