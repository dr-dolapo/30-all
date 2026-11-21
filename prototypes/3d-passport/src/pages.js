/* 30-All Player Passport: every page is painted on a 2D canvas (no image assets), then used as a 3D texture. */
import { SHOTS, frame as shotFrame } from "./shots-core.js";

export const O = "#FF751F", O_DARK = "#E25F0C", INK = "#1C1A17", GREY = "#6F665B";
export const PW = 1024, PH = 1456;            // page canvas px (≈ 88×125 mm passport page)
export const W = 0.88, H = 1.25;              // page size in world units
export const CW = W + 0.03, CH = H + 0.04;    // cover overhangs the pages
export const CPW = Math.round((PW * CW) / W), CPH = Math.round((PH * CH) / H);

export const cnv = (w = PW, h = PH) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

export async function loadFonts(base = "fonts/") {
  const list = [["Poppins", "400", "poppins-latin-400-normal"], ["Poppins", "600", "poppins-latin-600-normal"], ["Poppins", "700", "poppins-latin-700-normal"],
    ["Poppins", "900", "poppins-latin-900-normal"], ["Space Mono", "400", "space-mono-latin-400-normal"], ["Caveat", "600", "caveat-latin-600-normal"]];
  await Promise.all(list.map(async ([f, w, file]) => { try { const ff = new FontFace(f, `url(${base}${file}.woff2)`, { weight: w }); await ff.load(); document.fonts.add(ff); } catch { /* fall back to system fonts */ } }));
}
export const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/* ---------- paper & security printing ---------- */
function paper(x, w, h, seed, base = "#FBF6EC") {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const r = rng(seed); x.save();
  for (let i = 0; i < 3200; i++) { x.globalAlpha = r() * 0.05; x.fillStyle = r() < 0.5 ? "#7a5a34" : "#ffffff"; x.fillRect(r() * w, r() * h, r() * 3 + 1, r() * 1.1 + 0.4); }
  x.restore();
}
function waves(x, w, h, color, alpha, step = 10, amp = 16, ph = 0) {
  x.save(); x.strokeStyle = color; x.globalAlpha = alpha; x.lineWidth = 1.1;
  for (let y = -60; y < h + 60; y += step) {
    x.beginPath();
    for (let X = 0; X <= w; X += 8) { const Y = y + Math.sin(X / 95 + y / 70 + ph) * amp + Math.sin(X / 31 + y / 13) * 2.5; X ? x.lineTo(X, Y) : x.moveTo(X, Y); }
    x.stroke();
  }
  x.restore();
}
function rosette(x, cx, cy, R, color, alpha, lw = 1.1, bands = 5, petals = 24) {
  x.save(); x.strokeStyle = color; x.globalAlpha = alpha; x.lineWidth = lw;
  for (let b = 0; b < bands; b++) {
    const rr = R * (0.55 + b * 0.09);
    x.beginPath();
    for (let i = 0; i <= 1440; i++) {
      const t = (i / 1440) * Math.PI * 2, m = rr + Math.sin(t * petals + b * 0.7) * R * 0.08 + Math.sin(t * petals * 2 - b) * R * 0.025;
      const X = cx + Math.cos(t) * m, Y = cy + Math.sin(t) * m; i ? x.lineTo(X, Y) : x.moveTo(X, Y);
    }
    x.stroke();
  }
  x.restore();
}
function microtext(x, y, w, text, color, alpha) {
  x.save(); x.font = "600 11px Poppins"; x.fillStyle = color; x.globalAlpha = alpha; x.letterSpacing = "1px";
  let s = ""; while (x.measureText(s).width < w) s += text + " · "; x.fillText(s, 0, y); x.restore();
}
function gutter(x, w, h, side) {
  const g = side === "left" ? x.createLinearGradient(0, 0, 110, 0) : x.createLinearGradient(w, 0, w - 110, 0);
  g.addColorStop(0, "rgba(70,45,20,.30)"); g.addColorStop(0.3, "rgba(70,45,20,.09)"); g.addColorStop(1, "rgba(70,45,20,0)");
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}
function security(x, w, h, seed, c1 = "#F4A877", c2 = "#7FB3A3") {
  waves(x, w, h, c1, 0.11, 12, 18, seed % 7);
  waves(x, w, h, c2, 0.1, 23, 30, (seed % 5) + 2);
  rosette(x, w * 0.5, h * 0.52, w * 0.42, c2, 0.2, 1.2, 6, 28);
  rosette(x, w * 0.5, h * 0.52, w * 0.24, c1, 0.18, 1, 4, 18);
}
function pageNo(x, n, side) {
  x.save(); x.font = "600 22px Poppins"; x.fillStyle = GREY; x.textAlign = side === "left" ? "left" : "right";
  x.fillText(String(n), side === "left" ? 64 : PW - 64, PH - 46); x.restore();
}

