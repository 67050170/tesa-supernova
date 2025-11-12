import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CFG } from './config';

mapboxgl.accessToken = CFG.MAPBOX_TOKEN;

export default function DroneMap({
  markers = [],        // [{lat,lng,color?,html?}]
  exaggeration = 1.8,
  followLatest = true,
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
      center: [100.985, 14.234],
      zoom: 13.2,
      pitch: 70,
      bearing: -25,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }));

    map.on('load', () => {
      setLoaded(true);

      // Sky + Fog
      if (!map.getLayer('sky')) {
        map.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0, 0],
            'sky-atmosphere-sun-intensity': 12,
          },
        });
      }
      map.setFog({
        range: [0.6, 10],
        'horizon-blend': 0.2,
        color: 'hsl(220,60%,70%)',
        'high-color': 'hsl(220,80%,90%)',
        'space-color': 'hsl(220,100%,5%)',
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

      // Hillshade
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
          {
            id: 'hillshade',
            type: 'hillshade',
            source: 'dem-hillshade',
            paint: { 'hillshade-exaggeration': 0.6 },
          },
          'sky'
        );
      }

      // 3D buildings
      const labelLayerId = (map.getStyle().layers || []).find(
        (l) => l.type === 'symbol' && l.layout && l.layout['text-field']
      )?.id;
      if (!map.getLayer('3d-buildings')) {
        map.addLayer(
          {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', ['get', 'extrude'], 'true'],
            type: 'fill-extrusion',
            minzoom: 12,
            paint: {
              'fill-extrusion-color': '#bfbfbf',
              'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12, 0, 16, ['get', 'height']],
              'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 12, 0, 16, ['get', 'min_height']],
              'fill-extrusion-opacity': 0.6,
            },
          },
          labelLayerId
        );
      }

      // source/layer สำหรับจุด
      if (!map.getSource('points')) {
        map.addSource('points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
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
    });

    const ro = new ResizeObserver(() => { if (map.isStyleLoaded()) map.resize(); });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  // ปรับความสูง terrain ถ้า prop เปลี่ยน
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setTerrain({ source: 'mapbox-dem', exaggeration });
  }, [exaggeration, loaded]);

  // อัปเดตจุดตาม markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const data = (markers && markers.length > 0)
      ? markers
      : [{ lat: 14.234, lng: 100.985, color: '#6959ff', html: '<b>Test point</b>' }];

    const fc = {
      type: 'FeatureCollection',
      features: data.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          color:
            p.color ||
            (p.objective === 'enemy' ? '#ff5b5b' : p.objective === 'our' ? '#16a34a' : '#6959ff'),
          html: p.html || '',
        },
      })),
    };

    const src = map.getSource('points');
    if (src) src.setData(fc);

    if (data.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      data.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 80, duration: 800, pitch: 70, bearing: map.getBearing() });
    }

    if (followLatest && markers && markers.length > 0) {
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

    const onClick = (e) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const [lng, lat] = feat.geometry.coordinates;
      const html = feat.properties?.html || '';
      if (html) new mapboxgl.Popup({ offset: 14 }).setLngLat([lng, lat]).setHTML(html).addTo(map);
    };
    map.on('click', 'points-layer', onClick);
    return () => map.off('click', 'points-layer', onClick);
  }, [markers, followLatest, loaded]);

  return (
    <div
      ref={containerRef}
      style={{ height: '75vh', width: '100%', borderRadius: 16, overflow: 'hidden', willChange: 'transform' }}
    />
  );
}
