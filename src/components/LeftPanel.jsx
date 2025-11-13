import React, { useEffect, useState } from 'react';
import { getWeather } from '../api/weather';

export default function LeftPanel({ center, info }) {
  const [wx, setWx] = useState(null);

  useEffect(() => {
    if (!center?.lat || !center?.lng) return;
    getWeather(center.lat, center.lng).then(setWx);
  }, [center?.lat, center?.lng]);

  return (
    <aside style={{ display:'grid', gap:12 }}>
      {/* WEATHER REPORT */}
      <div className="card" style={{ background:'#12121a', border:'1px solid #1d2e2f', borderRadius:12, padding:12 }}>
        <div className="panel-title" style={{ color:'#48e1ff' }}>WEATHER REPORT</div>
        <div style={{ lineHeight:1.7 }}>
          <div><b>Location:</b> {info?.location || '—'}</div>
          <div><b>Temp:</b> {wx?.temp!=null ? `${wx.temp} °C` : '—'}</div>
          <div><b>Condition:</b> {wx?.condition || '—'}</div>
          <div><b>Humidity:</b> {wx?.humidity!=null ? `${wx.humidity}%` : '—'}</div>
          <div><b>Wind:</b> {wx?.wind!=null ? `${wx.wind} m/s` : '—'}</div>
        </div>
      </div>

      {/* NAVIGATION / TARGETING */}
      <div className="card" style={{ background:'#12121a', border:'1px solid #1d2e2f', borderRadius:12, padding:12 }}>
        <div className="panel-title" style={{ color:'#48e1ff' }}>NAVIGATION</div>
        <div style={{ marginTop:6 }}>
          <div className="panel-title" style={{ color:'#aee7ff', marginBottom:6 }}>TARGETING RETICLE</div>
          <div style={{ lineHeight:1.7 }}>
            <div><b>Center:</b> {center?.lat?.toFixed?.(5) ?? '—'}, {center?.lng?.toFixed?.(5) ?? '—'}</div>
            <div><b>Altitude:</b> {center?.altitude!=null ? `${Math.round(center.altitude)} m` : '—'}</div>
            <div><b>Zoom:</b> {center?.zoom ? center.zoom.toFixed(1) : '—'}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
