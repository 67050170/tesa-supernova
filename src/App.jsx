import { Routes, Route, Outlet } from 'react-router-dom';
import NavBar from './components/NavBar';
import Defence from './pages/Defence';
import Offence from './pages/Offence';
import Integration from './pages/Integration';

export default function App() {
  return (
    <div style={{minHeight:'100vh', background:'#0b0b0f', color:'#fff'}}>
      <NavBar />
      <div style={{padding:16}}>
        <Routes>
          <Route path="/" element={<Defence />} />
          <Route path="/defence" element={<Defence />} />
          <Route path="/offence" element={<Offence />} />
          <Route path="/integration" element={<Integration />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Outlet />
      </div>
    </div>
  );
}
function NotFound(){ return <div style={{padding:24}}>404 – หน้านี้ไม่มีนะอ้วน</div>; }
