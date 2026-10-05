import { createHmac, timingSafeEqual } from "node:crypto";

// Credenciais configuráveis por variáveis de ambiente (padrão: admin / 1234)
function getCredentials() {
  return {
    username: process.env.ADMIN_USER || "admin",
    password: process.env.ADMIN_PASSWORD || "1234",
  };
}

// Segredo usado para assinar as sessões. Se não for definido, deriva da senha,
// o que também invalida todas as sessões quando a senha é alterada.
function getSecret() {
  const { username, password } = getCredentials();
  return process.env.ADMIN_SESSION_SECRET || `signage:${username}:${password}`;
}

function sign(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function checkCredentials(username: unknown, password: unknown) {
  const creds = getCredentials();
  return (
    typeof username === "string" &&
    typeof password === "string" &&
    safeEqual(username.trim(), creds.username) &&
    safeEqual(password, creds.password)
  );
}

export function createToken(username: string, remember: boolean) {
  const ttlMs = remember ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + ttlMs })).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt: Date.now() + ttlMs };
}

export function verifyRequest(req: Request) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
