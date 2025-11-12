// src/DroneMap.jsx
import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import * as turf from "@turf/turf";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

export default function DroneMap() {
  // ✅ โหลด TOKEN และเช็ค "ภายในฟังก์ชัน" เท่านั้น
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) {
    return (
      <div style={{ padding: 20, color: "#fff", background: "#0b0d10", minHeight: "100vh" }}>
        ❗ ยังไม่พบ <b>MAPBOX TOKEN</b> ในไฟล์ <code>.env</code><br />
        ใส่บรรทัดนี้ไว้ที่รากโปรเจกต์ แล้ว <b>หยุด</b> dev server แล้วรันใหม่<br />
        <code>VITE_MAPBOX_TOKEN=...your_token...</code>
      </div>
    );
  }
  mapboxgl.accessToken = token;

  // refs สำหรับ DOM / map / draw / anim
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const animRef = useRef({
    rafId: 0,
    running: false,
    lastTs: 0,
    metersTraveled: 0,
  });

  // state แสดงผล
  const [stats, setStats] = useState({
    km: 0,
    waypoints: 0,
    etaMin: 0,
    speed: 10, // m/s
  });
  const [followCamera, setFollowCamera] = useState(true);

  // เก็บเส้นทางและความยาว (เมตร)
  const routeRef = useRef(null);
  const routeMetersRef = useRef(0);

  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    // 1) สร้างแผนที่
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [100.604, 13.736],
      zoom: 16,
      pitch: 60,
      bearing: -10,
      antialias: true,
      hash: true,
    });
    mapRef.current = map;

    // ปุ่มควบคุม
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }));

    // 2) Terrain + Sky
    map.on("load", () => {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.4 });

      map.addLayer({
        id: "sky",
        type: "sky",
        paint: {
          "sky-type": "atmosphere",
          "sky-atmosphere-sun": [0.0, 90.0],
          "sky-atmosphere-sun-intensity": 10,
        },
      });
    });

    // 3) ติดตั้งปากกา Draw
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { line_string: true, trash: true },
    });
    drawRef.current = draw;
    map.addControl(draw, "top-left");

    // 4) มาร์กเกอร์ "โดรน"
    const droneEl = makeDroneElement();
    const droneMarker = new mapboxgl.Marker({ element: droneEl, rotationAlignment: "map" });
    droneMarkerRef.current = droneMarker;

    // 5) อัปเดตสถิติเมื่อวาด/แก้/ลบเส้น
    const updateStats = () => {
      const data = draw.getAll();
      const line = data.features.find((f) => f.geometry?.type === "LineString");
      if (!line) {
        routeRef.current = null;
        routeMetersRef.current = 0;
        setStats((s) => ({ ...s, km: 0, waypoints: 0, etaMin: 0 }));
        stopAnim();
        return;
      }

      routeRef.current = line;
      const km = turf.length(line, { units: "kilometers" });
      const meters = km * 1000;
      routeMetersRef.current = meters;

      const waypoints = line.geometry.coordinates.length;
      const etaMin = stats.speed > 0 ? meters / stats.speed / 60 : 0;
      setStats((s) => ({ ...s, km, waypoints, etaMin }));
    };

    map.on("draw.create", updateStats);
    map.on("draw.update", updateStats);
    map.on("draw.delete", updateStats);

    // 6) กันแผนที่กะพริบเวลา container เปลี่ยนขนาด
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainer.current);

    return () => {
      ro.disconnect();
      stopAnim();
      map.remove();
      mapRef.current = null;
    };
  }, [stats.speed]);

  // ---------- คุมแอนิเมชัน ----------
  const startAnim = () => {
    if (!routeRef.current) {
      alert("ยังไม่มีเส้นทาง ให้กดปากกาแล้ววาดเส้นก่อนนะ");
      return;
    }
    const start = routeRef.current.geometry.coordinates[0];
    droneMarkerRef.current.setLngLat(start).addTo(mapRef.current);

    animRef.current.running = true;
    animRef.current.lastTs = 0;
    if (animRef.current.metersTraveled >= routeMetersRef.current) {
      animRef.current.metersTraveled = 0;
    }
    animRef.current.rafId = requestAnimationFrame(step);
  };

  const pauseAnim = () => {
    animRef.current.running = false;
    cancelAnimationFrame(animRef.current.rafId);
  };

  const resetAnim = () => {
    pauseAnim();
    animRef.current.metersTraveled = 0;
    if (routeRef.current) {
      const start = routeRef.current.geometry.coordinates[0];
      droneMarkerRef.current.setLngLat(start).addTo(mapRef.current);
    } else {
      droneMarkerRef.current.remove();
    }
  };

  const stopAnim = () => {
    animRef.current.running = false;
    cancelAnimationFrame(animRef.current.rafId);
    animRef.current.metersTraveled = 0;
    if (droneMarkerRef.current) droneMarkerRef.current.remove();
  };

  const step = (ts) => {
    if (!animRef.current.running || !routeRef.current) return;

    const last = animRef.current.lastTs || ts;
    const dt = (ts - last) / 1000; // วินาที
    animRef.current.lastTs = ts;

    animRef.current.metersTraveled += stats.speed * dt;

    if (animRef.current.metersTraveled >= routeMetersRef.current) {
      animRef.current.metersTraveled = routeMetersRef.current;
      pauseAnim();
    }

    const kmSoFar = animRef.current.metersTraveled / 1000;
    const along = turf.along(routeRef.current, kmSoFar, { units: "kilometers" });
    const lngLat = along.geometry.coordinates;

    // หา bearing จากตำแหน่งก่อนหน้า → ปัจจุบัน เพื่อให้โดรนหันตามทาง
    let bearing = mapRef.current.getBearing();
    const prevKm = Math.max(kmSoFar - 0.005, 0); // ~5 เมตรก่อนหน้า
    const prev = turf.along(routeRef.current, prevKm, { units: "kilometers" });
    if (prev && prev.geometry) {
      bearing = turf.bearing(prev.geometry.coordinates, lngLat);
    }

    droneMarkerRef.current.setLngLat(lngLat);
    // บางเวอร์ชันของ mapboxgl มี setRotation ให้ — ใช้แบบ optional
    droneMarkerRef.current.setRotation?.(bearing);

    if (followCamera) {
      mapRef.current.easeTo({
        center: lngLat,
        bearing,
        pitch: 60,
        duration: 300,
        easing: (t) => t,
      });
    }

    animRef.current.rafId = requestAnimationFrame(step);
  };

  // ---------- UI ----------
  return (
    <div style={{ display: "grid", gridTemplateColumns: "330px 1fr", height: "100vh" }}>
      {/* แผงควบคุม */}
      <div style={{ padding: 14, background: "#0b0d10", color: "white", overflow: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Drone Survey 3D</h2>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          ✏️ ใช้ปุ่ม Draw (ซ้ายบนของแผนที่) เพื่อวาดเส้น • 🗑️ ลบด้วยปุ่ม Trash
        </p>

        <div style={{ display: "grid", gap: 10 }}>
          <label>
            ความเร็ว (ม./วินาที):
            <input
              type="number"
              min="1"
              step="0.5"
              value={stats.speed}
              onChange={(e) =>
                setStats((s) => ({ ...s, speed: Math.max(0, parseFloat(e.target.value || "0")) }))
              }
              style={{ width: "100%", marginTop: 6 }}
            />
          </label>

          <div>ระยะทาง: {stats.km.toFixed(2)} กม.</div>
          <div>จุดทางผ่าน: {stats.waypoints}</div>
          <div>
            เวลาโดยประมาณ:{" "}
            {stats.etaMin > 120 ? (stats.etaMin / 60).toFixed(1) + " ชม." : stats.etaMin.toFixed(1) + " นาที"}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={startAnim}>▶ Start</button>
            <button onClick={pauseAnim}>⏸ Pause</button>
            <button onClick={resetAnim}>⏮ Reset</button>
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <input
              type="checkbox"
              checked={followCamera}
              onChange={(e) => setFollowCamera(e.target.checked)}
            />
            ให้กล้องติดตามโดรน
          </label>
        </div>
      </div>

      {/* กล่องแผนที่ */}
      <div ref={mapContainer} style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

/** element สำหรับมาร์กเกอร์โดรน */
function makeDroneElement() {
  const el = document.createElement("div");
  el.style.width = "22px";
  el.style.height = "22px";
  el.style.borderRadius = "999px";
  el.style.background = "white";
  el.style.border = "2px solid #111";
  el.style.boxShadow = "0 0 6px rgba(0,0,0,.45)";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.fontSize = "14px";
  el.style.userSelect = "none";
  el.textContent = "🛩️"; // จะเปลี่ยนเป็นรูปก็ได้: el.style.backgroundImage = 'url(/drone.png)'
  return el;
}
