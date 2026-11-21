/**
 * Confetti for rare, earned moments only. A short canvas burst in brand colours (about 1.6s),
 * drawn on a full-screen layer that never blocks taps. Skipped when reduce motion is on.
 *
 * "big": streams from both bottom corners (once-in-a-while moments).
 * "small": a pop from one element (pass it as `from`).
 */
const COLORS = ["#FF751F", "#111111", "#FFFFFF", "#D7EE3A", "#FFB27A"];

export function confetti(kind: "big" | "small", from?: Element | null) {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1;
  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  cv.className = "confetti-layer";
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) { cv.remove(); return; }
  ctx.scale(dpr, dpr);

  type P = { x: number; y: number; vx: number; vy: number; w: number; h: number; r: number; vr: number; c: string; round: boolean };
  const parts: P[] = [];
  const add = (x: number, y: number, n: number, angle: number, spread: number, speed: number) => {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.55 + Math.random() * 0.6);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 5 + Math.random() * 5, h: 7 + Math.random() * 7,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: COLORS[i % COLORS.length], round: Math.random() < 0.25 });
    }
  };
  const scale = Math.min(1.4, Math.max(0.8, W / 390)); // a little more on big screens
  if (kind === "big") {
    add(-10, H + 10, 90 * scale, -Math.PI / 3, 0.7, 950 * Math.sqrt(H / 844));
    add(W + 10, H + 10, 90 * scale, (-Math.PI * 2) / 3, 0.7, 950 * Math.sqrt(H / 844));
  } else {
    const r = from?.getBoundingClientRect();
    add(r ? r.left + r.width / 2 : W / 2, r ? r.top + r.height / 2 : H / 3, 60, -Math.PI / 2, 2.2, 520);
  }

  const G = 900, DRAG = 0.985, LIFE = 1.6;
  let t0: number | null = null, last = 0;
  const frame = (now: number) => {
    if (t0 === null) { t0 = now; last = now; }
    const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    const fade = Math.max(0, 1 - Math.max(0, t - LIFE + 0.5) / 0.5);
    for (const p of parts) {
      p.vx *= DRAG; p.vy = p.vy * DRAG + G * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 4, p.w, p.h / 2);
      if (p.c === "#FFFFFF") { ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.lineWidth = 0.5; ctx.strokeRect(-p.w / 2, -p.h / 4, p.w, p.h / 2); }
      ctx.restore();
    }
    if (t < LIFE) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

/**
 * Remembers which celebrations a player has already seen on this device, so each one fires once.
 * If storage isn't available, `has` says yes, so nothing repeats.
 */
export const celebrated = {
  has(uid: string, key: string) { try { return localStorage.getItem(`cel:${uid}:${key}`) !== null; } catch { return true; } },
  mark(uid: string, key: string, value = "1") { try { localStorage.setItem(`cel:${uid}:${key}`, value); } catch { /* private mode */ } },
  get(uid: string, key: string) { try { return localStorage.getItem(`cel:${uid}:${key}`); } catch { return null; } },
};
