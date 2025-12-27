const map = L.map('map').setView([22.5, 80], 5);
const legend = L.control({ position: "bottomright" });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap'
}).addTo(map);

legend.onAdd = function () {
  const div = L.DomUtil.create("div", "aqi-legend");
  div.innerHTML = `
    <strong>AQI (relative intensity)</strong><br>
    <i style="background:#2c7bb6"></i> Low<br>
    <i style="background:#00ffcc"></i> Moderate<br>
    <i style="background:#ffff00"></i> High<br>
    <i style="background:#ff7e00"></i> Very High<br>
    <i style="background:#ff0000"></i> Severe
  `;
  return div;
};

legend.addTo(map);

const heatLayer = L.heatLayer([], {
  radius: 40,
  blur: 25,
  maxZoom: 6
}).addTo(map);

map.on("zoomend", () => {
  const z = map.getZoom();
  heatLayer.setOptions({
    radius: z < 6 ? 15 : 25
  });
});

async function updateAQI() {
  const res = await fetch('https://aqi-data-fetch.akshmittal006.workers.dev/aqi-india-30d');
  const points = await res.json();

  const heat = points.map(p => [
    p.lat,
    p.lon,
    Math.sqrt(Math.min(p.aqi / 500, 1), 0.4)

  ]);

  heatLayer.setLatLngs(heat);
}

updateAQI();

setInterval(updateAQI, 2 * 60 * 1000);
