// src/DroneMap.jsx
import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import * as turf from "@turf/turf";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

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

  // --- Refs / states ---
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const carMarkerRef = useRef(null);

  const animRef = useRef({ rafId: 0, running: false, lastTs: 0, metersTraveled: 0 });
  const routeRef = useRef(null);
  const routeMetersRef = useRef(0);

  const carRouteRef = useRef(null);
  const carRef = useRef({ rafId: 0, running: false, lastTs: 0, meters: 0, totalMeters: 0 });

  const [mode, setMode] = useState("route"); // "route" | "target"
  const [followCamera, setFollowCamera] = useState(true);
  const [stats, setStats] = useState({ km: 0, waypoints: 0, etaMin: 0, speed: 10 });
  const [carSpeed, setCarSpeed] = useState(8);
  const [styleId, setStyleId] = useState("satellite"); // default เหมือนภาพ
  const [myLocSupported] = useState(!!navigator.geolocation);

  const [targetLL, setTargetLL] = useState({ lng: 100.604, lat: 13.736 });
  const pickTargetModeRef = useRef(false);

  // live (ถ้ารัน server)
  const wsRef = useRef(null);
  const [vehiclesFC, setVehiclesFC] = useState({ type: "FeatureCollection", features: [] });
  const [populationFC, setPopulationFC] = useState({ type: "FeatureCollection", features: [] });

  // --- init map ---
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const styleMap = {
      streets: "mapbox://styles/mapbox/streets-v12",
      satellite: "mapbox://styles/mapbox/satellite-streets-v12",
    };

    const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: styleMap[styleId],
        center: [101.15034, 14.28965], // จุดที่อ้วนระบุ
        zoom: 14.38,                   // ระดับซูม
        pitch: 48,                     // เงยกล้องขึ้น
        bearing: 78.3,                 // หมุนกล้องทิศตะวันออกเฉียง
        antialias: true,
        hash: true,
      });
      
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }));

    map.on("load", () => {
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 2.0 });
      }
      if (!map.getLayer("sky")) {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0.0, 90.0],
            "sky-atmosphere-sun-intensity": 15,
          },
        });
      }
      // 3D buildings
      const layers = map.getStyle().layers || [];
      const labelLayerId = layers.find(
        (l) => l.type === "symbol" && l.layout && l.layout["text-field"]
      )?.id;
      if (!map.getLayer("3d-buildings")) {
        map.addLayer(
          {
            id: "3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", ["get", "extrude"], "true"],
            type: "fill-extrusion",
            minzoom: 15,
            paint: {
              "fill-extrusion-color": "#aaa",
              "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "height"]],
              "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "min_height"]],
              "fill-extrusion-opacity": 0.6,
            },
          },
          labelLayerId
        );
      }
      addLiveSourcesAndLayers(map); // เพิ่ม source/เลเยอร์สำหรับข้อมูลสด
    });

    // Draw
    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { line_string: true, trash: true } });
    drawRef.current = draw;
    map.addControl(draw, "top-left");

    // markers
    const droneEl = makeDot("🛩️", "white");
    droneMarkerRef.current = new mapboxgl.Marker({ element: droneEl, rotationAlignment: "map" });

    const carEl = makeDot("🚗", "#ffd34d");
    carMarkerRef.current = new mapboxgl.Marker({ element: carEl, draggable: true })
      .setLngLat([targetLL.lng, targetLL.lat])
      .addTo(map);
    carMarkerRef.current.on("dragend", () => {
      const p = carMarkerRef.current.getLngLat();
      setTargetLL({ lng: p.lng, lat: p.lat });
    });

    // stats update
    const updateStats = () => {
      const data = draw.getAll();
      const line = data.features.find((f) => f.geometry?.type === "LineString");
      if (!line) {
        routeRef.current = null;
        routeMetersRef.current = 0;
        setStats((s) => ({ ...s, km: 0, waypoints: 0, etaMin: 0 }));
        stopDrone();
        stopCar();
        return;
      }
      routeRef.current = line;
      const km = turf.length(line, { units: "kilometers" });
      routeMetersRef.current = km * 1000;
      const waypoints = line.geometry.coordinates.length;
      const etaMin = stats.speed > 0 ? (routeMetersRef.current / stats.speed) / 60 : 0;
      setStats((s) => ({ ...s, km, waypoints, etaMin }));
    };

    map.on("draw.create", updateStats);
    map.on("draw.update", updateStats);
    map.on("draw.delete", updateStats);

    map.on("click", (e) => {
      if (!pickTargetModeRef.current) return;
      const { lng, lat } = e.lngLat;
      setTargetLL({ lng, lat });
      carMarkerRef.current.setLngLat([lng, lat]);
      pickTargetModeRef.current = false;
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainer.current);

    return () => {
      ro.disconnect();
      stopDrone();
      stopCar();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId, stats.speed]);

  // --- WebSocket live (ถ้ามี server รันอยู่) ---
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8787");
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "vehicles") setVehiclesFC(msg.data);
        if (msg.type === "population") setPopulationFC(msg.data);
      } catch {}
    };
    ws.onclose = () => {
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          wsRef.current = new WebSocket("ws://localhost:8787");
        }
      }, 2000);
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("live-vehicles")) return;
    map.getSource("live-vehicles").setData(vehiclesFC);
  }, [vehiclesFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("live-population")) return;
    map.getSource("live-population").setData(populationFC);
  }, [populationFC]);

  // --- Drone route mode ---
  const startDroneRoute = () => {
    if (!routeRef.current) {
      alert("ยังไม่มีเส้นทาง: กดปากกาแล้ววาดเส้นก่อน");
      return;
    }
    setMode("route");
    const start = routeRef.current.geometry.coordinates[0];
    droneMarkerRef.current.setLngLat(start).addTo(mapRef.current);
    animRef.current.running = true;
    animRef.current.lastTs = 0;
    if (animRef.current.metersTraveled >= routeMetersRef.current) animRef.current.metersTraveled = 0;
    animRef.current.rafId = requestAnimationFrame(stepRoute);
  };
  const pauseDrone = () => { animRef.current.running = false; cancelAnimationFrame(animRef.current.rafId); };
  const resetDroneRoute = () => {
    pauseDrone(); animRef.current.metersTraveled = 0;
    if (routeRef.current) {
      const start = routeRef.current.geometry.coordinates[0];
      droneMarkerRef.current.setLngLat(start).addTo(mapRef.current);
    } else droneMarkerRef.current.remove();
  };
  const stopDrone = () => { pauseDrone(); animRef.current.metersTraveled = 0; droneMarkerRef.current?.remove(); };

  const stepRoute = (ts) => {
    if (!animRef.current.running || !routeRef.current) return;
    const last = animRef.current.lastTs || ts;
    const dt = (ts - last) / 1000;
    animRef.current.lastTs = ts;

    animRef.current.metersTraveled += stats.speed * dt;
    if (animRef.current.metersTraveled >= routeMetersRef.current) {
      animRef.current.metersTraveled = routeMetersRef.current; pauseDrone();
    }

    const kmSoFar = animRef.current.metersTraveled / 1000;
    const along = turf.along(routeRef.current, kmSoFar, { units: "kilometers" });
    const lngLat = along.geometry.coordinates;

    let bearing = mapRef.current.getBearing();
    const prevKm = Math.max(kmSoFar - 0.005, 0);
    const prev = turf.along(routeRef.current, prevKm, { units: "kilometers" });
    if (prev && prev.geometry) bearing = turf.bearing(prev.geometry.coordinates, lngLat);

    droneMarkerRef.current.setLngLat(lngLat);
    droneMarkerRef.current.setRotation?.(bearing);
    if (followCamera) {
      mapRef.current.easeTo({ center: lngLat, bearing, pitch: 60, duration: 300, easing: (t) => t });
    }
    animRef.current.rafId = requestAnimationFrame(stepRoute);
  };

  // --- Drone chase target ---
  const startDroneChase = () => {
    setMode("target");
    const center = mapRef.current.getCenter();
    if (!droneMarkerRef.current.getLngLat()) {
      droneMarkerRef.current.setLngLat(center).addTo(mapRef.current);
    } else droneMarkerRef.current.addTo(mapRef.current);
    animRef.current.running = true;
    animRef.current.lastTs = 0;
    animRef.current.rafId = requestAnimationFrame(stepChase);
  };
  const stepChase = (ts) => {
    if (!animRef.current.running) return;
    const last = animRef.current.lastTs || ts;
    const dt = (ts - last) / 1000;
    animRef.current.lastTs = ts;

    const cur = droneMarkerRef.current.getLngLat(); if (!cur) return;
    const curArr = [cur.lng, cur.lat];
    const tgt = carMarkerRef.current?.getLngLat() || targetLL;
    const tgtArr = [tgt.lng, tgt.lat];

    const distKm = turf.distance(curArr, tgtArr, { units: "kilometers" });
    const bearing = turf.bearing(curArr, tgtArr);
    if (distKm * 1000 < 2) { pauseDrone(); return; }

    const stepMeters = stats.speed * dt;
    const stepKm = stepMeters / 1000;
    const nextPoint = turf.destination(curArr, Math.min(stepKm, distKm), bearing, { units: "kilometers" }).geometry.coordinates;

    droneMarkerRef.current.setLngLat(nextPoint);
    droneMarkerRef.current.setRotation?.(bearing);
    if (followCamera) {
      mapRef.current.easeTo({ center: nextPoint, bearing, pitch: 60, duration: 250, easing: (t) => t });
    }
    animRef.current.rafId = requestAnimationFrame(stepChase);
  };

  // --- Car simulator (วิ่งวนตามเส้นที่วาด) ---
  const startCarOnDrawnRoute = () => {
    if (!routeRef.current) { alert("ยังไม่มีเส้นทางรถ: วาดเส้นก่อน"); return; }
    carRouteRef.current = routeRef.current;
    carRef.current.totalMeters = routeMetersRef.current;
    if (carRef.current.totalMeters <= 0) return;

    carRef.current.running = true; carRef.current.lastTs = 0; carRef.current.meters = 0;
    const start = carRouteRef.current.geometry.coordinates[0];
    carMarkerRef.current.setLngLat(start);
    setTargetLL({ lng: start[0], lat: start[1] });
    carRef.current.rafId = requestAnimationFrame(stepCar);
  };
  const stopCar = () => { carRef.current.running = false; cancelAnimationFrame(carRef.current.rafId); };
  const stepCar = (ts) => {
    if (!carRef.current.running || !carRouteRef.current) return;
    const last = carRef.current.lastTs || ts;
    const dt = (ts - last) / 1000;
    carRef.current.lastTs = ts;

    carRef.current.meters += carSpeed * dt;
    if (carRef.current.meters >= carRef.current.totalMeters) carRef.current.meters = 0;

    const kmSoFar = carRef.current.meters / 1000;
    const along = turf.along(carRouteRef.current, kmSoFar, { units: "kilometers" });
    const pos = along.geometry.coordinates;

    carMarkerRef.current.setLngLat(pos);
    setTargetLL({ lng: pos[0], lat: pos[1] });
    carRef.current.rafId = requestAnimationFrame(stepCar);
  };

  // --- helpers / UI ---
  const toggleStyle = () => setStyleId((s) => (s === "streets" ? "satellite" : "streets"));
  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        mapRef.current?.easeTo({ center: [coords.longitude, coords.latitude], zoom: 18, pitch: 60, duration: 500 });
      },
      () => alert("อ่านตำแหน่งไม่สำเร็จ"),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  const addLiveSourcesAndLayers = (map) => {
    if (!map.getSource("live-vehicles")) {
      map.addSource("live-vehicles", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "live-vehicles-circles",
        source: "live-vehicles",
        type: "circle",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ffcc00",
          "circle-stroke-color": "#111",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "live-vehicles-emoji",
        type: "symbol",
        source: "live-vehicles",
        layout: { "text-field": "🚗", "text-size": 16, "text-allow-overlap": true },
      });
    }
    if (!map.getSource("live-population")) {
      map.addSource("live-population", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "live-population-heat",
        type: "heatmap",
        source: "live-population",
        maxzoom: 18,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 5, 1],
          "heatmap-intensity": 1.5,
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 15, 18, 40],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 18, 0.6],
        },
      });
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", height: "100vh" }}>
      <div style={{ padding: 14, background: "#0b0d10", color: "white", overflow: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Drone Survey 3D</h2>

        {/* ไม่มีปุ่ม Classic/Pro แล้ว — คงโหมดเดียว */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={toggleStyle}>
            🗺️ สลับแผนที่: {styleId === "streets" ? "ถนน → ดาวเทียม" : "ดาวเทียม → ถนน"}
          </button>
          <button onClick={locateMe} disabled={!myLocSupported} title={myLocSupported ? "" : "ไม่รองรับ"}>
            📍 ไปที่ตำแหน่งฉัน
          </button>
        </div>

        <label>
          ความเร็วโดรน (ม./วินาที):
          <input
            type="number"
            min="0.1"
            step="0.5"
            value={stats.speed}
            onChange={(e) => setStats((s) => ({ ...s, speed: Math.max(0, parseFloat(e.target.value || "0")) }))}
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
          <button onClick={() => setMode("route")} style={{ background: mode === "route" ? "#444" : "" }}>📏 Route</button>
          <button onClick={() => setMode("target")} style={{ background: mode === "target" ? "#444" : "" }}>🎯 Target</button>
        </div>

        {mode === "route" ? (
          <>
            <p style={{ opacity: 0.8 }}>
              ✏️ วาดเส้นด้วยปุ่ม Draw (ซ้ายบนของแผนที่) • 🗑️ ลบด้วย Trash — แล้วกด “บินตามเส้น”
            </p>
            <div>ระยะทางเส้น: {stats.km.toFixed(2)} กม.</div>
            <div>จุดทางผ่าน: {stats.waypoints}</div>
            <div>
              เวลาโดยประมาณ: {stats.etaMin > 120 ? (stats.etaMin / 60).toFixed(1) + " ชม." : stats.etaMin.toFixed(1) + " นาที"}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={startDroneRoute}>🛩️▶ บินตามเส้น</button>
              <button onClick={pauseDrone}>⏸ Pause</button>
              <button onClick={resetDroneRoute}>⏮ Reset</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ opacity: 0.8 }}>โหมดเป้า: ไล่ “รถจำลอง” หรือจุดที่ตั้งเอง</p>

            <fieldset style={{ border: "1px solid #2a2a2a", padding: 10, marginTop: 8 }}>
              <legend>🚗 ตัวจำลองรถ (วิ่งวนตามเส้น)</legend>
              <label>
                ความเร็วรถ (ม./วินาที)
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={carSpeed}
                  onChange={(e) => setCarSpeed(Math.max(0, parseFloat(e.target.value || "0")))}
                  style={{ width: "100%", marginTop: 6 }}
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={startCarOnDrawnRoute}>🚦 เริ่มให้รถวิ่งตามเส้น</button>
                <button onClick={stopCar}>🛑 หยุดรถ</button>
              </div>
            </fieldset>

            <fieldset style={{ border: "1px solid #2a2a2a", padding: 10, marginTop: 10 }}>
              <legend>📍 ตั้งเป้าหมายเอง</legend>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label>
                  ลองจิจูด (lng)
                  <input
                    type="number"
                    value={targetLL.lng}
                    onChange={(e) => setTargetLL((v) => ({ ...v, lng: parseFloat(e.target.value) }))}
                  />
                </label>
                <label>
                  ละติจูด (lat)
                  <input
                    type="number"
                    value={targetLL.lat}
                    onChange={(e) => setTargetLL((v) => ({ ...v, lat: parseFloat(e.target.value) }))}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={() => { pickTargetModeRef.current = true; }}>🖱️ เลือกบนแผนที่</button>
                <button onClick={() => {
                  carMarkerRef.current.setLngLat([targetLL.lng, targetLL.lat]);
                  mapRef.current.easeTo({ center: [targetLL.lng, targetLL.lat], zoom: 17, duration: 400 });
                }}>
                  ✔ Set พิกัดนี้
                </button>
              </div>
            </fieldset>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={startDroneChase}>🛩️▶ Chase รถ/เป้าหมาย</button>
              <button onClick={pauseDrone}>⏸ หยุดโดรน</button>
            </div>
          </>
        )}

        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input type="checkbox" checked={followCamera} onChange={(e) => setFollowCamera(e.target.checked)} />
          ให้กล้องติดตามโดรน
        </label>
      </div>

      <div ref={mapContainer} style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

function makeDot(txt, bg = "white") {
  const el = document.createElement("div");
  el.style.width = "22px";
  el.style.height = "22px";
  el.style.borderRadius = "999px";
  el.style.background = bg;
  el.style.border = "2px solid #111";
  el.style.boxShadow = "0 0 6px rgba(0,0,0,.45)";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.fontSize = "14px";
  el.style.userSelect = "none";
  el.textContent = txt;
  return el;
}
