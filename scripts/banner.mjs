// Draws the profile banner: a breaking wave off Oʻahu whose height follows
// the live NOAA buoy reading, with the spray drawn as a drifting particle
// network. Two palettes: dusk (dark mode) and morning (light mode).
//
// Everything here is plain SVG with SMIL animation, which GitHub renders
// inside a README <img>. No scripts, no fonts, no external assets.

const W = 1200;
const H = 420;
const WATER = 300; // still water line, px from the top

// Deterministic pseudo-random so the particle field is stable between runs.
// Only the wave changes day to day, which keeps commits small.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PALETTES = {
  dark: {
    skyTop: "#070b1f",
    skyMid: "#3b1d5a",
    skyLow: "#b4432b",
    horizon: "#f6b64b",
    sun: "#ffb347",
    sunGlow: "#ff8c42",
    land: "#120d1f",
    waterTop: "#1e3a8a",
    waterMid: "#0e4f75",
    waterDeep: "#06243a",
    waveFace: "#1d6fa5",
    waveLip: "#7cc4e8",
    foam: "#ffffff",
    glint: "#ffd27a",
    node: "#bfe9ff",
    link: "#9ad7f5",
    text: "#ffffff",
    subtext: "#ffd9a8",
    caption: "#cfe8f7",
    stars: true,
  },
  light: {
    skyTop: "#bfe6fb",
    skyMid: "#dff3fc",
    skyLow: "#fde7b2",
    horizon: "#fff3c4",
    sun: "#fff1a8",
    sunGlow: "#ffd166",
    land: "#3f5a4a",
    waterTop: "#38bdf8",
    waterMid: "#0284c7",
    waterDeep: "#075985",
    waveFace: "#0ea5e9",
    waveLip: "#bae6fd",
    foam: "#ffffff",
    glint: "#ffffff",
    node: "#0c4a6e",
    link: "#0369a1",
    text: "#0f172a",
    subtext: "#7c2d12",
    caption: "#e0f2fe",
    stars: false,
  },
};

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const f1 = (n) => Number(n).toFixed(1);

// The wave. `feet` is the buoy's significant wave height. The crest rises
// with it: a 1 ft day is a gentle bump, a 10 ft day fills the banner.
function wavePaths(feet) {
  const ft = Math.min(Math.max(feet, 0.5), 12);
  // Crest height in px above the water line. Capped so a 12 ft day peaks
  // just under the subtitle instead of through it.
  const A = 44 + ft * 7;
  const y = (k) => f1(WATER - A * k);

  // Main body: swell on the left, crest peaks around x=480, lip curls over
  // to the right and the tube runs down into whitewater.
  const body = [
    `M0 ${WATER}`,
    `C120 ${WATER - 6} 240 ${WATER - 10} 340 ${y(0.5)}`,
    `C400 ${y(0.85)} 440 ${y(1)} 480 ${y(1)}`,
    `C545 ${y(1)} 572 ${y(0.74)} 548 ${y(0.52)}`,
    `C528 ${y(0.36)} 560 ${y(0.3)} 630 ${y(0.14)}`,
    `C780 ${WATER + 4} 980 ${WATER - 4} ${W} ${WATER}`,
    `L${W} ${H} L0 ${H} Z`,
  ].join(" ");

  // Lighter face of the wave where the sun hits it.
  const face = [
    `M360 ${y(0.46)}`,
    `C410 ${y(0.78)} 445 ${y(0.93)} 480 ${y(0.93)}`,
    `C535 ${y(0.93)} 556 ${y(0.72)} 540 ${y(0.54)}`,
    `C500 ${y(0.5)} 440 ${y(0.46)} 400 ${y(0.3)}`,
    `C390 ${y(0.3)} 370 ${y(0.4)} 360 ${y(0.46)} Z`,
  ].join(" ");

  // The lip: a bright stroke along the crest and curl.
  const lip = [
    `M352 ${y(0.52)}`,
    `C405 ${y(0.86)} 442 ${y(1.01)} 480 ${y(1.01)}`,
    `C546 ${y(1.01)} 574 ${y(0.75)} 549 ${y(0.52)}`,
  ].join(" ");

  // Whitewater pouring out of the tube.
  const wash = [
    `M548 ${y(0.5)}`,
    `C600 ${y(0.3)} 660 ${y(0.1)} 760 ${WATER + 2}`,
    `C700 ${WATER + 14} 600 ${WATER + 12} 548 ${y(0.3)} Z`,
  ].join(" ");

  return { A, body, face, lip, wash, crestX: 480, crestY: WATER - A };
}

