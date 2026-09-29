import { createHash, timingSafeEqual } from "node:crypto";

export function tokenMatches(token: string | undefined, hashHex: string | undefined): boolean {
  if (!token || !hashHex || !/^[0-9a-f]{64}$/.test(hashHex)) return false;
  const a = createHash("sha256").update(token, "utf8").digest();
  const b = Buffer.from(hashHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}