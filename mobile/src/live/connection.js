/** Whether the API is answering, as seen by every request the app makes.
 * Same store as the web app's (frontend/dashboard/src/live/connection.js):
 * api.js reports each response, and the shell shows one banner, with the
 * time of the last good answer, while the server is unreachable. */

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

/** Only a missing response, or a gateway saying the API is gone, proves
 * the connection is down; any other error is the API answering. */
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
