const map = L.map('map').setView([22.5, 80], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap'
}).addTo(map);

const heatLayer = L.heatLayer([], {
  radius: 40,
  blur: 25,
  maxZoom: 6,
  willReadFrequently: true
}).addTo(map);

async function updateAQI() {
  const res = await fetch('https://aqi-data-fetch.akshmittal006.workers.dev/aqi-india-30d');
  const points = await res.json();

  const heat = points.map(p => [
    p.lat,
    p.lon,
    Math.min(p.aqi / 200, 1)
  ]);

  heatLayer.setLatLngs(heat);
}

updateAQI();

setInterval(updateAQI, 2 * 60 * 1000);
