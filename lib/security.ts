import crypto from "node:crypto";

const PIN_PATTERN = /^\d{4}$/;

export function validatePin(pin: string) {
  return PIN_PATTERN.test(pin);
}

export function hashPin(pin: string, salt = crypto.randomBytes(16).toString("hex")) {
  const pinHash = crypto.scryptSync(pin, salt, 64).toString("hex");
  return { pinHash, pinSalt: salt };
}

export function verifyPin(pin: string, pinHash: string, pinSalt: string) {
  const candidate = crypto.scryptSync(pin, pinSalt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(pinHash));
}

function base64url(input: string) {
  return Buffer.from(input).toString("base64url");
}

export function signPayload(payload: object, secret: string) {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readSignedPayload<T>(token: string | undefined, secret: string) {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
