const map = L.map('map').setView([22.5, 80], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap'
}).addTo(map);

fetch('aqi-data-fetch.akshmittal006.workers.dev/aqi')
  .then(r => r.json())
  .then(points => {
    const heat = points.map(p => [
      p.lat,
      p.lon,
      Math.min(p.aqi / 500, 1)
    ]);

    L.heatLayer(heat, {
      radius: 40,
      blur: 25,
      maxZoom: 6
    }).addTo(map);
  });

L.heatLayer(dummy, {
  radius: 40,
  blur: 25,
  maxZoom: 6
}).addTo(map);
