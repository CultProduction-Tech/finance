const SECRET = process.env.AUTH_SECRET || "default-secret-change-me";

async function signEdge(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifySessionEdge(sessionCookie: string): Promise<string | null> {
  try {
    const decoded = atob(sessionCookie);
    const { payload, signature } = JSON.parse(decoded);
    const expected = await signEdge(payload);
    if (expected !== signature) return null;
    const { email, expires } = JSON.parse(payload);
    if (Date.now() > expires) return null;
    return email;
  } catch {
    return null;
  }
}
