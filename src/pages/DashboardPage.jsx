import React, { useEffect, useMemo, useRef, useState } from 'react';
import DroneMap from '../DroneMap';
import { CFG } from '../config';
import { useSocket } from '../hooks/useSocket';
import { getCameraInfo, getHistory } from '../api/tesa';
import LeftPanel from '../components/LeftPanel';
import RightPanel from '../components/RightPanel';

export default function DashboardPage({ mode }) {
  const cam = useMemo(() => CFG[mode], [mode]);
  const { connected, event, socketId } = useSocket(cam.id, true);

  const [info, setInfo] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [center, setCenter] = useState(null);
  const [feed, setFeed] = useState([]);

  // โหลด info + ประวัติ
  useEffect(() => {
    setMarkers([]); setInfo(null); setFeed([]);
    getCameraInfo(cam.id, cam.token).then(setInfo).catch(()=>setInfo(null));

    getHistory(cam.id, cam.token).then(rows => {
      const mks = rows.flatMap(r =>
        (r.objects||[]).map(o => ({
          lat:o.lat, lng:o.lng,
          color:o.objective==='enemy'?'#ff5b5b':o.objective==='our'?'#16a34a':'#6959ff',
          html:`<b>${o.type}</b><br/>${new Date(r.timestamp).toLocaleString()}`
        }))
      );
      setMarkers(mks);
      setFeed(f => [`[${new Date().toLocaleTimeString()}] history loaded (${mks.length})`, ...f]);
    });
  }, [cam.id, cam.token]);

  // เติม real-time
  useEffect(() => {
    if (!event) return;
    const news = (event.objects||[]).map(o => ({
      lat:o.lat, lng:o.lng,
      color:o.objective==='enemy'?'#ff5b5b':o.objective==='our'?'#16a34a':'#6959ff',
      html:`<b>${o.type}</b><br/>${new Date(event.timestamp).toLocaleString()}`
    }));
    setMarkers(prev=>[...prev, ...news]);

    // log สั้นๆ
    const line = news.map(n =>
      `[${new Date(event.timestamp).toLocaleTimeString()}] detected ${n.html.replace(/<[^>]*>/g,'')} @ ${n.lat.toFixed(4)}, ${n.lng.toFixed(4)}`
    ).join(' / ');
    setFeed(f => [line, ...f].slice(0, 120));
  }, [event]);

  const onLogout = () => {
    // เคลียร์ token/เซสชันแล้วรีโหลด (ปรับตามที่ใช้จริง)
    localStorage.clear();
    location.reload();
  };

  return (
    <div>
      {/* HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:10 }}>
        <div style={{ fontWeight:900, letterSpacing:1.5, color:'#48e1ff' }}>
          {mode} DASHBOARD
        </div>
        <div style={{ opacity:.85 }}>
          {connected ? '🟢 REAL-TIME' : '🔴 OFFLINE'} {socketId ? `· id: ${socketId}` : ''} · {info ? `${info.name} (${info.location})` : 'Loading camera…'}
        </div>
      </div>

      {/* BODY: 3 คอลัมน์เหมือนรูป */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'290px 1fr 340px',
        gap:12,
        alignItems:'start'
      }}>
        {/* ซ้าย: WEATHER + NAV/TARGET */}
        <LeftPanel center={center} info={info} />

        {/* กลาง: MAP + NO FLY ZONE */}
        <div className="panel" style={{ position:'relative' }}>
          {/* ป้าย NO FLY ZONE บน map */}
          <div style={{
            position:'absolute', zIndex:10, top:10, left:'50%', transform:'translateX(-50%)',
            background:'#ff3b3b', color:'#fff', padding:'4px 10px', borderRadius:6, fontWeight:800,
            boxShadow:'0 2px 0 rgba(0,0,0,.3)', letterSpacing:1
          }}>
            NO FLY ZONE
          </div>

          <DroneMap
            markers={markers}
            exaggeration={1.9}
            followLatest
            noFlyCenter={center?.lng ? { lng:center.lng, lat:center.lat } : { lng:100.977, lat:14.237 }}
            noFlyRadius={900}
            onCenterChange={setCenter}
          />
        </div>

        {/* ขวา: MISSION LOG + UNIT INFO */}
        <RightPanel
          feed={feed}
          onLogout={onLogout}
          unit={{ id:'drone-sim-001', lat:center?.lat, lng:center?.lng, alt:center?.altitude }}
        />
      </div>
    </div>
  );
}
