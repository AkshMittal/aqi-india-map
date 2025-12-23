export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve cached AQI
    if (url.pathname === "/aqi") {
      const cached = await env.AQI_KV.get("latest", "json");

      if (!cached) {
        return Response.json(
          { error: "AQI data not ready yet" },
          { status: 503 }
        );
      }

      return Response.json(cached);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env) {
    const res = await fetch(
      "https://api.openaq.org/v3/locations?country=IN&limit=1000",
      {
        headers: {
          Authorization: `Bearer ${env.OPENAQ_API_KEY}`
        }
      }
    );

    if (!res.ok) {
      console.error("OpenAQ fetch failed", res.status);
      return;
    }

    const raw = await res.json();
    const out = [];

    for (const r of raw.results || []) {
      if (!r.coordinates) continue;
      if (!Array.isArray(r.parameters)) continue;

      const pm = r.parameters.find(
        p => p.parameter === "pm2.5" || p.parameter === "pm25"
      );

      if (!pm || typeof pm.lastValue !== "number") continue;

      const aqi = Math.min(pm.lastValue * 4, 500);

      out.push({
        lat: r.coordinates.latitude,
        lon: r.coordinates.longitude,
        aqi
      });
    }

    console.log("Stations processed:", out.length);

    await env.AQI_KV.put("latest", JSON.stringify(out));
  }
};
		