/* ---------- text helpers ---------- */
function fit(x, text, X, Y, maxW, align = "left") {
  const w = x.measureText(text).width, k = Math.min(1, maxW / w);
  x.save(); x.translate(X, Y); x.scale(k, 1); x.textAlign = align; x.fillText(text, 0, 0); x.restore();
}
function field(x, X, Y, label, value, { size = 40, weight = 600, font = "Poppins", maxW = 520, color = INK } = {}) {
  x.save(); x.font = "600 21px Poppins"; x.fillStyle = GREY; x.letterSpacing = "2px"; x.fillText(label.toUpperCase(), X, Y);
  x.letterSpacing = "0px"; x.font = `${weight} ${size}px ${font}`; x.fillStyle = color; fit(x, value, X, Y + size + 8, maxW); x.restore();
}
function wrap(x, text, cx, y, maxW, lh) {
  const words = text.split(" "); let line = ""; const lines = [];
  for (const w of words) { const t = line ? line + " " + w : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line); lines.forEach((l, i) => x.fillText(l, cx, y + i * lh)); return lines.length;
}
function rrect(x, X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r); }
function arcText(x, text, cx, cy, r, top) {
  const ch = [...text], ws = ch.map((c) => x.measureText(c).width), tot = ws.reduce((a, b) => a + b, 0);
  let a = (top ? -Math.PI / 2 : Math.PI / 2) + (top ? -1 : 1) * (tot / r / 2);
  ch.forEach((c, i) => {
    const da = ws[i] / r, m = a + (top ? da / 2 : -da / 2);
    x.save(); x.translate(cx + Math.cos(m) * r, cy + Math.sin(m) * r); x.rotate(m + (top ? Math.PI / 2 : -Math.PI / 2));
    x.textAlign = "center"; x.fillText(c, 0, top ? 0 : x.measureText("M").width * 0.75); x.restore();
    a += top ? da : -da;
  });
}

/* ---------- ink stamps: draw, then wear the ink away a little ---------- */
function inked(w, h, color, seed, draw) {
  const c = cnv(w, h), x = c.getContext("2d"); x.fillStyle = color; x.strokeStyle = color; draw(x, w, h);
  const r = rng(seed); x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < (w * h) / 140; i++) { x.globalAlpha = r() * 0.7; const s = r() * 2.4 + 0.5; x.fillRect(r() * w, r() * h, s, s); }
  for (let i = 0; i < 5; i++) { x.globalAlpha = 0.12 + r() * 0.2; x.lineWidth = 2 + r() * 6; x.beginPath(); const y0 = r() * h; x.moveTo(0, y0); x.lineTo(w, y0 + (r() - 0.5) * h * 0.4); x.stroke(); }
  const g = x.createLinearGradient(r() * w, 0, r() * w, h); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5 + r() * 0.5, `rgba(0,0,0,${0.25 + r() * 0.3})`); g.addColorStop(1, "rgba(0,0,0,0)");
  x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, w, h);
  return c;
}
function place(x, stamp, cx, cy, deg, alpha = 0.9) {
  x.save(); x.translate(cx, cy); x.rotate((deg * Math.PI) / 180); x.globalAlpha = alpha; x.globalCompositeOperation = "multiply";
  x.drawImage(stamp, -stamp.width / 2, -stamp.height / 2); x.restore();
}
const short = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const fmt = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

