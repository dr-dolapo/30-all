import { mountPassport, buildPages } from "./passport.js";

const D = {
  first: "Chidi", last: "Okafor", pid: "CO482913", country: "NGA", nationality: "Nigerian", flag: "flags/ng.svg", since: "2025-03-14",
  home: { name: "Police College Tennis Club", area: "Ikeja" },
  courts: [{ name: "Lagos Country Club", area: "Ikeja", first: "2025-06-02" }, { name: "Ikoyi Club 1938", area: "Ikoyi", first: "2025-09-20" }],
  racquet: { brand: "Diadem", model: "Elevate 98", head: 98 }, hand: "Right", backhand: "One-handed", fav: "Volley", wins: 24, losses: 9,
  matches: [["Mayowa", 1, "6-4 6-3", "2026-11-18"], ["Toyosi", 0, "4-6 6-7", "2026-11-14"], ["Peter", 1, "6-2 6-1", "2026-11-09"], ["Ngozi", 1, "7-5 6-4", "2026-11-02"],
    ["Tunde", 0, "3-6 6-4 8-10", "2026-10-27"], ["Ada", 1, "6-3 6-3", "2026-10-21"], ["Emeka", 1, "6-1 7-6", "2026-10-15"], ["Bisi", 0, "5-7 4-6", "2026-10-08"], ["Kunle", 1, "6-4 6-4", "2026-10-01"]]
    .map(([opp, won, score, date]) => ({ opp, won: !!won, score, date })),
};
const RACQUETS = { "Diadem Elevate 98": ["Diadem", "Elevate 98", 98], "Wilson Blade 98": ["Wilson", "Blade 98", 98], "Babolat Pure Drive": ["Babolat", "Pure Drive", 100],
  "Head Speed MP": ["Head", "Speed MP", 100], "Yonex Ezone 100": ["Yonex", "Ezone 100", 100] };

const views = [];
async function start() {
  for (const el of document.querySelectorAll("[data-passport]")) views.push(await mountPassport(el, D, { fonts: "fonts/" }));
  await flat();
}
async function flat() {
  const P = await buildPages(D), wrap = document.getElementById("flat"); wrap.innerHTML = "";
  const items = [["Cover", P.cover.map], ["Inside cover", P.inside], ["Photo page", P.id], ["Court stamps", P.courts], ["Favourite shot visa", P.visa], ["Match stamps", P.matches], ["Inside back cover", P.insideBack]];
  for (const [label, c] of items) { const f = document.createElement("figure"); const img = new Image(); img.src = c.toDataURL("image/jpeg", 0.85); img.alt = label; f.append(img); const cap = document.createElement("figcaption"); cap.textContent = label; f.append(cap); wrap.append(f); }
}
let busy = Promise.resolve();
function update() { busy = busy.then(async () => { for (const v of views) await v.setData(D); await flat(); }); }

document.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => {
  const [k, v] = b.dataset.set.split(":"); D[k] = v;
  document.querySelectorAll(`[data-set^="${k}:"]`).forEach((x) => x.classList.toggle("on", x === b)); update();
}));
document.getElementById("racq").addEventListener("change", (e) => { const [brand, model, head] = RACQUETS[e.target.value]; D.racquet = { brand, model, head }; update(); });
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => views.forEach((v) => v.goTo(+b.dataset.go))));

// decisions
const dec = {};
document.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => {
  const [k, v] = b.dataset.dec.split(":"); dec[k] = v; document.querySelectorAll(`[data-dec^="${k}:"]`).forEach((x) => x.classList.toggle("on", x === b));
}));
document.getElementById("copy").addEventListener("click", async () => {
  const notes = document.getElementById("notes").value.trim();
  const txt = `Passport: ${dec.passport || "not decided"}` + (notes ? `\nNotes: ${notes}` : "");
  try { await navigator.clipboard.writeText(txt); } catch { /* shown below anyway */ }
  const o = document.getElementById("out"); o.textContent = txt; o.hidden = false;
  document.getElementById("copy").textContent = "Copied ✓"; setTimeout(() => (document.getElementById("copy").textContent = "Copy my decisions"), 1600);
});
start();
