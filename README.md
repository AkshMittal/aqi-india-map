# AQI Heatmap (Learning Project)

🔗 **Live Demo:**  
https://akshmittal.github.io/aqi-india-map/

---

## What is this?

An **auto-updating AQI (Air Quality Index) heatmap**, focused on India but extensible to the rest of the world.

The frontend is a simple map visualization.  
All data ingestion, processing, and cleanup happens in a **Cloudflare Worker**.

This is **not a polished product** — it’s a learning-first system built to understand how real-world data pipelines behave.

---

## Motivation

The original goal was simple:
- build something shippable
- learn backend + data systems from scratch
- and ideally make some money

The money part didn’t work out.  
The learning part absolutely did.

This was my first time dealing with APIs, cron jobs, pagination, serverless backends, and messy real-world data.

---

## How it works (high level)

1. A **Cloudflare Worker** runs on a cron schedule  
2. Locations are fetched from the **OpenAQ API** using pagination  
3. A persistent cursor ensures incremental ingestion  
4. Locations are filtered:
   - valid coordinates  
   - PM2.5 sensor exists  
   - reading within last 30 days  
5. Latest available readings are fetched per station  
6. Data is stored as **last-known-good** in KV  
7. **Write-time deduplication**:
   - haversine distance < 100m  
   - newer timestamp wins  
8. Frontend consumes the cleaned KV data to render the heatmap  

Key idea:
> Station IDs ≠ physical stations.  
> Deduplication is based on distance and time, not IDs.

---

## Notes

- OpenAQ data contains many duplicate physical stations  
- Pagination limits caused several early “bugs” that weren’t actually bugs  
- Deduplication is incremental and converges over time  
- This repo exists as a learning artifact, not a startup pitch  

---

**builder gang.**