function ballIcon(x, cx, cy, r, lw) {
  x.save(); x.lineWidth = lw; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(cx - r * 1.35, cy, r * 0.95, -0.85, 0.85); x.stroke();
  x.beginPath(); x.arc(cx + r * 1.35, cy, r * 0.95, Math.PI - 0.85, Math.PI + 0.85); x.stroke(); x.restore();
}
function courtStampRound(court, color, seed, since) {
  return inked(520, 520, color, seed, (x) => {
    x.lineWidth = 10; x.beginPath(); x.arc(260, 260, 240, 0, 7); x.stroke();
    x.lineWidth = 4; x.beginPath(); x.arc(260, 260, 222, 0, 7); x.stroke();
    x.beginPath(); x.arc(260, 260, 140, 0, 7); x.stroke();
    x.font = "700 34px Poppins"; x.letterSpacing = "3px"; arcText(x, short(court.name.toUpperCase(), 26), 260, 260, 172, true);
    x.font = "700 30px Poppins"; arcText(x, "★ HOME COURT ★", 260, 260, 172, false);
    x.letterSpacing = "0px"; ballIcon(x, 260, 222, 40, 7);
    x.font = "700 30px Poppins"; x.textAlign = "center"; x.fillText(short((court.area || "").toUpperCase(), 14), 260, 300);
    x.font = "600 22px Poppins"; x.fillText(since, 260, 336);
  });
}
function courtStampRect(court, color, seed, n) {
  return inked(520, 300, color, seed, (x) => {
    x.lineWidth = 8; rrect(x, 8, 8, 504, 284, 26); x.stroke(); x.lineWidth = 3; rrect(x, 24, 24, 472, 252, 16); x.stroke();
    x.textAlign = "center"; x.font = "700 24px Poppins"; x.letterSpacing = "6px"; x.fillText("ADMITTED", 260, 72);
    x.letterSpacing = "0px"; x.font = "900 40px Poppins"; fit(x, short(court.name.toUpperCase(), 24), 260, 138, 430, "center");
    x.font = "600 26px Poppins"; x.fillText((court.area || "").toUpperCase(), 260, 184);
    x.fillRect(70, 206, 380, 3); x.font = "700 28px Space Mono"; x.fillText(court.first ? fmt(court.first) : `ENTRY Nº ${n}`, 260, 250);
  });
}
function matchStamp(m, seed) {
  const won = m.won, color = won ? "#1E7A4E" : "#3C4E8C";
  return inked(270, 270, color, seed, (x) => {
    x.textAlign = "center";
    if (won) { x.lineWidth = 7; x.beginPath(); x.arc(135, 135, 124, 0, 7); x.stroke(); x.lineWidth = 3; x.beginPath(); x.arc(135, 135, 110, 0, 7); x.stroke(); }
    else { x.lineWidth = 6; rrect(x, 12, 40, 246, 190, 18); x.stroke(); x.lineWidth = 2.5; rrect(x, 24, 52, 222, 166, 10); x.stroke(); }
    x.font = `900 ${won ? 46 : 38}px Poppins`; x.letterSpacing = "3px"; x.fillText(won ? "WON" : "PLAYED", 135, won ? 112 : 104); x.letterSpacing = "0px";
    x.font = "700 28px Space Mono"; fit(x, m.score, 135, won ? 152 : 144, 190, "center");
    x.font = "600 22px Poppins"; fit(x, "vs " + m.opp.toUpperCase(), 135, won ? 186 : 178, 180, "center");
    x.font = "600 18px Space Mono"; x.fillText(fmt(m.date), 135, won ? 214 : 206);
  });
}

/* ---------- MRZ (the two machine-readable lines at the bottom of the photo page) ---------- */
const mrzClean = (s) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, "<");
function check(s) { const v = (c) => (c === "<" ? 0 : /\d/.test(c) ? +c : c.charCodeAt(0) - 55); return [...s].reduce((a, c, i) => a + v(c) * [7, 3, 1][i % 3], 0) % 10; }
export function mrz(d) {
  const l1 = ("P<" + d.country + mrzClean(d.last) + "<<" + mrzClean(d.first)).padEnd(44, "<").slice(0, 44);
  const id = mrzClean(d.pid).padEnd(9, "<").slice(0, 9), since = new Date(d.since).toISOString().slice(2, 10).replace(/-/g, "");
  const tail = (d.hand === "Left" ? "L" : "R") + (d.backhand === "Two-handed" ? "2" : "1") + mrzClean(d.racquet.brand + " " + d.racquet.model);
  const l2 = (id + check(id) + d.country + since + check(since) + tail).padEnd(43, "<").slice(0, 43);
  return [l1, l2 + check(l2)];
}

