// Where the API lives. The pages still carry their own copy of this
// constant; new code imports it from here.
export const API = "http://localhost:8000";
export const WS_URL = `${API.replace(/^http/, "ws")}/ws/live`;
