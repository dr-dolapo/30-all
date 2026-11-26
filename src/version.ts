import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Keeps long-open tabs on the latest release.
 * Every build gets an id (baked into this bundle, and published as /version.json). When the tab comes
 * back into view we compare the two; if a newer build is live, the next page change reloads quietly,
 * unless a sheet or dialog is open, in which case we wait for the page change after that.
 */
declare const __BUILD_ID__: string;
export const BUILD_ID = __BUILD_ID__;
let stale = false;

async function check() {
  if (BUILD_ID === "dev" || stale) return;
  try {
    const r = await fetch("/version.json", { cache: "no-store" });
    if (!r.ok) return;
    const v = await r.json();
    if (v.build && v.build !== BUILD_ID) stale = true;
  } catch { /* offline: try again next time */ }
}

export function watchForUpdates() {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  // Safari/iOS can restore a whole page from memory when you come back to the tab
  window.addEventListener("pageshow", (e) => { if (e.persisted) check(); });
}

/** Mounted once inside the router: on a page change, swap to the new release if one is waiting. */
export function ReloadWhenStale() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (stale && !document.querySelector('[aria-modal="true"]')) window.location.reload();
  }, [pathname]);
  return null;
}
