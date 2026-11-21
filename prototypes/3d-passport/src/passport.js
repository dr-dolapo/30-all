/* 30-All Player Passport in 3D: drag the cover open, drag pages to turn, tap a page to zoom in. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { W, H, CW, CH, SHOT_BOX, buildPages, loadFonts } from "./pages.js";

export { buildPages, loadFonts };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a, b, t) => a + (b - a) * t;
const PI = Math.PI;

class Leaf {
  constructor(w, h, front, back, flex, nx = 48) {
    this.w = w; this.h = h; this.flex = flex; this.nx = nx; this.angle = 0; this.target = 0; this.lead = 1; this.z = 0;
    const n = (nx + 1) * 2, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i <= nx; i++) for (let j = 0; j < 2; j++) { const v = i * 2 + j; uv[v * 2] = i / nx; uv[v * 2 + 1] = j; }
    for (let i = 0; i < nx; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); this.geo = g;
    this.front = new THREE.Mesh(g, front); this.back = new THREE.Mesh(g, back);
    for (const m of [this.front, this.back]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    this.update();
  }
  update() {
    const { nx, w, h } = this, pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array, th = this.angle, ds = w / nx;
    let X = 0, Z = 0;
    for (let i = 0; i <= nx; i++) {
      const s = i / nx, phi = th + this.lead * this.flex * Math.sin(th) * Math.pow(s, 1.4);
      const nX = -Math.sin(phi), nZ = Math.cos(phi);
      for (let j = 0; j < 2; j++) { const v = (i * 2 + j) * 3; pos[v] = X; pos[v + 1] = (j - 0.5) * h; pos[v + 2] = Z + this.z; nor[v] = nX; nor[v + 1] = 0; nor[v + 2] = nZ; }
      X += Math.cos(phi) * ds; Z += Math.sin(phi) * ds;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true;
  }
}

export async function mountPassport(el, data, opts = {}) {
  await loadFonts(opts.fonts);
  el.classList.add("pp"); el.innerHTML = "";
  const canvas = document.createElement("canvas"); canvas.tabIndex = 0; canvas.className = "pp-canvas";
  canvas.setAttribute("role", "img"); el.appendChild(canvas);
  const hint = document.createElement("div"); hint.className = "pp-hint"; hint.textContent = "Drag to open"; el.appendChild(hint);

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return flatFallback(el, data); }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const aniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.4;
  const sun = new THREE.DirectionalLight(0xfff4e8, 2.0); sun.position.set(-1.4, 2.2, 3.2); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 8 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.015; sun.shadow.radius = 4; scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const book = new THREE.Group(); scene.add(book);

  // soft contact shadow under the book
  const sc = document.createElement("canvas"); sc.width = sc.height = 128; const sx = sc.getContext("2d");
  const sg = sx.createRadialGradient(64, 64, 10, 64, 64, 64); sg.addColorStop(0, "rgba(0,0,0,.55)"); sg.addColorStop(1, "rgba(0,0,0,0)"); sx.fillStyle = sg; sx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, opacity: 0.55 }));
  shadow.position.z = -0.03; book.add(shadow);

  const tex = (c, mirror) => {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    if (mirror) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; } return t;
  };
  const lin = (c, mirror) => { const t = tex(c, mirror); t.colorSpace = THREE.NoColorSpace; return t; };
  const paperMat = (c, mirror, side) => new THREE.MeshStandardMaterial({ map: tex(c, mirror), roughness: 0.9, metalness: 0, side });
  const leatherMat = (m, mirror, side) => new THREE.MeshStandardMaterial({ map: tex(m.map, mirror), normalMap: lin(m.normal, mirror), normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: lin(m.orm, mirror), metalnessMap: lin(m.orm, mirror), roughness: 1, metalness: 1, side });

  let P, leaves = [], backCover, blockR, blockL, visaCtx, visaTex, visaBase, frameI = 0, frameT = 0;
  const blockMat = new THREE.MeshStandardMaterial({ color: 0xf3ead9, roughness: 0.95 });
  const T = 0.024, G = 0.0035; // page block thickness, gap between leaves

  async function build(d) {
    P = await buildPages(d);
    for (const l of leaves) { book.remove(l.front, l.back); l.geo.dispose(); }
    if (backCover) book.remove(backCover.front, backCover.back);
    const cover = new Leaf(CW, CH, leatherMat(P.cover, false, THREE.FrontSide), paperMat(P.inside, true, THREE.BackSide), 0.05);
    visaBase = P.visa; const vc = document.createElement("canvas"); vc.width = visaBase.width; vc.height = visaBase.height; visaCtx = vc.getContext("2d");
    const l1 = new Leaf(W, H, paperMat(P.id, false, THREE.FrontSide), paperMat(P.courts, true, THREE.BackSide), 0.55);
    const l2 = new Leaf(W, H, paperMat(vc, false, THREE.FrontSide), paperMat(P.matches, true, THREE.BackSide), 0.55);
    visaTex = l2.front.material.map; drawVisa(reduced() ? Math.min(2, P.frames.length - 1) : 0);
    leaves = [cover, l1, l2];
    backCover = new Leaf(CW, CH, paperMat(P.insideBack, false, THREE.FrontSide), leatherMat(P.backCover, true, THREE.BackSide), 0);
    for (const l of [...leaves, backCover]) book.add(l.front, l.back);
    if (!blockR) {
      const hide = new THREE.MeshBasicMaterial({ visible: false }); // top/bottom faces: let the real pages show through
      blockR = new THREE.Mesh(new THREE.BoxGeometry(W - 0.008, H - 0.008, 1), [blockMat, blockMat, blockMat, blockMat, hide, hide]); blockL = blockR.clone();
      for (const b of [blockR, blockL]) { b.castShadow = b.receiveShadow = true; book.add(b); }
    }
    canvas.setAttribute("aria-label", `${d.first} ${d.last}'s player passport. Home court ${d.home.name}. ${d.hand}-handed, ${d.backhand} backhand. Racquet ${d.racquet.brand} ${d.racquet.model}. Favourite shot ${d.fav}. Use the arrow keys to turn pages.`);
    dirty = true;
  }
  function drawVisa(i) {
    if (!visaCtx) return; visaCtx.drawImage(visaBase, 0, 0); const f = P.frames[i];
    if (f) visaCtx.drawImage(f, SHOT_BOX.x, SHOT_BOX.y, SHOT_BOX.w, SHOT_BOX.h);
    visaTex.needsUpdate = true;
  }

  // ---------- layout of the stack ----------
  const N = 3; // leaves: cover, 2 pages (the rest of the book is the page block)
  function layout() {
    const turned = (leaves[1].angle + leaves[2].angle) / (2 * PI), tR = T * (1 - turned) + 0.002, tL = T * turned + 0.002;
    backCover.z = 0;
    blockR.scale.z = tR; blockR.position.set(W / 2, 0, G + tR / 2);
    leaves.forEach((l, i) => {
      const zR = i === 0 ? G + tR + N * G + G : G + tR + (N - i) * G;
      const zL = i === 0 ? G : 2 * G + tL + i * G;
      l.z = lerp(zR, zL, Math.min(1, Math.max(0, l.angle / PI)));
    });
    blockL.scale.z = tL; blockL.position.set(-W / 2, 0, 2 * G + tL / 2 - 0.0005);
    blockL.visible = turned > 0.01; blockR.visible = turned < 0.99;
    for (const l of [...leaves, backCover]) l.update();
  }

  // ---------- camera ----------
  // Wide containers show the open spread (tap a page to zoom). Tall ones (phones) show one page at a time,
  // with a sliver of the facing page, and each swipe moves one page: pan across the spread, or turn a leaf.
  let zoom = null, focus = "R", panX = 0, cam = { x: CW / 2, d: 4 }, tilt = { x: 0, y: 0 }, ptr = { x: 0, y: 0 };
  const single = () => camera.aspect < 0.95;
  function camTarget() {
    const o = Math.min(1, leaves[0].angle / PI), fov = (camera.fov * PI) / 180, tn = Math.tan(fov / 2);
    let cx, fw, fh;
    if (single()) { cx = lerp(CW / 2, focus === "L" ? -W / 2 : W / 2, o) + panX; fw = lerp(CW * 1.15, W * 1.12, o); fh = lerp(CH * 1.1, H * 1.07, o); }
    else if (zoom && o > 0.95) { cx = zoom === "L" ? -W / 2 : W / 2; fw = W * 1.05; fh = H * 1.05; }
    else { cx = lerp(CW / 2, 0, o); fw = lerp(CW * 1.15, 2 * CW * 1.06, o); fh = CH * 1.12; }
    return { x: cx, d: Math.max(fh / 2 / tn, fw / 2 / (tn * camera.aspect)) };
  }

  // ---------- input ----------
  let drag = null, start = null, hinted = false, dirty = true, lastT = performance.now(), peeked = false;
  const spread = () => leaves.filter((l) => l.target > PI / 2).length;
  const isPan = (dir) => single() && spread() > 0 && ((dir > 0 && focus === "L") || (dir < 0 && focus === "R"));
  const settle = (i) => { if (single()) focus = leaves[i].target > PI / 2 ? (i === 0 ? "R" : "L") : "R"; };
  function step(dir) {
    zoom = null; dirty = true;
    if (isPan(dir)) { focus = dir > 0 ? "R" : "L"; return; }
    const s = spread();
    if (dir > 0 && s < N) { leaves[s].target = PI; settle(s); }
    if (dir < 0 && s > 0) { leaves[s - 1].target = 0; settle(s - 1); }
  }
  canvas.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect(); ptr.x = (e.clientX - r.left) / r.width - 0.5; ptr.y = (e.clientY - r.top) / r.height - 0.5;
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!drag) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
      if (Math.abs(dx) < 8) return;
      const dir = dx < 0 ? 1 : -1, s = spread();
      if (isPan(dir)) drag = { pan: true, dir, i: -1 };
      else { let i = -1, base = 0; if (dir > 0 && s < N) { i = s; base = 0; } else if (dir < 0 && s > 0) { i = s - 1; base = PI; }
        drag = { i, base, px: r.width * (s === 0 || single() ? 0.95 : 0.8), v: 0, lx: e.clientX, lt: performance.now() }; }
      canvas.setPointerCapture(e.pointerId); zoom = null;
    }
    if (drag.pan) { const k = (W * 1.12) / r.width; panX = Math.max(-W, Math.min(W, -dx * k)); }
    else if (drag.i >= 0) {
      const l = leaves[drag.i], a = Math.min(PI, Math.max(0, drag.base - (dx / drag.px) * PI)), now = performance.now();
      drag.v = lerp(drag.v, ((-(e.clientX - drag.lx) / drag.px) * PI) / Math.max(1, now - drag.lt) * 1000, 0.5); drag.lx = e.clientX; drag.lt = now;
      l.lead = a > l.angle ? 1 : a < l.angle ? -1 : l.lead; l.angle = l.target = a;
    }
    dirty = true;
  });
  const end = (e) => {
    if (drag?.pan) { const dx = e.clientX - start.x; if (Math.abs(dx) > 40) { focus = drag.dir > 0 ? "R" : "L"; panX += drag.dir > 0 ? -W : W; } }
    else if (drag && drag.i >= 0) { const l = leaves[drag.i]; l.target = drag.v > 2.5 ? PI : drag.v < -2.5 ? 0 : l.angle > PI / 2 ? PI : 0; settle(drag.i); }
    else if (start && !drag) {
      const r = canvas.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
      if (spread() === 0) step(1);
      else if (single()) { if (fx < 0.25) step(-1); else if (fx > 0.75) step(1); }
      else if (zoom) zoom = null;
      else { const sp = new THREE.Vector3(0, 0, 0).applyMatrix4(book.matrixWorld).project(camera); zoom = fx < (sp.x + 1) / 2 ? "L" : "R"; }
    }
    drag = null; start = null; dirty = true;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", () => { if (drag?.i >= 0) leaves[drag.i].target = leaves[drag.i].angle > PI / 2 ? PI : 0; drag = start = null; });
  canvas.addEventListener("pointerleave", () => { ptr.x = ptr.y = 0; });
  canvas.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { step(1); e.preventDefault(); } if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); } if (e.key === "Escape") zoom = null; });

  // ---------- loop ----------
  let visible = true, raf = 0;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) loop(); }); io.observe(el);
  const ro = new ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }); ro.observe(el);
  function loop() {
    cancelAnimationFrame(raf); if (!visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!leaves.length) return;
    const rm = reduced(), k = 1 - Math.exp(-dt * (rm ? 22 : 9));
    for (const l of leaves) if (!(drag && leaves[drag.i] === l) && Math.abs(l.target - l.angle) > 1e-4) { l.lead = l.target > l.angle ? 1 : -1; l.angle = lerp(l.angle, l.target, k); dirty = true; }
    if (!peeked && !rm && now > 900 + t0) { peeked = true; leaves[0].target = 0.42; setTimeout(() => { if (!drag && leaves[0].target === 0.42) leaves[0].target = 0; }, 520); }
    if (!hinted && leaves[0].angle > PI / 2) { hinted = true; hint.classList.add("gone"); }
    // stop-motion favourite shot, only while its page can be seen
    if (!rm && leaves[1].angle > 0.2 && leaves[2].angle < PI - 0.2) { frameT += dt * 1000; const hold = frameI === P.frames.length - 1 ? 650 : 230;
      if (frameT > hold) { frameT = 0; frameI = (frameI + 1) % P.frames.length; drawVisa(frameI); dirty = true; } }
    // gentle sway so the foil catches the light
    const t = now / 1000, sway = rm ? 0 : 1;
    const tx = -0.2 + ptr.y * 0.12 + sway * 0.025 * Math.sin(t * 0.7), ty = ptr.x * 0.22 + sway * 0.05 * Math.sin(t * 0.5);
    tilt.x = lerp(tilt.x, tx, 1 - Math.exp(-dt * 4)); tilt.y = lerp(tilt.y, ty, 1 - Math.exp(-dt * 4));
    book.rotation.set(tilt.x, tilt.y, 0);
    if (!drag?.pan) panX = lerp(panX, 0, 1 - Math.exp(-dt * (rm ? 30 : 9)));
    const ct = camTarget(), kc = 1 - Math.exp(-dt * (rm ? 30 : 7)); cam.x = lerp(cam.x, ct.x, kc); cam.d = lerp(cam.d, ct.d, kc);
    camera.position.set(cam.x, -0.05, cam.d); camera.lookAt(cam.x, 0, 0);
    const o = Math.min(1, leaves[0].angle / PI); shadow.scale.set(lerp(CW, 2 * CW, o) * 1.25, CH * 1.2, 1); shadow.position.x = lerp(CW / 2, 0, o);
    if (dirty || sway) { layout(); renderer.render(scene, camera); dirty = false; }
  }
  const t0 = performance.now();
  await build(data);
  cam = camTarget(); loop();
  document.addEventListener("visibilitychange", loop);
  return {
    async setData(d) { const angles = leaves.map((l) => l.target); await build(d); leaves.forEach((l, i) => { l.angle = l.target = angles[i] ?? 0; }); frameI = 0; dirty = true; },
    goTo(s) { leaves.forEach((l, i) => (l.target = i < s ? PI : 0)); focus = "R"; zoom = null; dirty = true; },
    focus(f) { focus = f; dirty = true; },
    destroy() { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); renderer.dispose(); el.innerHTML = ""; },
  };
}

async function flatFallback(el, data) {
  const P = await buildPages(data); el.innerHTML = "";
  for (const c of [P.id, P.courts, P.visa, P.matches]) { c.style.width = "100%"; el.appendChild(c); }
  return { setData() {}, goTo() {}, destroy() { el.innerHTML = ""; } };
}
