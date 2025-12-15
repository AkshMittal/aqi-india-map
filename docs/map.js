const map = L.map('map').setView([22.5, 80], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap'
}).addTo(map);

// TEMP dummy data (replace after Step 3)
const dummy = [
  [28.61, 77.23, 0.8], 
  [19.07, 72.87, 0.6],
  [13.08, 80.27, 0.4]  
];

L.heatLayer(dummy, {
  radius: 40,
  blur: 25,
  maxZoom: 6
}).addTo(map);
