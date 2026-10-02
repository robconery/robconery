// Refreshes the live parts of the profile:
//   1. the banner, redrawn to the NOAA buoy reading off Oʻahu's south shore
//   2. the surf and sunset line under it
//   3. the latest newsletter post and YouTube video
//
// Run with `node scripts/update.mjs`. No dependencies. Anything that fails
// to fetch keeps the last good value from data/latest.json.

import { readFile, writeFile } from "node:fs/promises";
import { buildBanner } from "./banner.mjs";

const ROOT = new URL("../", import.meta.url);
const DATA = new URL("data/latest.json", ROOT);
const README = new URL("README.md", ROOT);

// Pearl Harbor entrance buoy, the closest NDBC station to the south shore.
// Waimea Bay (north shore) is the fallback.
const BUOYS = ["51211", "51201"];
const NEWSLETTER = "https://a.bigmachine.io/feed.xml";
const YOUTUBE = "https://www.youtube.com/feeds/videos.xml?channel_id=UCA-CCez65cHpryYdqy7s_5Q";
const HONOLULU = { lat: 21.3069, lng: -157.8583, tz: -10 };

const UA = { "User-Agent": "robconery-profile (github.com/robconery/robconery)" };

async function fetchText(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function compass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// NDBC realtime2 text format: header rows start with #, then one row per
// observation, newest first. "MM" means missing.
async function buoy() {
  for (const id of BUOYS) {
    try {
      const txt = await fetchText(`https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`);
      const lines = txt.split("\n").filter((l) => l && !l.startsWith("#"));
      const header = txt.split("\n")[0].replace(/^#/, "").trim().split(/\s+/);
      const col = (name) => header.indexOf(name);
      for (const line of lines.slice(0, 12)) {
        const f = line.trim().split(/\s+/);
        const h = f[col("WVHT")];
        if (h === "MM") continue;
        const feet = Math.round(parseFloat(h) * 3.28084 * 10) / 10;
        const period = f[col("DPD")] === "MM" ? null : Math.round(parseFloat(f[col("DPD")]));
        const mwd = f[col("MWD")] === "MM" ? null : parseInt(f[col("MWD")], 10);
        const waterC = f[col("WTMP")] === "MM" ? null : parseFloat(f[col("WTMP")]);
        return {
          station: id,
          feet,
          period,
          direction: mwd == null ? null : compass(mwd),
          waterF: waterC == null ? null : Math.round(waterC * 9 / 5 + 32),
          observed: `${f[0]}-${f[1]}-${f[2]}T${f[3]}:${f[4]}:00Z`,
        };
      }
    } catch (err) {
      console.error(`buoy ${id} failed:`, err.message);
    }
  }
  return null;
}

// Sunset for today in Honolulu, from the NOAA solar position equations.
// Accurate to a minute or so, which is plenty for a line on a web page.
function sunset(date, { lat, lng, tz }) {
  const rad = Math.PI / 180;
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const n = jdn - 2451545 + 0.0008 - lng / 360;
  const M = (357.5291 + 0.98560028 * n) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jt = 2451545 + n + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const dec = Math.asin(Math.sin(L * rad) * Math.sin(23.4397 * rad));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  const w = Math.acos(cosW) / rad;
  const Jset = Jt + w / 360;
  // Julian day to UTC, then shift to local.
  const ms = (Jset - 2440587.5) * 86400000;
  const local = new Date(ms + tz * 3600000);
  let h = local.getUTCHours();
  const min = local.getUTCMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(min).padStart(2, "0")} ${ampm}`;
}

function firstItem(xml, itemTag, titleTag, linkAttr, dateTag) {
  const item = xml.match(new RegExp(`<${itemTag}[\\s>][\\s\\S]*?<\\/${itemTag}>`));
  if (!item) return null;
  const block = item[0];
  const title = block.match(new RegExp(`<${titleTag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${titleTag}>`))?.[1]?.trim();
  const link = linkAttr
    ? block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1]
    : block.match(/<link>([^<]+)<\/link>/)?.[1]?.trim();
  const date = block.match(new RegExp(`<${dateTag}>([^<]+)<\\/${dateTag}>`))?.[1]?.trim();
  if (!title || !link) return null;
  return { title, link, date: date ? new Date(date).toISOString() : null };
}

async function newsletter() {
  try {
    const xml = await fetchText(NEWSLETTER);
    return firstItem(xml, "item", "title", false, "pubDate");
  } catch (err) {
    console.error("newsletter failed:", err.message);
    return null;
  }
}

async function video() {
  try {
    const xml = await fetchText(YOUTUBE);
    return firstItem(xml, "entry", "title", true, "published");
  } catch (err) {
    console.error("youtube failed:", err.message);
    return null;
  }
}

function hst(date) {
  return new Date(date.getTime() + HONOLULU.tz * 3600000);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = hst(new Date(iso));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function fmtStamp(date) {
  const d = hst(date);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  let h = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${day}, ${h}:${min} ${ampm} HST`;
}

function replaceBlock(text, name, body) {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(text)) throw new Error(`README is missing the ${name} markers`);
  return text.replace(re, `$1\n${body}\n$2`);
}

async function main() {
  let previous = {};
  try {
    previous = JSON.parse(await readFile(DATA, "utf8"));
  } catch {
    // first run
  }

  const now = new Date();
  const [b, n, v] = await Promise.all([buoy(), newsletter(), video()]);
  const data = {
    updated: now.toISOString(),
    buoy: b ?? previous.buoy ?? null,
    sunset: sunset(now, HONOLULU),
    newsletter: n ?? previous.newsletter ?? null,
    video: v ?? previous.video ?? null,
  };

  const stamp = fmtStamp(now);
  const bannerArgs = {
    feet: data.buoy?.feet ?? 0,
    period: data.buoy?.period ?? "",
    direction: data.buoy?.direction ?? "",
    sunset: data.sunset,
    updated: stamp,
  };
  await writeFile(new URL("assets/banner-dark.svg", ROOT), buildBanner({ mode: "dark", ...bannerArgs }));
  await writeFile(new URL("assets/banner-light.svg", ROOT), buildBanner({ mode: "light", ...bannerArgs }));

  let surf;
  if (data.buoy) {
    const bits = [`**${data.buoy.feet} ft** swell`];
    if (data.buoy.period) bits.push(`at ${data.buoy.period} s`);
    if (data.buoy.direction) bits.push(`out of the ${data.buoy.direction}`);
    const water = data.buoy.waterF ? `, water ${data.buoy.waterF}°F` : "";
    const where = data.buoy.station === "51211" ? "south shore" : "north shore";
    surf = `Oʻahu right now: ${bits.join(" ")} on the ${where} buoy${water}. Sunset ${data.sunset} HST. <sub>Updated ${stamp}</sub>`;
  } else {
    surf = `Oʻahu right now: the buoy isn't talking. Sunset ${data.sunset} HST. <sub>Updated ${stamp}</sub>`;
  }

  const latest = [];
  if (data.newsletter) latest.push(`- Newsletter: [${data.newsletter.title}](${data.newsletter.link}) <sub>${fmtDate(data.newsletter.date)}</sub>`);
  if (data.video) latest.push(`- Video: [${data.video.title}](${data.video.link}) <sub>${fmtDate(data.video.date)}</sub>`);

  let readme = await readFile(README, "utf8");
  // GitHub caches README images by URL, so a redrawn banner at the same
  // path can show stale for hours. A version stamp on the URL fixes that.
  const stampV = now.getTime();
  readme = readme.replace(/assets\/banner-(dark|light)\.svg(\?v=\d+)?/g, `assets/banner-$1.svg?v=${stampV}`);
  readme = replaceBlock(readme, "surf", surf);
  readme = replaceBlock(readme, "latest", latest.join("\n") || "- Nothing new yet.");
  await writeFile(README, readme);
  await writeFile(DATA, JSON.stringify(data, null, 2) + "\n");

  console.log(surf);
  console.log(latest.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
