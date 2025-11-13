import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CFG } from './config';

mapboxgl.accessToken = CFG.MAPBOX_TOKEN;

/** สร้าง polygon ทรงกลมเป็นเมตรบนทรงกลมโลก */
function makeCircle(lng, lat, radiusM = 800, steps = 128) {
  const coords = [];
  const R = 6378137; // Earth radius (m)
  const d = radiusM / R;
  const lat0 = (lat * Math.PI) / 180;
  const lng0 = (lng * Math.PI) / 180;

  for (let i = 0; i <= steps; i++) {
    const brg = (2 * Math.PI * i) / steps;
    const lat1 = Math.asin(
      Math.sin(lat0) * Math.cos(d) + Math.cos(lat0) * Math.sin(d) * Math.cos(brg)
    );
    const lng1 =
      lng0 +
      Math.atan2(
        Math.sin(brg) * Math.sin(d) * Math.cos(lat0),
        Math.cos(d) - Math.sin(lat0) * Math.sin(lat1)
      );
    coords.push([(lng1 * 180) / Math.PI, (lat1 * 180) / Math.PI]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}

export default function DroneMap({
  markers = [],                 // [{lat,lng,color?,html?}]
  exaggeration = 1.8,
  followLatest = true,
  // ใหม่:
  noFlyCenter = { lng: 100.977, lat: 14.237 },
  noFlyRadius = 800,            // meters
  onCenterChange,               // (state) => void
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  // สร้างแผนที่ครั้งเดียว
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [noFlyCenter.lng, noFlyCenter.lat],
      zoom: 14.2,
      pitch: 72,
      bearing: -20,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-left');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }));

    map.on('load', () => {
      setLoaded(true);

      // Sky/Fog
      if (!map.getLayer('sky')) {
        map.addLayer({
          id: 'sky',
          type: 'sky',
          paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun-intensity': 12 },
        });
      }
      map.setFog({
        range: [0.6, 10],
        'horizon-blend': 0.2,
        color: 'hsl(220,60%,70%)',
        'high-color': 'hsl(220,80%,90%)',
        'space-color': 'hsl(220,100%,5%)',
      });

      // DEM Terrain + Hillshade
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.terrain-rgb',
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: 'mapbox-dem', exaggeration });

      if (!map.getSource('dem-hillshade')) {
        map.addSource('dem-hillshade', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.terrain-rgb',
          tileSize: 512,
          maxzoom: 14,
        });
      }
      if (!map.getLayer('hillshade')) {
        map.addLayer(
          { id: 'hillshade', type: 'hillshade', source: 'dem-hillshade', paint: { 'hillshade-exaggeration': 0.6 } },
          'sky'
        );
      }

      // จุดตรวจจับ (circle layer)
      if (!map.getSource('points')) {
        map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      if (!map.getLayer('points-layer')) {
        map.addLayer({
          id: 'points-layer',
          type: 'circle',
          source: 'points',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6, 18, 10],
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.2,
            'circle-opacity': 0.95,
          },
        });
      }

      // No–Fly Zone (fill + outline)
      if (!map.getSource('no-fly')) {
        map.addSource('no-fly', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [makeCircle(noFlyCenter.lng, noFlyCenter.lat, noFlyRadius)] },
        });
      }
      if (!map.getLayer('no-fly-fill')) {
        map.addLayer({
          id: 'no-fly-fill',
          type: 'fill',
          source: 'no-fly',
          paint: { 'fill-color': '#ff3b3b', 'fill-opacity': 0.25 },
        });
      }
      if (!map.getLayer('no-fly-line')) {
        map.addLayer({
          id: 'no-fly-line',
          type: 'line',
          source: 'no-fly',
          paint: { 'line-color': '#ff3b3b', 'line-width': 3 },
        });
      }

      // Reticle (ศูนย์เล็ง)—ใช้ marker โปร่งใส + crosshair css
      const cross = document.createElement('div');
      cross.style.width = '18px';
      cross.style.height = '18px';
      cross.style.border = '2px solid #00bcd4';
      cross.style.borderRadius = '50%';
      cross.style.boxShadow = '0 0 0 2px rgba(0,188,212,.25)';
      cross.style.background = 'rgba(0,188,212,.08)';
      cross.style.pointerEvents = 'none';
      const centerMk = new mapboxgl.Marker({ element: cross }).setLngLat(map.getCenter()).addTo(map);

      // แจ้งตำแหน่ง/ความสูงปัจจุบันทุกครั้งที่ map เคลื่อน
      function emitCenter() {
        const c = map.getCenter();
        let alt = null;
        try {
          // ต้องเปิด terrain แล้วเท่านั้น
          alt = map.queryTerrainElevation(c, { exaggerated: false });
        } catch {}
        centerMk.setLngLat(c);
        onCenterChange &&
          onCenterChange({
            lng: c.lng,
            lat: c.lat,
            altitude: alt, // เป็นเมตร (อาจได้ null หากยังไม่โหลด DEM)
            zoom: map.getZoom(),
          });
      }
      emitCenter();
      map.on('moveend', emitCenter);
      map.on('pitchend', emitCenter);
      map.on('zoomend', emitCenter);

      // popup จุด
      const onClick = (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const [lng, lat] = feat.geometry.coordinates;
        const html = feat.properties?.html || '';
        if (html) new mapboxgl.Popup({ offset: 14 }).setLngLat([lng, lat]).setHTML(html).addTo(map);
      };
      map.on('click', 'points-layer', onClick);
    });

    const ro = new ResizeObserver(() => { if (map.isStyleLoaded()) map.resize(); });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ปรับความสูงภูเขา
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setTerrain({ source: 'mapbox-dem', exaggeration });
  }, [exaggeration, loaded]);

  // อัปเดตจุด + ตามจุดล่าสุด
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const data = (markers?.length ? markers : []).map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: {
        color: p.color || (p.objective === 'enemy' ? '#ff5b5b' : p.objective === 'our' ? '#16a34a' : '#6959ff'),
        html: p.html || '',
      },
    }));

    const src = map.getSource('points');
    if (src) src.setData({ type: 'FeatureCollection', features: data });

    if (followLatest && markers?.length) {
      const last = markers[markers.length - 1];
      map.flyTo({
        center: [last.lng, last.lat],
        zoom: Math.max(map.getZoom(), 14.5),
        pitch: 72,
        bearing: map.getBearing(),
        duration: 900,
        essential: true,
      });
    }
  }, [markers, followLatest, loaded]);

  // อัปเดตวง No–Fly เมื่อ prop เปลี่ยน
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource('no-fly');
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [makeCircle(noFlyCenter.lng, noFlyCenter.lat, noFlyRadius)],
      });
    }
  }, [noFlyCenter, noFlyRadius, loaded]);

  return (
    <div
      ref={containerRef}
      style={{ height: '74vh', width: '100%', borderRadius: 16, overflow: 'hidden' }}
    />
  );
}
