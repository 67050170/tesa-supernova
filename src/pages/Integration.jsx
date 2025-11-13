import React, { useMemo } from 'react';
import DroneMap from '../DroneMap';

export default function Integration(){
  const ourMarkers = useMemo(()=>[
    { lat:14.235, lng:100.983, color:'#16a34a', html:'<b>OUR</b>' }
  ],[]);
  const enemyMarkers = useMemo(()=>[
    { lat:14.231, lng:100.989, color:'#ff5b5b', html:'<b>ENEMY</b>' }
  ],[]);

  return (
    <div style={{display:'grid', gap:12}}>
      <section>
        <div className="panel-title" style={{marginBottom:6, opacity:.8}}>Multi-Dashboard Display</div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
          <div className="card" style={{background:'#12121a', borderRadius:12, padding:10}}>
            <div style={{margin:'4px 0 8px 0', opacity:.8}}>Defence – live map</div>
            <DroneMap markers={ourMarkers} exaggeration={1.9} followLatest />
          </div>
          <div className="card" style={{background:'#12121a', borderRadius:12, padding:10}}>
            <div style={{margin:'4px 0 8px 0', opacity:.8}}>Offence – live map</div>
            <DroneMap markers={enemyMarkers} exaggeration={1.9} followLatest />
          </div>
        </div>
      </section>

      <section className="panel" style={{background:'#12121a', borderRadius:12, padding:12}}>
        <div className="panel-title" style={{marginBottom:6, opacity:.8}}>Image Display</div>
        <div>📷 วาง snapshot/ภาพตรวจจับล่าสุด (ต่อ endpoint จริงได้ภายหลัง)</div>
      </section>

      <section className="panel" style={{background:'#12121a', borderRadius:12, padding:12}}>
        <div className="panel-title" style={{marginBottom:6, opacity:.8}}>Timeline</div>
        <ul style={{lineHeight:1.8, marginLeft:16}}>
          <li><b>12:01</b> Enemy detected (14.231, 100.989)</li>
          <li><b>12:03</b> Our drone dispatched</li>
          <li><b>12:07</b> Area cleared</li>
        </ul>
      </section>
    </div>
  );
}
