/** Display preferences kept on this browser. */

const TRANSPARENCY_KEY = "reduceTransparency";

export function reducedTransparency() {
  try {
    return localStorage.getItem(TRANSPARENCY_KEY) === "on";
  } catch {
    return false;
  }
}

/** Swap the glass for near-opaque fills (see index.css), for readability
 * in bright light or for anyone who finds translucency hard to read. */
export function setReducedTransparency(on) {
  try {
    localStorage.setItem(TRANSPARENCY_KEY, on ? "on" : "off");
  } catch {
    // Private mode: applies to this page only.
  }
  applyReducedTransparency(on);
}

export function applyReducedTransparency(on = reducedTransparency()) {
  document.documentElement.classList.toggle("reduce-transparency", on);
}
