/**
 * Compatibility level between the app and the API.
 *
 * Bump this (0 → 1 → 2 …) in a release that changes the API in a way older copies of the app
 * can't handle. Every tab still running an older copy gets a 426 on its next request and reloads
 * itself straight away. Leave it alone for normal releases: those are picked up by the version
 * check in src/version.ts the next time an open tab comes back into view.
 */
export const API_COMPAT = 0;
export const COMPAT_HEADER = "X-App-Compat";
