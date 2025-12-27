const map = L.map('map').setView([22.5, 80], 5);
const legend = L.control({ position: "bottomright" });

legend.onAdd = function () {
  const div = L.DomUtil.create("div", "aqi-legend");
  div.innerHTML = `
    <strong>AQI</strong><br>
    <i style="background:#00e400"></i> 0–50<br>
    <i style="background:#ffff00"></i> 51–100<br>
    <i style="background:#ff7e00"></i> 101–200<br>
    <i style="background:#ff0000"></i> 201–300<br>
    <i style="background:#8f3f97"></i> 301–500
  `;
  return div;
};

legend.addTo(map);


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
    Math.sqrt(Math.min(p.aqi / 500, 1))
  ]);

  heatLayer.setLatLngs(heat);
}

updateAQI();

setInterval(updateAQI, 2 * 60 * 1000);
