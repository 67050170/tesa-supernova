import React from 'react';

export default function StatsPanel({ mode, connected, socketId, info, markers }) {
  const latest = markers?.length ? markers[markers.length - 1] : null;

  return (
    <aside
      className="card"
      style={{
        background: '#12121a',
        borderRadius: 12,
        padding: 12,
        height: '75vh',
        overflow: 'auto',
      }}
    >
      <div className="panel-title" style={{ marginBottom: 8, opacity: 0.85 }}>
        {mode} · Overview
      </div>

      <div style={{ lineHeight: 1.8 }}>
        <div><b>Status:</b> {connected ? '🟢 Connected' : '🔴 Disconnected'}{socketId ? ` · id: ${socketId}` : ''}</div>
        <div><b>Camera:</b> {info ? `${info.name}` : 'Loading...'}</div>
        <div><b>Location:</b> {info?.location || '-'}</div>
        <div><b>Total markers:</b> {markers?.length ?? 0}</div>
      </div>

      <hr style={{ borderColor: '#222', margin: '12px 0' }} />

      <div className="panel-title" style={{ marginBottom: 6, opacity: 0.85 }}>
        Latest Detection
      </div>
      {latest ? (
        <div style={{ background:'#0f0f16', border:'1px solid #222', borderRadius:10, padding:10 }}>
          <div><b>Lng:</b> {latest.lng?.toFixed?.(6) ?? latest.lng}</div>
          <div><b>Lat:</b> {latest.lat?.toFixed?.(6) ?? latest.lat}</div>
          {latest.html ? (
            <div style={{ marginTop: 6, opacity: 0.85 }} dangerouslySetInnerHTML={{ __html: latest.html }} />
          ) : null}
        </div>
      ) : (
        <div style={{ opacity: 0.75 }}>No detections yet.</div>
      )}
    </aside>
  );
}
