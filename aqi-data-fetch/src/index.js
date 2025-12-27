const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

const BACKFILL_BATCH = 30; // stations per cron
const BACKFILL_CURSOR_KEY = "india_backfill_cursor";
const PAGE_KEY = "india_locations_page";
const INDIA_LKG_KEY = "india_lkg_30d";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = 30;

const INDIA_BBOX = "68,6,97.5,37.5";
const LIMIT = 1000;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/aqi-india-30d") {
      const data = await env.AQI_KV.get(INDIA_LKG_KEY, { type: "json" });
      return new Response(JSON.stringify(Object.values(data || {})), {
        headers: CORS_HEADERS
      });
    }

    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: CORS_HEADERS }
    );
  },

  async scheduled(event, env) {
    console.log("[CRON] India bbox backfill tick");

    if (!env.OPENAQ_API_KEY) {
      console.error("[CRON] OPENAQ_API_KEY missing");
      return;
    }

    const cutoff = Date.now() - DAYS * DAY_MS;

    let page = Number(await env.AQI_KV.get(PAGE_KEY)) || 1;
    let cursor = Number(await env.AQI_KV.get(BACKFILL_CURSOR_KEY)) || 0;

    const locRes = await fetch(
      `https://api.openaq.org/v3/locations?bbox=${INDIA_BBOX}&limit=${LIMIT}&page=${page}`,
      { headers: { "X-API-Key": env.OPENAQ_API_KEY } }
    );

    if (!locRes.ok) {
      console.error("[CRON] Locations fetch failed:", locRes.status);
      return;
    }

    const locData = await locRes.json();
    const locations = locData.results || [];

    console.log(
      `[CRON] Locations fetched | page=${page} | pageSize=${locations.length}`
    );

    let indiaLKG =
      (await env.AQI_KV.get(INDIA_LKG_KEY, { type: "json" })) || {};

    let processed = 0;
	let selfUpdates = 0;
	let incomingDropped = 0;
	let prevKeyDropped = 0;

    for (let i = cursor; i < locations.length && processed < BACKFILL_BATCH; i++){
		const loc = locations[i];
		processed++;

		const lat = Number(loc.coordinates?.latitude);
		const lon = Number(loc.coordinates?.longitude);
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue; // Entries without timestamps are allowed to pass ingestion, but will lose comparison so naturally unselected

		// Defensive India bbox check
		if (lon < 68 || lon > 97.5 || lat < 6 || lat > 37.5) continue;

		if (
			!Array.isArray(loc.sensors) ||
			!loc.sensors.some(s => s.parameter?.name === "pm25")
		) continue;

		const latestRes = await fetch(
			`https://api.openaq.org/v3/locations/${loc.id}/latest`,
			{ headers: { "X-API-Key": env.OPENAQ_API_KEY } }
		);

		if (!latestRes.ok) continue;

		const latest = await latestRes.json();

		let value = null;
		let ts = null;

		for (const r of latest.results || []) {
			if (typeof r.value === "number") {
				value = r.value;
				const dateStr = r.datetime?.utc || r.datetime?.local || null;
				if (dateStr) ts = Date.parse(dateStr);
				break;
			}
		}

		if (typeof value !== "number") continue;
		if (Number.isFinite(ts) && ts < cutoff) continue;

		const incoming = {
			id: loc.id,
			lat,
			lon,
			aqi: Math.min(value * 4, 500),
			ts,
			lastSeen: ts ? new Date(ts).toISOString() : null,
			ageDays: ts ? Math.round((Date.now() - ts) / DAY_MS) : null
		};

		if (indiaLKG[loc.id]) {
			indiaLKG[loc.id] = incoming;
			selfUpdates++;
		} else {
			indiaLKG[loc.id] = incoming; 
		}

		for (const [otherId, other] of Object.entries(indiaLKG)) {   //One dedup comparison only
			if (otherId === String(loc.id)) continue;

			const dist = haversineMeters(
				incoming.lat,
				incoming.lon,
				other.lat,
				other.lon
			);

			if (dist < 100) {
				
				const incomingTs = incoming.ts ?? 0; // decide freshness
				const otherTs = other.ts ?? 0;

				if (incomingTs >= otherTs) {
					delete indiaLKG[otherId];  // incoming wins -> delete other
					console.log(
						`[DEDUP] ${loc.id} replaced ${otherId} | d=${Math.round(dist)}m`
					);
					prevKeyDropped++;
					break;
				} else {
					delete indiaLKG[loc.id];  // existing wins -> delete incoming
					console.log(
						`[DEDUP] ${otherId} kept over ${loc.id} | d=${Math.round(dist)}m`
					);
					incomingDropped++;
					break;
				}
			}
		}
	}

    cursor += processed;

    console.log(
		`[CRON] processed=${processed}, selfUpdates=${selfUpdates}, prevKeyDropped=${prevKeyDropped}, incomingDropped=${incomingDropped}, page=${page}, cursor=${cursor}, pageSize=${locations.length}`
	);


    // PAGE TRANSITION (more pages likely)
    if (cursor >= locations.length && locations.length === LIMIT) {
      console.log(`[CRON] Page ${page} exhausted → moving to page ${page + 1}`);
      page += 1;
      cursor = 0;
    }

    // FULL REFRESH (true exhaustion)
    else if (cursor >= locations.length && locations.length < LIMIT) {
      console.log(
        `[CRON] FULL REFRESH | usable stations=${Object.keys(indiaLKG).length}`
      );
      page = 1;
      cursor = 0;
    }
	// intentional extra iteration if final page has exactly 1000 locations (unlikely)

    await env.AQI_KV.put(BACKFILL_CURSOR_KEY, String(cursor));
    await env.AQI_KV.put(PAGE_KEY, String(page));
    await env.AQI_KV.put(INDIA_LKG_KEY, JSON.stringify(indiaLKG));
  }
};
