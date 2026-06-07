export const authCookieName = "cash-flow-auth";

export function getTrackerPassword() {
  return process.env.CASH_FLOW_TRACKER_PASSWORD ?? "";
}

export function getAuthSecret() {
  return process.env.CASH_FLOW_AUTH_SECRET || getTrackerPassword();
}

export async function authSignature() {
  const password = getTrackerPassword();

  if (!password) {
    return "";
  }

  return sha256(`${password}:${getAuthSecret()}`);
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
