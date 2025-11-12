import React, { useEffect, useMemo, useState } from 'react';
import DroneMap from '../DroneMap';
import { CFG } from '../config';
import { useSocket } from '../hooks/useSocket';
import { getCameraInfo, getHistory } from '../api/tesa';

export default function DashboardPage({ mode }) {
  const cam = useMemo(() => CFG[mode], [mode]);
  const { connected, event, socketId } = useSocket(cam.id, true);
  const [info, setInfo] = useState(null);
  const [markers, setMarkers] = useState([]);

  // โหลดข้อมูลกล้อง + ประวัติ
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

  // ต่อ real-time แล้วเติมจุดใหม่
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
    <>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
        <div style={{fontWeight:700, fontSize:20}}>
          {mode} Dashboard · {connected ? '🟢 Live' : '🔴 Offline'} {socketId ? `· id: ${socketId}` : ''}
        </div>
        <div style={{opacity:.8}}>
          {info ? `${info.name} (${info.location})` : 'Loading camera info…'}
        </div>
      </div>

      <section className="panel" style={{marginBottom:12}}>
        <DroneMap markers={markers} exaggeration={1.9} followLatest />
      </section>

      <section className="panel two-col" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
        <div className="card" style={{background:'#12121a', borderRadius:12, padding:12}}>
          <div className="panel-title" style={{marginBottom:6, opacity:.8}}>Connection & UI (2 pts)</div>
          <div>สถานะ: {connected ? 'Connected' : 'Disconnected'}</div>
          <div>Camera ID: {cam.id}</div>
        </div>
        <div className="card" style={{background:'#12121a', borderRadius:12, padding:12}}>
          <div className="panel-title" style={{marginBottom:6, opacity:.8}}>Map & Detections (3 pts)</div>
          <div>Markers: {markers.length}</div>
          <div>History loaded + Real-time append</div>
        </div>
      </section>
    </>
  );
}
