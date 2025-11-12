// src/DroneMap.jsx
import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import * as turf from "@turf/turf";
import "mapbox-gl/dist/mapbox-gl.css";

const DEFAULT_VIEW = {
  center: [101.15034, 14.28965],
  zoom: 14.38,
  pitch: 48,
  bearing: 78.3,
};

export default function DroneMap() {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) {
    return (
      <div style={{ padding: 20, color: "#fff", background: "#0b0d10", minHeight: "100vh" }}>
        ❗ ยังไม่พบ <b>VITE_MAPBOX_TOKEN</b> ในไฟล์ <code>.env</code><br />
        ใส่: <code>VITE_MAPBOX_TOKEN=pk....</code> แล้วรันใหม่
      </div>
    );
  }
  mapboxgl.accessToken = token;

  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const animRef = useRef({ running:false, rafId:0, lastTs:0, theta:0 });

  const [speed, setSpeed] = useState(10);
  const [radius, setRadius] = useState(250);
  const [focus, setFocus] = useState({ lng: DEFAULT_VIEW.center[0], lat: DEFAULT_VIEW.center[1] });

  const [followCamera, setFollowCamera] = useState(true);
  const [fpv, setFpv] = useState(false);
  const [fpvHeight, setFpvHeight] = useState(80);
  const [fpvAhead, setFpvAhead] = useState(60);

  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      pitch: DEFAULT_VIEW.pitch,
      bearing: DEFAULT_VIEW.bearing,
      antialias: true,
      hash: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch:true }), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit:"metric" }));

    map.on("load", () => {
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source:"mapbox-dem", exaggeration: 1.5 });

      if (!map.getLayer("sky")) {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0.0, 90.0],
            "sky-atmosphere-sun-intensity": 12,
          },
        });
      }

      const droneEl = makeDot("🛩️", "white");
      droneMarkerRef.current = new mapboxgl.Marker({
        element: droneEl,
        rotationAlignment: "viewport", // หันหน้าเข้าหา user เสมอ
      });

      const start = turf.destination([focus.lng, focus.lat], radius / 1000, 0, { units:"kilometers" }).geometry.coordinates;
      droneMarkerRef.current.setLngLat(start).addTo(map);

      const ro = new ResizeObserver(() => map.resize());
      ro.observe(mapContainer.current);
    });

    return () => {
      stopAuto();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Auto flight (วงกลม) =====
  const startAuto = () => {
    const map = mapRef.current;
    if (!map || !droneMarkerRef.current) return;

    const cur = droneMarkerRef.current.getLngLat();
    const ang = turf.bearing([focus.lng, focus.lat], [cur.lng, cur.lat]);
    animRef.current.theta = ((90 - ang) * Math.PI) / 180;
    animRef.current.lastTs = 0;
    animRef.current.running = true;
    animRef.current.rafId = requestAnimationFrame(stepAuto);
  };

  const stopAuto = () => {
    animRef.current.running = false;
    cancelAnimationFrame(animRef.current.rafId);
  };

  const stepAuto = (ts) => {
    if (!animRef.current.running) return;
    const map = mapRef.current;
    const marker = droneMarkerRef.current;
    if (!map || !marker) return;

    const last = animRef.current.lastTs || ts;
    const dt = (ts - last) / 1000;
    animRef.current.lastTs = ts;

    const R = Math.max(20, radius);
    const omega = speed / R;
    animRef.current.theta = (animRef.current.theta + omega * dt) % (Math.PI * 2);

    const bearingDeg = (90 - (animRef.current.theta * 180) / Math.PI + 360) % 360;

    const point = turf.destination(
      [focus.lng, focus.lat],
      R / 1000,
      bearingDeg,
      { units: "kilometers" }
    ).geometry.coordinates;

    marker.setLngLat(point);

    if (fpv) {
      updateCameraFPV(map, point, bearingDeg, fpvAhead, fpvHeight);
    } else if (followCamera) {
      map.easeTo({ center: point, bearing: bearingDeg, pitch: 60, duration: 250, easing: (t)=>t });
    }

    animRef.current.rafId = requestAnimationFrame(stepAuto);
  };

  // ===== UI helpers =====
  const useCurrentCenterAsFocus = () => {
    const c = mapRef.current.getCenter();
    setFocus({ lng:c.lng, lat:c.lat });
    const start = turf.destination([c.lng, c.lat], radius/1000, 0, { units:"kilometers" }).geometry.coordinates;
    droneMarkerRef.current.setLngLat(start);
  };

  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
  
    const drone = droneMarkerRef.current?.getLngLat();
    const targetCenter = drone || DEFAULT_VIEW.center;
  
    map.easeTo({
      center: targetCenter,
      zoom: 16,
      pitch: 60,
      bearing: map.getBearing(),
      duration: 1500,
    });
  };  
  

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">🛰️</div>
          <h1>Drone Survey 3D</h1>
          <span className="badge">v1.0</span>
        </div>

        <div className="section">
          <div className="row">
            <button className="btn" onClick={resetView}>↺ Reset View</button>
            <button className="btn" onClick={useCurrentCenterAsFocus}>🎯 ใช้จุดที่มองอยู่</button>
          </div>
          <p className="subtle" style={{marginTop:8}}>
            แผนที่ดาวเทียม 3D + จำมุมกล้องใน URL (hash) • ไอคอนโดรนหันหน้าเข้าหาผู้ใช้เสมอ
          </p>
        </div>

        <div className="section">
          <h3>ตั้งค่าการบินอัตโนมัติ</h3>
          <label className="label">ความเร็วโดรน (ม./วินาที)</label>
          <input className="number" type="number" min="0.1" step="0.5"
                 value={speed}
                 onChange={(e)=>setSpeed(Math.max(0, parseFloat(e.target.value||"0")))} />

          <label className="label" style={{marginTop:10}}>รัศมีการบิน (เมตร)</label>
          <input className="number" type="number" min="20" step="10"
                 value={radius}
                 onChange={(e)=>setRadius(Math.max(20, parseFloat(e.target.value||"0")))} />

          <div className="label" style={{marginTop:10}}>ศูนย์กลาง (lng, lat)</div>
          <div className="grid-2">
            <input className="number" type="number" value={focus.lng}
                   onChange={(e)=>setFocus(v=>({...v, lng: parseFloat(e.target.value)}))}/>
            <input className="number" type="number" value={focus.lat}
                   onChange={(e)=>setFocus(v=>({...v, lat: parseFloat(e.target.value)}))}/>
          </div>

          <div className="row" style={{marginTop:12}}>
            <button className="btn btn-primary" onClick={startAuto}>🛩️ เริ่มบิน</button>
            <button className="btn btn-danger" onClick={stopAuto}>⏸ หยุด</button>
          </div>
        </div>

        <div className="section">
          <h3>มุมกล้อง</h3>

          <label className="switch">
            <input type="checkbox" checked={followCamera}
                   onChange={(e)=>setFollowCamera(e.target.checked)} />
            ให้กล้องติดตามโดรน (มุมมองกว้าง)
          </label>

          <hr />

          <label className="switch">
            <input type="checkbox" checked={fpv}
                   onChange={(e)=>setFpv(e.target.checked)} />
            มุมกล้องติดโดรน (FPV)
          </label>

          {fpv && (
            <div style={{marginTop:10}}>
              <label className="label">ความสูงกล้องเหนือโดรน (ม.)</label>
              <input className="number" type="number" min="20" step="5"
                     value={fpvHeight}
                     onChange={(e)=>setFpvHeight(Math.max(20, parseFloat(e.target.value||"0")))} />

              <label className="label" style={{marginTop:10}}>มองนำหน้าทิศบิน (ม.)</label>
              <input className="number" type="number" min="5" step="5"
                     value={fpvAhead}
                     onChange={(e)=>setFpvAhead(Math.max(5, parseFloat(e.target.value||"0")))} />
            </div>
          )}
        </div>

        <p className="subtle">© tesa-supernova • Map data © Mapbox, OSM</p>
      </aside>

      {/* Map */}
      <div className="map-wrap">
        <div className="toolbar">
          {/* เผื่อเพิ่มปุ่มด่วนหน้าบนแผนที่ในอนาคต */}
        </div>
        <div ref={mapContainer} style={{width:"100%", height:"100%"}} />
      </div>
    </div>
  );
}