// A surfer, crouched and trimming along the face. Small enough that a few
// strokes read as a person. Positioned on the face below the crest.
function surfer(A, p) {
  const x = 418;
  const y = WATER - A * 0.42;
  const ink = p.stars ? "#0b1020" : "#0f172a";
  return `<g transform="translate(${x} ${f1(y)})">
    <animateTransform attributeName="transform" type="translate" values="${x} ${f1(y)};${x + 6} ${f1(y + 3)};${x} ${f1(y)}" dur="6s" repeatCount="indefinite"/>
    <g transform="rotate(-18)">
      <!-- board -->
      <path d="M-22 6 Q0 1 24 4 Q0 10 -22 6 Z" fill="${ink}"/>
      <!-- legs -->
      <path d="M-6 4 L-3 -6 M6 4 L3 -6" stroke="${ink}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <!-- body, leaning forward -->
      <path d="M0 -6 L4 -17" stroke="${ink}" stroke-width="2.8" stroke-linecap="round"/>
      <!-- arms out for balance -->
      <path d="M4 -14 L-6 -18 M4 -14 L14 -11" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
      <!-- head -->
      <circle cx="5.5" cy="-21" r="3.4" fill="${ink}"/>
    </g>
  </g>`;
}

// Spray above the crest, drawn as nodes with links between neighbors.
function sprayNetwork(crestX, crestY, A, p) {
  const r = rng(20260401);
  const n = 46;
  const nodes = [];
  // Spray blows back off the lip: thickest over the crest, then a plume
  // that drifts right and falls toward the tube. It never climbs above the
  // subtitle, so on a big day it goes sideways instead of up.
  const ceiling = 186;
  for (let i = 0; i < n; i++) {
    const t = r(); // 0 at the lip, 1 at the tail of the plume
    const x = crestX - 30 + t * 330 + r() * 30;
    const floor = crestY + 4 + t * A * 0.6; // plume sinks as it trails
    const top = Math.max(ceiling, floor - (56 + A * 0.45) * (1 - t * 0.5));
    const lift = Math.pow(r(), 0.8) * Math.max(10, floor - top);
    nodes.push({ x, y: floor - lift, s: 1.2 + r() * 2.2, d: 2.5 + r() * 3.5, b: r() * 4 });
  }
  const links = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.hypot(dx, dy);
      if (dist < 64) links.push([i, j, dist]);
    }
  }
  let out = `<g id="spray" opacity="0.9">`;
  for (const [i, j, dist] of links) {
    const a = nodes[i];
    const b = nodes[j];
    const op = (0.55 * (1 - dist / 64)).toFixed(2);
    out += `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${p.link}" stroke-width="0.8" opacity="${op}"/>`;
  }
  nodes.forEach((d, i) => {
    out += `<circle cx="${f1(d.x)}" cy="${f1(d.y)}" r="${f1(d.s)}" fill="${p.node}">` +
      `<animate attributeName="opacity" values="0.35;1;0.35" dur="${f1(d.d)}s" begin="${f1(d.b)}s" repeatCount="indefinite"/>` +
      `</circle>`;
  });
  out += `</g>`;
  // The whole cloud rises and falls slowly, like spray hanging in the wind.
  return `<g><animateTransform attributeName="transform" type="translate" values="0 0;8 -6;0 0" dur="7s" repeatCount="indefinite"/>${out}</g>`;
}

function stars(p) {
  if (!p.stars) return "";
  const r = rng(7);
  let out = `<g>`;
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = r() * 150;
    const s = 0.6 + r() * 1.2;
    out += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(s)}" fill="#ffffff" opacity="0.7">` +
      `<animate attributeName="opacity" values="0.2;0.9;0.2" dur="${f1(3 + r() * 5)}s" begin="${f1(r() * 5)}s" repeatCount="indefinite"/></circle>`;
  }
  return out + `</g>`;
}

function clouds(p) {
  if (p.stars) return "";
  const cloud = (x, y, s, dur) =>
    `<g opacity="0.85"><animateTransform attributeName="transform" type="translate" values="0 0;18 0;0 0" dur="${dur}s" repeatCount="indefinite"/>` +
    `<ellipse cx="${x}" cy="${y}" rx="${60 * s}" ry="${14 * s}" fill="#ffffff"/>` +
    `<ellipse cx="${x - 30 * s}" cy="${y + 4 * s}" rx="${36 * s}" ry="${11 * s}" fill="#ffffff"/>` +
    `<ellipse cx="${x + 34 * s}" cy="${y + 5 * s}" rx="${40 * s}" ry="${10 * s}" fill="#ffffff"/></g>`;
  return cloud(720, 70, 1, 40) + cloud(1010, 120, 0.7, 55) + cloud(240, 60, 0.6, 48);
}

