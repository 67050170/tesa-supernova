// server/index.js
const WebSocket = require('ws');        // ใช้ ws บน Node
const http = require('http');

const PORT = process.env.PORT || 8787;

// กล่องกลางเมืองกรุงเทพ (คร่าว ๆ) เอาไว้สุ่มจุด
const BBOX = [100.55, 13.70, 100.68, 13.78]; // [minLng, minLat, maxLng, maxLat]

// ยูทิลสุ่มภายใน bbox
function rnd(min, max) { return min + Math.random() * (max - min); }
function randomPoint() {
  return [rnd(BBOX[0], BBOX[2]), rnd(BBOX[1], BBOX[3])];
}

// เริ่มด้วยรถ N คัน
const CAR_COUNT = 25;
let cars = [...Array(CAR_COUNT)].map(() => ({
  id: Math.random().toString(36).slice(2),
  lng: rnd(BBOX[0], BBOX[2]),
  lat: rnd(BBOX[1], BBOX[3]),
  bearing: Math.random() * 360,
  speed: 4 + Math.random() * 10 // m/s
}));

// อัปเดตรถให้เคลื่อนไหว
function tickCars(dt) {
  // approx: 1 องศา เส้นศูนย์สูตร ~ 111_000 m
  const M_PER_DEG = 111000;
  cars = cars.map(c => {
    // เปลี่ยนทิศเล็กน้อย
    c.bearing += (Math.random() - 0.5) * 10;
    const rad = (c.bearing * Math.PI) / 180;
    const dx = (Math.cos(rad) * c.speed * dt) / M_PER_DEG;
    const dy = (Math.sin(rad) * c.speed * dt) / M_PER_DEG;

    c.lng += dx;
    c.lat += dy;

    // ถ้าหลุดขอบ ให้เด้งกลับเข้า bbox
    if (c.lng < BBOX[0]) c.lng = BBOX[0];
    if (c.lng > BBOX[2]) c.lng = BBOX[2];
    if (c.lat < BBOX[1]) c.lat = BBOX[1];
    if (c.lat > BBOX[3]) c.lat = BBOX[3];
    return c;
  });
}

// จำลองความหนาแน่นประชากร: สุ่มกลุ่มก้อน (hotspots)
function makePopulationPoints() {
  // สร้างศูนย์กลาง 5 จุด แล้วกระจายจุดรอบ ๆ
  const centers = [...Array(5)].map(() => randomPoint());
  const pts = [];
  centers.forEach(([clng, clat]) => {
    const count = 60 + Math.floor(Math.random() * 120);
    for (let i = 0; i < count; i++) {
      const offLng = (Math.random() - 0.5) * 0.01;
      const offLat = (Math.random() - 0.5) * 0.01;
      pts.push([clng + offLng, clat + offLat]);
    }
  });
  return pts;
}

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'hello', ok: true }));
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;

  tickCars(dt);

  const vehiclesGeoJSON = {
    type: "FeatureCollection",
    features: cars.map(c => ({
      type: "Feature",
      properties: { id: c.id, bearing: c.bearing, speed: c.speed },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] }
    }))
  };

  const populationGeoJSON = {
    type: "FeatureCollection",
    features: makePopulationPoints().map(([lng, lat]) => ({
      type: "Feature",
      properties: { weight: 1 + Math.random() * 2 },
      geometry: { type: "Point", coordinates: [lng, lat] }
    }))
  };

  const payloadVehicles = JSON.stringify({ type: 'vehicles', data: vehiclesGeoJSON });
  const payloadPop = JSON.stringify({ type: 'population', data: populationGeoJSON });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payloadVehicles);
      client.send(payloadPop);
    }
  });
}, 1000);

server.listen(PORT, () => {
  console.log('WS server on ws://localhost:' + PORT);
});