/* ---------- avatar fallback: a drawn head-and-shoulders ---------- */
function drawAvatar(x, img, X, Y, w, h) {
  x.save(); rrect(x, X, Y, w, h, 12); x.clip();
  if (img) { const k = Math.max(w / img.width, h / img.height); x.drawImage(img, X + (w - img.width * k) / 2, Y + (h - img.height * k) / 2, img.width * k, img.height * k); }
  else {
    const g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, "#FFE3CF"); g.addColorStop(1, "#FFC9A3"); x.fillStyle = g; x.fillRect(X, Y, w, h);
    x.fillStyle = "#6B3E26"; x.beginPath(); x.ellipse(X + w / 2, Y + h * 0.95, w * 0.42, h * 0.3, 0, Math.PI, 0); x.fill();
    x.fillStyle = "#8A5232"; x.beginPath(); x.ellipse(X + w / 2, Y + h * 0.42, w * 0.2, h * 0.19, 0, 0, 7); x.fill();
    x.fillStyle = "#2A1A12"; x.beginPath(); x.ellipse(X + w / 2, Y + h * 0.3, w * 0.21, h * 0.1, 0, Math.PI, 0); x.fill();
    x.fillStyle = O; x.fillRect(X + w * 0.38, Y + h * 0.72, w * 0.24, h * 0.04);
  }
  // security lines printed over the photo
  waves(x, X + w, Y + h, "#ffffff", 0.12, 14, 10, 1); x.restore();
  x.save(); x.strokeStyle = "rgba(0,0,0,.18)"; x.lineWidth = 2; rrect(x, X, Y, w, h, 12); x.stroke(); x.restore();
}

/* ---------- pages ---------- */
export function idPage(d, A) {
  const c = cnv(), x = c.getContext("2d"); paper(x, PW, PH, 11); security(x, PW, PH, 12);
  x.font = "900 40px Poppins"; x.fillStyle = O; x.fillText("30-ALL", 64, 96);
  x.font = "600 22px Poppins"; x.fillStyle = GREY; x.letterSpacing = "4px"; x.textAlign = "right"; x.fillText("PLAYER PASSPORT", PW - 64, 92); x.textAlign = "left";
  x.letterSpacing = "1px"; x.font = "600 19px Poppins"; x.fillText(`TYPE P   ·   CODE 30A   ·   Nº ${d.pid}`, 64, 140); x.letterSpacing = "0px";
  x.fillStyle = O; x.fillRect(64, 158, PW - 128, 3);
  drawAvatar(x, A.avatar, 64, 196, 330, 420);
  const R = 430; field(x, R, 220, "Surname", d.last.toUpperCase(), { size: 44, weight: 700, maxW: 530 });
  field(x, R, 330, "Given names", d.first, { size: 44, maxW: 530 });
  x.font = "600 21px Poppins"; x.fillStyle = GREY; x.letterSpacing = "2px"; x.fillText("NATIONALITY", R, 440); x.letterSpacing = "0px";
  if (A.flag) { x.save(); rrect(x, R, 462, 66, 44, 6); x.clip(); x.drawImage(A.flag, R, 462, 66, 44); x.restore(); x.strokeStyle = "rgba(0,0,0,.15)"; x.lineWidth = 2; rrect(x, R, 462, 66, 44, 6); x.stroke(); }
  x.font = "600 40px Poppins"; x.fillStyle = INK; fit(x, d.nationality, R + (A.flag ? 84 : 0), 500, 440);
  field(x, R, 550, "Player ID", d.pid, { size: 40, font: "Space Mono", weight: 400 });
  x.fillStyle = "rgba(0,0,0,.08)"; x.fillRect(64, 652, PW - 128, 2);
  field(x, 64, 700, "Home court", d.home.name, { size: 42, maxW: PW - 128 });
  field(x, 64, 814, "Plays", d.hand === "Left" ? "Left-handed" : "Right-handed", { size: 40, maxW: 400 });
  field(x, 540, 814, "Backhand", d.backhand, { size: 40, maxW: 420 });
  x.font = "600 21px Poppins"; x.fillStyle = GREY; x.letterSpacing = "2px"; x.fillText("RACQUET", 64, 928); x.letterSpacing = "0px";
  x.font = "900 42px Poppins"; x.fillStyle = INK; const bw = x.measureText(d.racquet.brand.toUpperCase()).width; x.fillText(d.racquet.brand.toUpperCase(), 64, 978);
  x.font = "600 40px Poppins"; fit(x, d.racquet.model + (d.racquet.head ? `  ·  ${d.racquet.head} sq in` : ""), 64 + bw + 18, 978, PW - 128 - bw - 18);
  field(x, 64, 1042, "Member since", fmt(d.since), { size: 36, font: "Space Mono", weight: 400, maxW: 420 });
  x.font = "600 21px Poppins"; x.fillStyle = GREY; x.letterSpacing = "2px"; x.fillText("HOLDER'S SIGNATURE", 540, 1042); x.letterSpacing = "0px";
  x.font = "600 76px Caveat"; x.fillStyle = "#24346B"; x.save(); x.translate(548, 1118); x.rotate(-0.05); fit(x, `${d.first} ${d.last[0]}.`, 0, 0, 380); x.restore();
  // ghost photo
  x.save(); x.globalAlpha = 0.16; x.filter = "grayscale(1)"; drawAvatar(x, A.avatar, PW - 64 - 120, 196 + 420 - 150 + 0, 120, 150); x.restore();
  microtext(x, 1170, PW, "30-ALL PLAYER PASSPORT", O, 0.45);
  // MRZ
  x.fillStyle = "rgba(255,255,255,.6)"; x.fillRect(0, 1196, PW, 210);
  const [a, b] = mrz(d); x.font = "400 37px Space Mono"; x.fillStyle = INK;
  const cw = x.measureText("M").width, k = (PW - 100) / (cw * 44);
  [a, b].forEach((l, i) => { x.save(); x.translate(50, 1278 + i * 74); x.scale(k, 1); x.fillText(l, 0, 0); x.restore(); });
  gutter(x, PW, PH, "left");
  return c;
}

