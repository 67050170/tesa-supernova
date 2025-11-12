import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { CFG } from '../config';

export function useSocket(camId, enabled) {
  const [connected, setConnected] = useState(false);
  const [event, setEvent] = useState(null);
  const [socketId, setSocketId] = useState(null);

  useEffect(() => {
    if (!enabled || !camId) return;

    const s = io(CFG.SOCKET_URL);

    s.on('connect', () => {
      setConnected(true);
      setSocketId(s.id);
      s.emit('subscribe_camera', { cam_id: camId });
    });

    s.on('disconnect', () => setConnected(false));

    s.on('object_detection', (d) => {
      setEvent(d);
    });

    return () => {
      s.emit('unsubscribe_camera', { cam_id: camId });
      s.disconnect();
    };
  }, [camId, enabled]);

  return { connected, event, socketId };
}
