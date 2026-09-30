// scripts/issue-tokens.mjs — îlot 0 (0.1.a, 0.1.b, 0.2.b)
// Usage : node scripts/issue-tokens.mjs <bookId> <sceneId>=<configPath> [...] [--upload]
// Tokens en clair : private/books/<bookId>.json (non versionné, jamais régénérés s'ils existent)
// QR d'impression : private/qr/<bookId>/qr-<bookId>-<sceneId>.svg
// Index public    : dist/index/<bookId>/index.json  → { [sceneId]: { path, tokenHash } }
import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import QRCode from "qrcode";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SITE_URL = process.env.SITE_URL ?? "https://editions-liger.com";
const R2_PREFIX = process.env.R2_PREFIX ?? "assets/";

const args = process.argv.slice(2);
const upload = args.includes("--upload");
const [bookId, ...sceneArgs] = args.filter((a) => a !== "--upload");

if (!bookId || !ID_RE.test(bookId)) fail("bookId manquant ou invalide");

const privatePath = path.join("private", "books", `${bookId}.json`);
const book = await readJson(privatePath, { scenes: {} });

for (const arg of sceneArgs) {
  const [sceneId, configPath] = arg.split("=");
  if (!ID_RE.test(sceneId ?? "") || !configPath) fail(`argument invalide : ${arg} (attendu sceneId=chemin)`);
  const existing = book.scenes[sceneId];
  book.scenes[sceneId] = {
    path: configPath,
    token: existing?.token ?? randomBytes(16).toString("base64url"),
  };
  console.log(`${existing ? "conservé " : "nouveau  "} ${bookId}/${sceneId}`);
}

if (Object.keys(book.scenes).length === 0) fail("aucune scène : passer au moins sceneId=chemin");

await mkdir(path.dirname(privatePath), { recursive: true });
await writeFile(privatePath, JSON.stringify(book, null, 2) + "\n");

const qrDir = path.join("private", "qr", bookId);
await mkdir(qrDir, { recursive: true });
const index = {};
for (const [sceneId, { path: p, token }] of Object.entries(book.scenes)) {
  index[sceneId] = { path: p, tokenHash: createHash("sha256").update(token, "utf8").digest("hex") };
  const url = `${SITE_URL}/q/${bookId}/${sceneId}?t=${token}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4 });
  await writeFile(path.join(qrDir, `qr-${bookId}-${sceneId}.svg`), svg);
}

const indexPath = path.join("dist", "index", bookId, "index.json");
await mkdir(path.dirname(indexPath), { recursive: true });
await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
console.log(`écrit : ${privatePath}, ${qrDir}/, ${indexPath}`);

if (upload) {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) fail("R2_BUCKET non défini");
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", `${bucket}/${R2_PREFIX}${bookId}/index.json`,
     "--file", indexPath, "--content-type", "application/json", "--remote"],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
}

async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}
function fail(msg) { console.error(`issue-tokens : ${msg}`); process.exit(1); }