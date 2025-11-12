import { Link, useLocation, useNavigate } from 'react-router-dom';

const PAGES = ['/', '/offence', '/integration'];

export default function NavBar() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const norm = pathname === '/defence' ? '/' : pathname;
  const idx = Math.max(0, PAGES.indexOf(norm));
  const prev = PAGES[Math.max(0, idx - 1)];
  const next = PAGES[Math.min(PAGES.length - 1, idx + 1)];

  return (
    <header style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'10px 12px', background:'#0b0b0f', borderBottom:'1px solid #222',
      position:'sticky', top:0, zIndex:50
    }}>
      <nav style={{display:'flex', gap:12}}>
        <Link to="/" className="btn">Defence</Link>
        <Link to="/offence" className="btn">Offence</Link>
        <Link to="/integration" className="btn">Integration</Link>
      </nav>
      <div style={{display:'flex', gap:8}}>
        <button className="btn" onClick={() => nav(prev)} disabled={idx<=0}>← Back</button>
        <button className="btn btn-primary" onClick={() => nav(next)} disabled={idx>=PAGES.length-1}>Next →</button>
      </div>
    </header>
  );
}