// Diamond Head, as seen from the water off Waikīkī.
function diamondHead(p) {
  const pts = [
    [760, WATER], [830, 286], [880, 262], [925, 246], [955, 236], [985, 231],
    [1010, 233], [1040, 240], [1075, 238], [1110, 246], [1150, 262], [1200, 282], [1200, WATER],
  ].map(([x, y]) => `${x},${y}`).join(" ");
  return `<polygon points="${pts}" fill="${p.land}"/>`;
}

function sun(p) {
  // Dusk: half set into the sea between the wave and Diamond Head.
  // Morning: higher and paler.
  const cy = p.stars ? 290 : 150;
  const cx = p.stars ? 712 : 860;
  const r = p.stars ? 54 : 34;
  return `
  <radialGradient id="sunglow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${p.sunGlow}" stop-opacity="0.75"/>
    <stop offset="100%" stop-color="${p.sunGlow}" stop-opacity="0"/>
  </radialGradient>
  <circle cx="${cx}" cy="${cy}" r="${r * 3.2}" fill="url(#sunglow)">
    <animate attributeName="r" values="${r * 3};${r * 3.5};${r * 3}" dur="9s" repeatCount="indefinite"/>
  </circle>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.sun}"/>`;
}

// Moving texture on the water: thin wavy lines that drift left.
function waterLines(p) {
  let d = "";
  for (let row = 0; row < 7; row++) {
    const y = WATER + 18 + row * 16;
    let path = `M-80 ${y}`;
    for (let x = -80; x < W + 160; x += 80) {
      path += ` q20 -${4 + row} 40 0 t40 0`;
    }
    d += `<path d="${path}" fill="none" stroke="${p.glint}" stroke-width="${(1.2 - row * 0.12).toFixed(2)}" opacity="${(0.28 - row * 0.03).toFixed(2)}"/>`;
  }
  return `<g><animateTransform attributeName="transform" type="translate" values="0 0;-80 0" dur="10s" repeatCount="indefinite"/>${d}</g>`;
}

export function buildBanner({ mode, feet, period, direction, sunset, updated }) {
  const p = PALETTES[mode];
  const w = wavePaths(feet);
  const reading = feet
    ? `South shore buoy: ${f1(feet)} ft swell at ${period} s from the ${direction}`
    : `South shore buoy: no reading right now`;
  const sunsetText = sunset ? `Sunset ${sunset} HST` : "";
  const title = mode === "dark" ? "Rob Conery, dusk off Waikīkī" : "Rob Conery, morning off Waikīkī";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
  <title id="t">${esc(title)}</title>
  <desc id="d">${esc(`A breaking wave drawn to today's buoy reading. ${reading}. ${sunsetText}`)}</desc>
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.skyTop}"/>
      <stop offset="0.55" stop-color="${p.skyMid}"/>
      <stop offset="0.86" stop-color="${p.skyLow}"/>
      <stop offset="1" stop-color="${p.horizon}"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.waterTop}"/>
      <stop offset="0.5" stop-color="${p.waterMid}"/>
      <stop offset="1" stop-color="${p.waterDeep}"/>
    </linearGradient>
    <linearGradient id="face" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.waveLip}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${p.waveFace}" stop-opacity="0.2"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="frame"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  </defs>

  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${stars(p)}
    ${clouds(p)}
    ${sun(p)}
    ${diamondHead(p)}

    <!-- sea -->
    <rect x="0" y="${WATER}" width="${W}" height="${H - WATER}" fill="url(#water)"/>
    ${waterLines(p)}

    <!-- the wave, breathing slightly like a set rolling through -->
    <g>
      <animateTransform attributeName="transform" type="translate" values="0 0;0 5;0 0" dur="6s" repeatCount="indefinite"/>
      <path d="${w.body}" fill="url(#water)"/>
      <path d="${w.face}" fill="url(#face)"/>
      <path d="${w.wash}" fill="${p.foam}" opacity="0.55" filter="url(#soft)"/>
      <path d="${w.lip}" fill="none" stroke="${p.foam}" stroke-width="5" stroke-linecap="round" opacity="0.95" filter="url(#glow)"/>
      ${surfer(w.A, p)}
      ${sprayNetwork(w.crestX, w.crestY, w.A, p)}
    </g>

    <!-- name -->
    <g font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">
      <text x="64" y="118" font-size="66" font-weight="800" fill="${p.text}" letter-spacing="-1.5">Rob Conery</text>
      <text x="66" y="156" font-size="22" font-weight="500" fill="${p.subtext}">Honolulu · Postgres · AI · books, video, and shipping things</text>
      <text x="64" y="${H - 26}" font-size="16" fill="${p.caption}" opacity="0.95">${esc(reading)}</text>
      <text x="${W - 64}" y="${H - 26}" font-size="16" fill="${p.caption}" opacity="0.95" text-anchor="end">${esc(sunsetText)}${sunsetText && updated ? " · " : ""}${esc(updated || "")}</text>
    </g>
  </g>
</svg>
`;
}
