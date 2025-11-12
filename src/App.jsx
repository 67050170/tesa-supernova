import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import DroneMap from './DroneMap';
import { CFG } from './config';
import { useSocket } from './hooks/useSocket';
import { getCameraInfo, getHistory } from './api/tesa';

export default function App() {
  const [mode, setMode] = useState('DEFENCE');
  const cam = useMemo(() => CFG[mode], [mode]);

  const { connected, event, socketId } = useSocket(cam.id, true);
  const [info, setInfo] = useState(null);
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    setMarkers([]);
    setInfo(null);

    getCameraInfo(cam.id, cam.token).then(setInfo).catch(() => setInfo(null));

    getHistory(cam.id, cam.token).then((rows) => {
      const mks = rows.flatMap((r) =>
        (r.objects || []).map((o) => ({
          lat: o.lat,
          lng: o.lng,
          color: o.objective === 'enemy' ? '#ff5b5b' : o.objective === 'our' ? '#16a34a' : '#6959ff',
          html: `<b>${o.type}</b><br/>${new Date(r.timestamp).toLocaleString()}`,
        }))
      );
      setMarkers(mks);
    });
  }, [cam.id, cam.token]);

  useEffect(() => {
    if (!event) return;
    const news = (event.objects || []).map((o) => ({
      lat: o.lat,
      lng: o.lng,
      color: o.objective === 'enemy' ? '#ff5b5b' : o.objective === 'our' ? '#16a34a' : '#6959ff',
      html: `<b>${o.type}</b><br/>${new Date(event.timestamp).toLocaleString()}`,
    }));
    setMarkers((prev) => [...prev, ...news]);
  }, [event]);

  return (
    <div className="layout" style={{ padding: 16, color: '#fff', background: '#0b0b0f', minHeight: '100vh' }}>
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="logo" style={{ fontWeight: 700, fontSize: 20 }}>
          TESA Drone Dashboard · {connected ? '🟢 Live' : '🔴 Offline'}
          {socketId ? ` · id: ${socketId}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMode('DEFENCE')} className={mode === 'DEFENCE' ? 'btn btn-primary' : 'btn'}>
            Defence
          </button>
          <button onClick={() => setMode('OFFENCE')} className={mode === 'OFFENCE' ? 'btn btn-primary' : 'btn'}>
            Offence
          </button>
        </div>
      </header>

      <main className="content" style={{ marginTop: 12 }}>
        <section className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-title" style={{ marginBottom: 6, opacity: 0.8 }}>
            {mode} · {info ? `${info.name} (${info.location})` : 'Loading camera info...'}
          </div>
          <DroneMap
          markers={markers}
          exaggeration={1.8}   // ยิ่งมากภูเขายิ่งสูง
          followLatest={true}  // กล้องบินตามจุดล่าสุด
          />


        </section>

        <section className="panel two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="card" style={{ background: '#12121a', borderRadius: 12, padding: 12 }}>
            <div className="panel-title" style={{ marginBottom: 6, opacity: 0.8 }}>Connection & UI (2 pts)</div>
            <div>สถานะ: {connected ? 'Connected' : 'Disconnected'}</div>
            <div>Camera ID: {cam.id}</div>
          </div>

          <div className="card" style={{ background: '#12121a', borderRadius: 12, padding: 12 }}>
            <div className="panel-title" style={{ marginBottom: 6, opacity: 0.8 }}>Map & Detections (3 pts)</div>
            <div>Markers: {markers.length}</div>
            <div>History loaded + Real-time append</div>
          </div>
        </section>
      </main>
    </div>
  );
}
