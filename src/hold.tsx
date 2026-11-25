import { useRef, useState } from "react";

/**
 * Hold-to-confirm for destructive actions: a fill sweeps across while held (slow, deliberate),
 * and snaps back fast if released early. Keyboard activation falls back to a confirm dialog.
 */
export function HoldButton({ label, ms, onConfirm, onKeyboard }: { label: string; ms: number; onConfirm: () => void; onKeyboard: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHolding(true);
    timer.current = window.setTimeout(() => { setHolding(false); onConfirm(); }, ms);
  };
  const cancel = () => { window.clearTimeout(timer.current); setHolding(false); };
  return (
    <button type="button" className="btn bad hold" data-holding={holding || undefined} style={{ ["--hold" as any]: `${ms}ms` }}
      onPointerDown={start} onPointerUp={cancel} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onClick={(e) => { if (e.detail === 0) onKeyboard(); }} onContextMenu={(e) => e.preventDefault()}>
      <span className="hold-fill" aria-hidden="true"><span>{label}</span></span>
      <span className="hold-label">{label}</span>
    </button>
  );
}
