import { useEffect, useRef, useState } from "react";
import { useDialogFocus, usePresence } from "./ui";

const VIEW = 260; // size of the square crop area on screen (the circle sits inside it)
const OUT = 640; // saved photo is OUT x OUT pixels
const MAX_ZOOM = 4;

/**
 * Lets a player drag and zoom a photo so their face sits inside the round avatar.
 * Drag with a finger or mouse; zoom with pinch, the slider or the mouse wheel.
 * Hands back a square JPEG of exactly what's inside the circle's bounding square.
 */
export function PhotoCropper({ file, onCancel, onCrop }: { file: File; onCancel: () => void; onCrop: (f: File) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image centre offset from the crop centre, in screen px
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const done = useRef<(() => void) | null>(null);
  const { state, close } = usePresence(() => done.current?.(), 200);
  const dref = useDialogFocus();

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setErr("We couldn't open that photo. Try a JPG or PNG.");
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, []);

  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1; // "cover" scale at zoom 1
  const w = img ? img.naturalWidth * base * zoom : VIEW;
  const h = img ? img.naturalHeight * base * zoom : VIEW;
  // keep the photo covering the whole crop area
  const clamp = (p: { x: number; y: number }, ww = w, hh = h) => ({
    x: Math.max(-(ww - VIEW) / 2, Math.min((ww - VIEW) / 2, p.x)),
    y: Math.max(-(hh - VIEW) / 2, Math.min((hh - VIEW) / 2, p.y)),
  });
  const setZoomTo = (z: number) => {
    const nz = Math.max(1, Math.min(MAX_ZOOM, z));
    if (!img) return setZoom(nz);
    const k = nz / zoom; // zoom around the centre of the circle
    setPos((p) => clamp({ x: p.x * k, y: p.y * k }, img.naturalWidth * base * nz, img.naturalHeight * base * nz));
    setZoom(nz);
  };

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
    }
  };
  const move = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZoomTo(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d));
    } else if (pointers.current.size === 1) {
      setPos((p) => clamp({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
    }
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const cancel = () => { done.current = onCancel; close(); };
  const save = () => {
    if (!img) return;
    const s = base * zoom; // screen px per image px
    const size = VIEW / s;
    const sx = img.naturalWidth / 2 - (VIEW / 2 + pos.x) / s;
    const sy = img.naturalHeight / 2 - (VIEW / 2 + pos.y) / s;
    const c = document.createElement("canvas");
    c.width = c.height = OUT;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);
    c.toBlob((b) => {
      if (!b) return setErr("Unable to save that photo. Try again.");
      const f = new File([b], "photo.jpg", { type: "image/jpeg" });
      done.current = () => onCrop(f); close();
    }, "image/jpeg", 0.9);
  };

  return (
    <div className="dialog-bg" data-state={state}>
      <div ref={dref} className="dialog cropper" role="dialog" aria-modal="true" aria-label="Position your photo" data-state={state}>
        <h3>Position your photo</h3>
        <p className="small" style={{ margin: "0 0 14px" }}>Drag to move. Pinch or use the slider to zoom.</p>
        <div className="crop-area" style={{ width: VIEW, height: VIEW }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onWheel={(e) => setZoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}>
          {img && <img src={img.src} alt="" draggable={false}
            style={{ width: w, height: h, transform: `translate(${pos.x - w / 2}px, ${pos.y - h / 2}px)` }} />}
          <span className="crop-mask" aria-hidden="true" />
          {!img && !err && <span className="crop-wait">Loading…</span>}
        </div>
        <div className="crop-zoom">
          <span aria-hidden="true">−</span>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} aria-label="Zoom" onChange={(e) => setZoomTo(+e.target.value)} />
          <span aria-hidden="true">+</span>
        </div>
        {err && <div className="err" style={{ textAlign: "center" }}>{err}</div>}
        <div className="row" style={{ marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={cancel}>Cancel</button>
          <button type="button" className="btn" disabled={!img} onClick={save}>Use photo</button>
        </div>
      </div>
    </div>
  );
}
