/** Whether the API is answering, as seen by every request the app makes.
 *
 * App.jsx reports each response here from its axios interceptor, so a
 * screen does not need to track failures itself: the shell shows one
 * banner, with the time of the last good answer, while the server is
 * unreachable, and hides it on the next success. */

let state = { online: true, lastOk: Date.now() };
const listeners = new Set();

function set(next) {
  if (next.online === state.online && next.lastOk === state.lastOk) return;
  state = next;
  listeners.forEach((fn) => fn(state));
}

export function reportOk() {
  set({ online: true, lastOk: Date.now() });
}

export function reportFailure() {
  if (state.online) set({ ...state, online: false });
}

/** A response only proves the network is down when there is none, or
 * when a gateway in front of the API says the API is gone. */
export function isConnectivityError(error) {
  const status = error?.response?.status;
  return !error?.response || status === 502 || status === 503 || status === 504;
}

export function getConnection() {
  return state;
}

export function subscribeConnection(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", reportFailure);
}