/* Helpers */
function makeDot(txt, bg = "white") {
  const el = document.createElement("div");
  el.style.width = "24px";
  el.style.height = "24px";
  el.style.borderRadius = "999px";
  el.style.background = bg;
  el.style.border = "2px solid #111";
  el.style.boxShadow = "0 0 6px rgba(0,0,0,.45)";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.fontSize = "15px";
  el.style.userSelect = "none";
  el.textContent = txt;
  return el;
}

function updateCameraFPV(map, lngLat, bearingDeg, aheadMeters = 60, heightMeters = 80) {
  if (!map) return;
  const h = Math.max(20, Number.isFinite(heightMeters) ? heightMeters : 80);
  const ahead = Math.max(5, Number.isFinite(aheadMeters) ? aheadMeters : 60);

  const camPos = mapboxgl.MercatorCoordinate.fromLngLat(
    { lng: lngLat[0], lat: lngLat[1] }, h
  );

  const lookAhead = turf.destination(
    [lngLat[0], lngLat[1]], ahead/1000, bearingDeg, { units:"kilometers" }
  ).geometry.coordinates;

  const lookAt = mapboxgl.MercatorCoordinate.fromLngLat(
    { lng: lookAhead[0], lat: lookAhead[1] }, 0
  );

  const camera = map.getFreeCameraOptions();
  camera.position = [camPos.x, camPos.y, camPos.z];
  camera.lookAtPoint(lookAt);
  map.setFreeCameraOptions(camera);
}