export function endpaper(text, sub, side, seed, n) {
  const c = cnv(), x = c.getContext("2d"); paper(x, PW, PH, seed, "#FFEBDD");
  waves(x, PW, PH, O, 0.2, 9, 22, seed); rosette(x, PW / 2, PH * 0.42, 420, O_DARK, 0.25, 1.3, 7, 30); rosette(x, PW / 2, PH * 0.42, 220, "#7FB3A3", 0.3, 1, 5, 20);
  x.strokeStyle = O; x.lineWidth = 6; x.fillStyle = O; ballIcon(x, PW / 2, PH * 0.42, 70, 8);
  x.fillStyle = "rgba(255,248,240,.82)"; rrect(x, 110, PH * 0.62, PW - 220, 400, 24); x.fill();
  x.fillStyle = INK; x.textAlign = "center"; x.font = "600 36px Poppins"; const lines = wrap(x, text, PW / 2, PH * 0.62 + 84, PW - 320, 52);
  x.font = "600 24px Poppins"; x.fillStyle = GREY; x.letterSpacing = "3px"; x.fillText(sub, PW / 2, PH * 0.62 + 84 + lines * 52 + 30); x.letterSpacing = "0px";
  x.textAlign = "left"; gutter(x, PW, PH, side); if (n) pageNo(x, n, side === "left" ? "right" : "left");
  return c;
}

export function courtsPage(d) {
  const c = cnv(), x = c.getContext("2d"); paper(x, PW, PH, 21); security(x, PW, PH, 22, "#C9B8E8", "#F4A877");
  x.font = "600 22px Poppins"; x.fillStyle = GREY; x.letterSpacing = "4px"; x.fillText("COURTS  ·  ENTRIES", 64, 96); x.letterSpacing = "0px";
  const sinceTxt = "SINCE " + new Date(d.since).getFullYear();
  place(x, courtStampRound(d.home, O_DARK, hash(d.home.name), sinceTxt), 500, 440, -9, 0.92);
  const inks = ["#2F4FA2", "#1E7A4E", "#6B3FA0", "#9A2C3B"], spots = [[330, 900, 7], [690, 1140, -6], [700, 760, 12], [320, 1260, -3]];
  d.courts.slice(0, 4).forEach((ct, i) => place(x, courtStampRect(ct, inks[i % 4], hash(ct.name) + i, i + 2), spots[i][0], spots[i][1], spots[i][2], 0.88));
  if (!d.courts.length) { x.font = "600 30px Poppins"; x.fillStyle = GREY; x.textAlign = "center"; x.fillText("Other courts get stamped here.", PW / 2, 1000); x.textAlign = "left"; }
  gutter(x, PW, PH, "right"); pageNo(x, 2, "left");
  return c;
}

