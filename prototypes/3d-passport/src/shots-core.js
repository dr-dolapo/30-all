/* Stop-motion tennis shots: a simple line figure, a few hand-posed frames per shot, played in steps.
   Coordinates: 120 wide, ground at y=140, figure faces right (towards the net). Left-handers are mirrored. */
const P = (o) => Object.assign({ head: [60, 24], neck: [60, 36], hip: [60, 82], lk: [52, 110], rk: [68, 110], lf: [46, 139], rf: [74, 139] }, o);
const SHOTS = {
  Forehand: [
    P({ re: [70, 54], rh: [76, 66], ra: -60, le: [54, 54], lh: [68, 62], ball: [112, 40] }),
    P({ head: [57, 25], re: [46, 56], rh: [30, 64], ra: 200, le: [70, 50], lh: [86, 50], ball: [96, 58] }),
    P({ head: [62, 24], re: [72, 62], rh: [88, 66], ra: -8, le: [50, 56], lh: [42, 66], ball: [104, 64] }),
    P({ head: [63, 24], re: [56, 42], rh: [44, 32], ra: 215, le: [50, 60], lh: [56, 72], ball: [134, 48] }),
  ],
  "Backhand-1": [
    P({ re: [70, 54], rh: [76, 66], ra: -60, le: [54, 54], lh: [68, 62], ball: [112, 40] }),
    P({ head: [58, 25], re: [56, 46], rh: [46, 54], ra: 210, le: [52, 52], lh: [50, 58], ball: [96, 58] }),
    P({ head: [62, 24], re: [74, 56], rh: [90, 60], ra: 2, le: [46, 54], lh: [32, 56], ball: [104, 60] }),
    P({ head: [62, 24], re: [80, 40], rh: [86, 24], ra: -100, le: [44, 52], lh: [28, 52], ball: [134, 46] }),
  ],
  "Backhand-2": [
    P({ re: [70, 54], rh: [76, 66], ra: -60, le: [54, 54], lh: [68, 62], ball: [112, 40] }),
    P({ head: [58, 25], re: [54, 50], rh: [44, 58], ra: 205, le: [58, 54], lh: [47, 60], ball: [96, 58] }),
    P({ head: [62, 24], re: [72, 58], rh: [88, 62], ra: 0, le: [70, 60], lh: [84, 64], ball: [104, 62] }),
    P({ head: [62, 24], re: [72, 40], rh: [70, 26], ra: -130, le: [68, 42], lh: [66, 28], ball: [134, 46] }),
  ],
  Serve: [
    P({ re: [62, 60], rh: [66, 74], ra: 30, le: [66, 52], lh: [72, 62], ball: [74, 58] }),
    P({ re: [46, 54], rh: [38, 64], ra: 200, le: [66, 30], lh: [68, 16], ball: [70, 2] }),
    P({ lk: [56, 106], rk: [70, 106], hip: [60, 84], re: [44, 38], rh: [48, 26], ra: 255, le: [64, 26], lh: [66, 14], ball: [72, -10] }),
    P({ head: [64, 20], neck: [63, 32], re: [66, 14], rh: [72, 0], ra: -72, le: [56, 46], lh: [54, 60], ball: [80, -18] }),
    P({ head: [68, 28], neck: [66, 40], hip: [62, 84], re: [70, 58], rh: [58, 80], ra: 120, le: [52, 56], lh: [44, 66], ball: [134, 30] }),
  ],
  Volley: [
    P({ hip: [60, 88], lk: [50, 112], rk: [70, 112], re: [70, 56], rh: [78, 64], ra: -62, le: [52, 56], lh: [66, 62], ball: [116, 50] }),
    P({ hip: [60, 86], re: [70, 50], rh: [74, 40], ra: -88, le: [74, 56], lh: [86, 54], ball: [104, 52] }),
    P({ hip: [60, 86], re: [76, 52], rh: [90, 52], ra: -40, le: [52, 56], lh: [44, 62], ball: [100, 46] }),
    P({ hip: [60, 86], re: [76, 54], rh: [90, 56], ra: -46, le: [52, 58], lh: [46, 64], ball: [132, 40] }),
  ],
  Smash: [
    P({ re: [48, 40], rh: [46, 26], ra: 250, le: [70, 22], lh: [80, 10], ball: [84, -14] }),
    P({ lk: [56, 106], rk: [70, 106], hip: [60, 84], re: [46, 36], rh: [52, 26], ra: 262, le: [70, 24], lh: [80, 12], ball: [82, -6] }),
    P({ head: [64, 20], neck: [63, 32], re: [68, 14], rh: [76, 0], ra: -66, le: [54, 46], lh: [50, 58], ball: [86, -10] }),
    P({ head: [68, 28], neck: [66, 40], re: [72, 58], rh: [60, 80], ra: 125, le: [52, 56], lh: [44, 66], ball: [130, 96] }),
  ],
  "Drop-shot": [
    P({ re: [70, 54], rh: [76, 66], ra: -60, le: [54, 54], lh: [68, 62], ball: [112, 40] }),
    P({ re: [58, 44], rh: [56, 30], ra: -120, le: [70, 52], lh: [84, 54], ball: [96, 56] }),
    P({ re: [72, 56], rh: [86, 62], ra: -22, le: [50, 56], lh: [44, 64], ball: [98, 60] }),
    P({ re: [74, 58], rh: [88, 66], ra: -14, le: [50, 58], lh: [44, 66], ball: [116, 118] }),
  ],
};
SHOTS.Backhand = SHOTS["Backhand-1"];

function racquet(hand, angle, ink, face) {
  const a = (angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const t = [hand[0] + c * 12, hand[1] + s * 12], h = [hand[0] + c * 24, hand[1] + s * 24];
  return `<line x1="${hand[0]}" y1="${hand[1]}" x2="${t[0]}" y2="${t[1]}" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>
    <g transform="translate(${h[0]} ${h[1]}) rotate(${angle})"><ellipse rx="13" ry="9" fill="${face}" fill-opacity=".9" stroke="${ink}" stroke-width="3"/>
    <path d="M-7 -6V6M0 -8.5V8.5M7 -6V6M-11 -3H11M-12 3H12" stroke="${ink}" stroke-width="1" opacity=".45"/></g>`;
}
/** One frame as SVG markup. */
function frame(p, { ink = "#111", face = "#FF751F", ball = true } = {}) {
  const L = (a, b, w = 5) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`;
  return `<line x1="10" y1="141" x2="150" y2="141" stroke="${ink}" stroke-opacity=".18" stroke-width="2"/>
    ${L(p.hip, p.lk)}${L(p.lk, p.lf)}${L(p.hip, p.rk)}${L(p.rk, p.rf)}${L(p.neck, p.hip, 6)}
    ${L(p.neck, p.le, 4.5)}${L(p.le, p.lh, 4.5)}
    ${racquet(p.rh, p.ra, ink, face)}
    ${L(p.neck, p.re, 4.5)}${L(p.re, p.rh, 4.5)}
    <circle cx="${p.head[0]}" cy="${p.head[1]}" r="9" fill="${ink}"/>
    ${ball && p.ball ? `<circle cx="${p.ball[0]}" cy="${p.ball[1]}" r="4.5" fill="#D7EE3A" stroke="${ink}" stroke-width="1.2"/>` : ""}`;
}
/**
 * Mounts a stop-motion player into `el`: steps through the frames (no tweening, like stop motion),
 * holds the last frame, then loops. Left-handers are mirrored.
 */
export { SHOTS, frame };
