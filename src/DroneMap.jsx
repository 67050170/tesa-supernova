import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CFG } from './config';

mapboxgl.accessToken = CFG.MAPBOX_TOKEN;

export default function DroneMap({
  markers = [],
  exaggeration = 1.8,
  followLatest = true
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mkRef = useRef([]);
  const [loaded, setLoaded] = useState(false);

  // ✅ สร้างแผนที่ "ครั้งเดียว" ตรงนี้เท่านั้น
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12', // พื้นหลังภาพถ่าย
      center: [100.985, 14.234], // พื้นที่ภูเขาชัด (ทดลอง)
      zoom: 13.2,
      pitch: 70,
      bearing: -25,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }));

    // ✅ เปิด DEM + hillshade + sky/fog หลัง style โหลด
    map.on('load', () => {
      setLoaded(true);

      // Sky + Fog
      if (!map.getLayer('sky')) {
        map.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 0.0],
            'sky-atmosphere-sun-intensity': 12
          }
        });
      }
      map.setFog({
        'range': [0.6, 10],
        'horizon-blend': 0.2,
        'color': 'hsl(220,60%,70%)',
        'high-color': 'hsl(220,80%,90%)',
        'space-color': 'hsl(220,100%,5%)'
      });

      // DEM Terrain
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.terrain-rgb',
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: 'mapbox-dem', exaggeration });

      // Hillshade เพื่อเงาภูเขา
      if (!map.getSource('dem-hillshade')) {
        map.addSource('dem-hillshade', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.terrain-rgb',
          tileSize: 512,
          maxzoom: 14,
        });
      }
      if (!map.getLayer('hillshade')) {
        map.addLayer({
          id: 'hillshade',
          type: 'hillshade',
          source: 'dem-hillshade',
          paint: { 'hillshade-exaggeration': 0.6 }
        }, 'sky');
      }

      // (เสริม) 3D buildings ในเมือง
      const labelLayerId = (map.getStyle().layers || []).find(
        (l) => l.type === 'symbol' && l.layout && l.layout['text-field']
      )?.id;
      if (!map.getLayer('3d-buildings')) {
        map.addLayer({
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', ['get', 'extrude'], 'true'],
          type: 'fill-extrusion',
          minzoom: 12,
          paint: {
            'fill-extrusion-color': '#bfbfbf',
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12, 0, 16, ['get', 'height']],
            'fill-extrusion-base':   ['interpolate', ['linear'], ['zoom'], 12, 0, 16, ['get', 'min_height']],
            'fill-extrusion-opacity': 0.6
          }
        }, labelLayerId);
      }
    });

    // resize นุ่ม ๆ
    const ro = new ResizeObserver(() => {
      if (map.isStyleLoaded()) map.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ✅ บังคับปรับความสูงภูเขาเมื่อ prop เปลี่ยน
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setTerrain({ source: 'mapbox-dem', exaggeration });
  }, [exaggeration, loaded]);

  // ✅ วาง marker และ (ถ้าต้องการ) ไล่ตามจุดล่าสุด
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    mkRef.current.forEach((m) => m.remove());
    mkRef.current = [];

    mkRef.current = markers.map((p) => {
      const mk = new mapboxgl.Marker({ color: p.color || '#ff4fd8' }).setLngLat([p.lng, p.lat]);
      if (p.html) mk.setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(p.html));
      mk.addTo(map);
      return mk;
    });

    if (markers.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      markers.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 80, duration: 800, pitch: 70, bearing: map.getBearing() });
    }

    if (followLatest && markers.length > 0) {
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

  return (
    <div
      ref={containerRef}
      style={{ height: '75vh', width: '100%', borderRadius: 16, overflow: 'hidden', willChange: 'transform' }}
    />
  );
}
