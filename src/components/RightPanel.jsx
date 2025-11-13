import React from 'react';

export default function RightPanel({ feed, onLogout, unit }) {
  return (
    <aside style={{ display:'grid', gap:12 }}>
      {/* MISSION LOG */}
      <div className="card" style={{ background:'#12121a', border:'1px solid #1d2e2f', borderRadius:12, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <div className="panel-title" style={{ color:'#48e1ff' }}>MISSION LOG</div>
          <button className="btn btn-primary" onClick={onLogout}>[ LOGOUT ]</button>
        </div>
        <div style={{
          height: 260, overflow:'auto', border:'1px solid #222', borderRadius:8, padding:8,
          background:'#0f0f16', fontFamily:'ui-monospace, Menlo, Consolas, monospace', fontSize:12, lineHeight:1.6
        }}>
          {feed?.length ? feed.map((f,i)=><div key={i}>{f}</div>) : <div style={{opacity:.7}}>Waiting for events…</div>}
        </div>
      </div>

      {/* UNIT INFO */}
      <div className="card" style={{ background:'#12121a', border:'1px solid #1d2e2f', borderRadius:12, padding:12 }}>
        <div className="panel-title" style={{ color:'#48e1ff', marginBottom:6 }}>UNIT INFO</div>

        <div style={{ display:'grid', placeItems:'center', margin:'8px 0 12px 0' }}>
          {/* วงกลมโลโก้แบบง่าย */}
          <div style={{
            width:120, height:120, borderRadius:'50%', background:'#0d3b66',
            display:'grid', placeItems:'center', boxShadow:'0 0 0 3px rgba(72,225,255,.2)'
          }}>
            <span style={{ fontSize:44 }}>🛸</span>
          </div>
        </div>

        <div style={{ lineHeight:1.7 }}>
          <div><b>ID:</b> {unit?.id || 'drone-sim-001'}</div>
          <div><b>Coords:</b> {unit?.lat?.toFixed?.(4) ?? '—'}, {unit?.lng?.toFixed?.(4) ?? '—'}</div>
          <div><b>Altitude:</b> {unit?.alt ? `${Math.round(unit.alt)} m` : '—'}</div>
          <div><b>Status:</b> <span style={{ color:'#7bfab2' }}>NOMINAL</span></div>
        </div>
      </div>
    </aside>
  );
}