export const SHOT_BOX = { x: 96, y: 262, w: 400, h: 465 };
const shotName = (d) => (d.fav === "Backhand" ? (d.backhand === "Two-handed" ? "Backhand-2" : "Backhand-1") : d.fav);
export function shotFrames(d) {
  const frames = SHOTS[shotName(d)] || SHOTS.Forehand, flip = d.hand === "Left" ? ' transform="translate(160 0) scale(-1 1)"' : "";
  return Promise.all(frames.map((f) => loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -40 160 186" width="${SHOT_BOX.w}" height="${SHOT_BOX.h}"><g${flip}>${shotFrame(f, { ink: INK, face: O })}</g></svg>`))));
}
export function visaPage(d) {
  const c = cnv(), x = c.getContext("2d"); paper(x, PW, PH, 31); waves(x, PW, PH, "#7FB3A3", 0.12, 14, 20, 3);
  // the visa sticker
  x.save(); x.shadowColor = "rgba(0,0,0,.12)"; x.shadowBlur = 6; x.shadowOffsetY = 2; x.fillStyle = "#FFF4EA"; rrect(x, 56, 130, PW - 112, 900, 14); x.fill(); x.restore();
  x.save(); rrect(x, 56, 130, PW - 112, 900, 14); x.clip(); waves(x, PW, PH, O, 0.2, 8, 12, 1); rosette(x, PW * 0.72, 600, 300, "#7FB3A3", 0.28, 1.1, 6, 26); x.restore();
  x.fillStyle = O; rrect(x, 56, 130, PW - 112, 96, [14, 14, 0, 0]); x.fill();
  x.fillStyle = "#fff"; x.font = "900 60px Poppins"; x.fillText("VISA", 92, 200);
  x.font = "700 24px Poppins"; x.letterSpacing = "4px"; x.textAlign = "right"; x.fillText("FAVOURITE SHOT", PW - 92, 190); x.textAlign = "left"; x.letterSpacing = "0px";
  x.fillStyle = "#fff"; rrect(x, SHOT_BOX.x, SHOT_BOX.y, SHOT_BOX.w, SHOT_BOX.h, 12); x.fill(); x.strokeStyle = "rgba(0,0,0,.15)"; x.lineWidth = 2; x.stroke();
  const R = 540, favLabel = d.fav === "Backhand" ? `${d.backhand === "Two-handed" ? "Two" : "One"}-handed backhand` : d.fav;
  x.font = "600 21px Poppins"; x.fillStyle = GREY; x.letterSpacing = "2px"; x.fillText("SHOT", R, 290); x.letterSpacing = "0px";
  x.font = "900 68px Poppins"; x.fillStyle = INK; fit(x, d.fav, R, 364, 390);
  if (d.fav === "Backhand") { x.font = "600 30px Poppins"; x.fillStyle = GREY; x.fillText(d.backhand, R, 408); }
  field(x, R, 450, "Played", d.hand === "Left" ? "Left-handed" : "Right-handed", { size: 34, maxW: 390 });
  field(x, R, 550, "Entries", "Multiple", { size: 34, maxW: 390 });
  field(x, R, 650, "Valid on", "All surfaces", { size: 34, maxW: 390 });
  x.font = "400 30px Space Mono"; x.fillStyle = INK; const vl = ("V<30A" + mrzClean(d.last) + "<<" + mrzClean(favLabel)).padEnd(40, "<").slice(0, 40);
  const cw = x.measureText("M").width; x.save(); x.translate(96, 960); x.scale((PW - 192) / (cw * 40), 1); x.fillText(vl, 0, 0); x.restore();
  x.font = "600 22px Poppins"; x.fillStyle = GREY; x.fillText("Issued " + fmt(d.since) + "  ·  " + d.home.name, 96, 800);
  place(x, inked(330, 200, "#1E7A4E", 77, (s) => {
    s.lineWidth = 7; rrect(s, 8, 8, 314, 184, 20); s.stroke(); s.textAlign = "center"; s.font = "900 52px Poppins"; s.letterSpacing = "4px"; s.fillText("APPROVED", 165, 100);
    s.letterSpacing = "0px"; s.font = "600 22px Poppins"; s.fillText("30-ALL COMMITTEE", 165, 146);
  }), 770, 1060, -11, 0.88);
  x.font = "600 26px Poppins"; x.fillStyle = "rgba(138,127,114,.7)"; x.textAlign = "center"; x.fillText("Space for your next shot.", PW / 2, 1300); x.textAlign = "left";
  gutter(x, PW, PH, "left"); pageNo(x, 3, "right");
  return c;
}

export function matchesPage(d) {
  const c = cnv(), x = c.getContext("2d"); paper(x, PW, PH, 41); security(x, PW, PH, 42, "#9FC7B8", "#C9B8E8");
  x.font = "600 22px Poppins"; x.fillStyle = GREY; x.letterSpacing = "4px"; x.fillText("MATCH STAMPS", 64, 96); x.letterSpacing = "0px";
  x.font = "900 34px Poppins"; x.fillStyle = INK; x.textAlign = "right"; x.fillText(`${d.wins}W · ${d.losses}L`, PW - 64, 98); x.textAlign = "left";
  const list = d.matches.slice(0, 12), r = rng(hash(d.pid));
  list.forEach((m, i) => {
    const col = i % 3, row = (i / 3) | 0, cx = 190 + col * 320 + (r() - 0.5) * 80, cy = 300 + row * 290 + (r() - 0.5) * 70;
    place(x, matchStamp(m, hash(d.pid) + i * 13), cx, cy, (r() - 0.5) * 50, 0.95);
  });
  if (!list.length) { x.font = "600 30px Poppins"; x.fillStyle = GREY; x.textAlign = "center"; x.fillText("Log a match to earn your first stamp.", PW / 2, 700); x.textAlign = "left"; }
  gutter(x, PW, PH, "right"); pageNo(x, 4, "left");
  return c;
}

/* ---------- cover: colour, normal and roughness/metal maps from one foil mask ---------- */
function crest(x, cx, cy) {
  x.lineWidth = 9; x.beginPath(); x.arc(cx, cy, 175, 0, 7); x.stroke(); x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, 158, 0, 7); x.stroke();
  x.beginPath(); x.arc(cx, cy, 96, 0, 7); x.fill();
  x.save(); x.globalCompositeOperation = "destination-out"; x.lineWidth = 11;
  x.beginPath(); x.arc(cx - 128, cy, 92, -0.78, 0.78); x.stroke(); x.beginPath(); x.arc(cx + 128, cy, 92, Math.PI - 0.78, Math.PI + 0.78); x.stroke(); x.restore();
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + s * (0.5 + i * 0.27), lx = cx + Math.cos(a) * 225, ly = cy + Math.sin(a) * 225;
    x.save(); x.translate(lx, ly); x.rotate(a + (s > 0 ? -0.5 : 0.5) + Math.PI / 2); x.beginPath(); x.ellipse(0, 0, 13, 30, 0, 0, 7); x.fill(); x.restore();
  }
  x.font = "900 34px Poppins"; x.textAlign = "center"; x.fillText("★", cx, cy - 205);
}
export function coverMaps(d, back = false) {
  const w = CPW, h = CPH, m = cnv(w, h), mx = m.getContext("2d"); mx.fillStyle = "#000"; mx.fillRect(0, 0, w, h); mx.fillStyle = "#fff"; mx.strokeStyle = "#fff"; mx.textAlign = "center";
  if (!back) {
    mx.font = "900 150px Poppins"; mx.letterSpacing = "10px"; mx.fillText("30-ALL", w / 2 + 5, 330);
    crest(mx, w / 2, 700);
    mx.font = "700 58px Poppins"; mx.letterSpacing = "9px"; mx.fillText("PLAYER", w / 2 + 4, 1060); mx.fillText("PASSPORT", w / 2 + 4, 1136);
    mx.letterSpacing = "0px"; mx.lineWidth = 7; rrect(mx, w / 2 - 50, 1300, 100, 62, 8); mx.stroke(); mx.beginPath(); mx.arc(w / 2, 1331, 17, 0, 7); mx.stroke();
    mx.fillRect(w / 2 - 50, 1328, 33, 6); mx.fillRect(w / 2 + 17, 1328, 33, 6);
  } else { mx.font = "900 46px Poppins"; mx.letterSpacing = "6px"; mx.fillText("THIRTYALL.APP", w / 2, h - 140); }
  const b = cnv(w, h), bx = b.getContext("2d"); bx.strokeStyle = "#fff"; bx.lineWidth = 5; rrect(bx, 40, 40, w - 80, h - 80, 28); bx.stroke();
  const fm = blur(chan(mx, w, h), w, h, 2), bm = blur(chan(bx, w, h), w, h, 2);
  // pebbled leather grain (cellular noise)
  const r = rng(back ? 9 : 5), cell = 8, gw = Math.ceil(w / cell) + 1, gh = Math.ceil(h / cell) + 1, px = new Float32Array(gw * gh), py = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { px[j * gw + i] = (i + r()) * cell; py[j * gw + i] = (j + r()) * cell; }
  const Hm = new Float32Array(w * h), G = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { const cy = (y / cell) | 0; for (let X = 0; X < w; X++) {
    const cx = (X / cell) | 0; let d1 = 1e9, d2 = 1e9;
    for (let j = cy - 1; j <= cy + 1; j++) { if (j < 0 || j >= gh) continue; for (let i = cx - 1; i <= cx + 1; i++) { if (i < 0 || i >= gw) continue;
      const k = j * gw + i, dx = px[k] - X, dy = py[k] - y, dd = dx * dx + dy * dy; if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd; } }
    const g = Math.sqrt(Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / (cell * 0.5))), lf = 0.5 + 0.5 * Math.sin(X * 0.011 + Math.sin(y * 0.006) * 2) * Math.sin(y * 0.009 + 1);
    const p = y * w + X; G[p] = g * (0.88 + 0.12 * lf); Hm[p] = (1 - fm[p]) * (0.4 + 0.6 * G[p]) - bm[p] * 0.45;
  } }
  const col = mx.createImageData(w, h), nor = mx.createImageData(w, h), orm = mx.createImageData(w, h), k = 2.4;
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) {
    const p = y * w + X, i4 = p * 4, f = fm[p], g = G[p];
    const edge = Math.min(X, y, w - 1 - X, h - 1 - y), e = edge < 22 ? 0.8 + 0.2 * (edge / 22) : 1, sh = (0.76 + 0.24 * g) * e * (1 - bm[p] * 0.18);
    col.data[i4] = 236 * sh * (1 - f) + 8 * f; col.data[i4 + 1] = 92 * sh * (1 - f) + 8 * f; col.data[i4 + 2] = 14 * sh * (1 - f) + 8 * f; col.data[i4 + 3] = 255;
    const l = Hm[X > 0 ? p - 1 : p], rr = Hm[X < w - 1 ? p + 1 : p], u = Hm[y > 0 ? p - w : p], dn = Hm[y < h - 1 ? p + w : p];
    let nx = (l - rr) * k, ny = (dn - u) * k, nz = 1; const n = Math.hypot(nx, ny, nz); nx /= n; ny /= n; nz /= n;
    nor.data[i4] = (nx * 0.5 + 0.5) * 255; nor.data[i4 + 1] = (ny * 0.5 + 0.5) * 255; nor.data[i4 + 2] = (nz * 0.5 + 0.5) * 255; nor.data[i4 + 3] = 255;
    orm.data[i4] = 255; orm.data[i4 + 1] = (0.62 - 0.18 * g) * (1 - f) * 255 + 0.4 * f * 255; orm.data[i4 + 2] = 0.15 * f * 255; orm.data[i4 + 3] = 255;
  }
  const out = (img) => { const c = cnv(w, h); c.getContext("2d").putImageData(img, 0, 0); return c; };
  return { map: out(col), normal: out(nor), orm: out(orm) };
}
function chan(x, w, h) { const d = x.getImageData(0, 0, w, h).data, o = new Float32Array(w * h); for (let i = 0; i < o.length; i++) o[i] = d[i * 4] / 255; return o; }
function blur(a, w, h, r) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, x + k))]; t[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += t[Math.min(h - 1, Math.max(0, y + k)) * w + x]; o[y * w + x] = s / n; }
  return o;
}

/** All flat page canvases, in book order. */
export async function buildPages(d) {
  const [avatar, flag, frames] = await Promise.all([loadImg(d.avatar), loadImg(d.flag), shotFrames(d)]);
  const A = { avatar, flag };
  return {
    cover: coverMaps(d), backCover: coverMaps(d, true),
    inside: endpaper("The 30-All community requests all whom it may concern to let the bearer play freely, call the lines fairly and always bring a fresh can of balls.", "THIRTYALL.APP", "right", 51),
    id: idPage(d, A), courts: courtsPage(d), visa: visaPage(d), matches: matchesPage(d),
    insideBack: endpaper("Your next stamp is one match away. Log it in the Matches tab.", "30-ALL · PLAYER PASSPORT", "left", 61),
    frames,
  };
}
