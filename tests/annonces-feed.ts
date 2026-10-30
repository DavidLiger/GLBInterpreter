// Flux d'annonces de test (AN1, spec-annonces.md §3, §11) : enveloppes signées avec les clés de test
// (`tests/annonces-test-keys.json`), dates relatives au jour, une scène par scénario. Servi par `tests/static-server.ts
// --annonces <port>` et lu par `test:engine`. Signature ECDSA P-256 / SHA-256 de WebCrypto (r ‖ s, 64 octets).
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const KEYS = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'annonces-test-keys.json'), 'utf8')) as {
  keys: { keyId: string; spki: string; pkcs8: string }[];
  foreign: { spki: string; pkcs8: string };
};
export const TEST_KEYS = KEYS.keys.map(({ keyId, spki }) => ({ keyId, spki }));

export const SCENARIOS = [
  'valide', 'secours', 'inconnue', 'signature-fausse', 'autre-cle', 'perime', 'image-fausse', 'lent', 'propre-livre',
  'lien-hors-liste', 'deux', 'absent',
] as const;
export type Scenario = (typeof SCENARIOS)[number];
export const isScenario = (s: string | null): s is Scenario => !!s && (SCENARIOS as readonly string[]).includes(s);

export const TEST_BOOK_ID = 'test-dino';
export const IMAGE_PATH = 'images/annonce-test.png';

/** Jour local décalé de `days` jours, « AAAA-MM-JJ ». */
export function day(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const T3 = (fr: string, en: string, es: string) => ({ fr, en, es });

/** Image de l'annonce de test (PNG 600 × 360), construite une fois. */
let imageCache: Buffer | null = null;
export async function testImage(): Promise<Buffer> {
  if (imageCache) return imageCache;
  const sharp = (await import('sharp')).default;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#1e3a5f"/>
<circle cx="470" cy="110" r="70" fill="#fbbf24"/><path d="M0 360 L200 150 L330 280 L430 200 L600 360 Z" fill="#4d7c0f"/>
<text x="30" y="70" font-family="sans-serif" font-size="40" font-weight="bold" fill="#fff">ANNONCE DE TEST</text></svg>`;
  imageCache = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
  return imageCache;
}

const sha256 = async (b: Uint8Array) => Buffer.from(await subtle.digest('SHA-256', b)).toString('hex');

async function sign(data: Uint8Array, pkcs8: string): Promise<Uint8Array> {
  const key = await subtle.importKey('pkcs8', Buffer.from(pkcs8, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data));
}

/** Enveloppe signée d'un payload (clé courante par défaut). */
export async function envelope(payload: unknown, opts: { key?: 0 | 1 | 'foreign'; keyId?: string; tamper?: boolean } = {}): Promise<Buffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const k = opts.key === 'foreign' ? { keyId: KEYS.keys[0].keyId, pkcs8: KEYS.foreign.pkcs8 } : KEYS.keys[opts.key ?? 0];
  const sig = await sign(bytes, k.pkcs8);
  // Octets modifiés après la signature : une lettre du titre changée.
  const sent = opts.tamper ? new TextEncoder().encode(JSON.stringify(payload).replace('volcans', 'Volcans')) : bytes;
  return Buffer.from(
    JSON.stringify({ payload: Buffer.from(sent).toString('base64'), signature: Buffer.from(sig).toString('base64'), keyId: opts.keyId ?? k.keyId }),
  );
}

/** Annonce valide de test (« annonce-test-1 », livre « livre-test-2 », image et lien permis). */
export async function item(over: Record<string, unknown> = {}, now = new Date()) {
  return {
    id: 'annonce-test-1',
    bookId: 'livre-test-2',
    start: day(-1, now),
    end: day(30, now),
    title: T3('Le livre des volcans (test)', 'The book of volcanoes (test)', 'El libro de los volcanes (prueba)'),
    text: T3(
      'Annonce de test : un nouveau livre augmenté des Éditions Liger.',
      'Test announcement: a new augmented book from Éditions Liger.',
      'Anuncio de prueba: un nuevo libro aumentado de Éditions Liger.',
    ),
    url: 'https://www.editions-liger.com/',
    image: { path: IMAGE_PATH, sha256: await sha256(await testImage()) },
    ...over,
  };
}

export const payloadOf = (items: unknown[], now = new Date(), issued = -1, expires = 60) => ({
  version: 1,
  issued: day(issued, now),
  expires: day(expires, now),
  items,
});

/** Réponse du flux pour un scénario : statut, corps, attente avant la réponse. */
export async function feedFor(s: Scenario, now = new Date()): Promise<{ status: number; body: Buffer; delayMs: number }> {
  const ok = (body: Buffer, delayMs = 0) => ({ status: 200, body, delayMs });
  const one = async (over: Record<string, unknown> = {}) => payloadOf([await item(over, now)], now);
  switch (s) {
    case 'valide':
      return ok(await envelope(await one()));
    case 'secours':
      return ok(await envelope(await one(), { key: 1 }));
    case 'inconnue':
      return ok(await envelope(await one(), { keyId: 'k-inconnue' }));
    case 'signature-fausse':
      return ok(await envelope(await one(), { tamper: true }));
    case 'autre-cle':
      return ok(await envelope(await one(), { key: 'foreign' }));
    case 'perime':
      return ok(await envelope(payloadOf([await item({}, now)], now, -60, -1)));
    case 'image-fausse':
      return ok(await envelope(await one({ image: { path: IMAGE_PATH, sha256: '0'.repeat(64) } })));
    case 'lent':
      return ok(await envelope(await one()), 6000);
    case 'propre-livre':
      return ok(await envelope(await one({ bookId: TEST_BOOK_ID })));
    case 'lien-hors-liste':
      return ok(await envelope(await one({ url: 'https://exemple.com/livre' })));
    case 'deux':
      return ok(
        await envelope(
          payloadOf(
            [
              await item({ start: day(-10, now) }, now),
              await item({ id: 'annonce-test-2', start: day(-2, now), title: T3('Second livre (test)', 'Second book (test)', 'Segundo libro (prueba)') }, now),
            ],
            now,
          ),
        ),
      );
    case 'absent':
      return { status: 404, body: Buffer.from('introuvable'), delayMs: 0 };
  }
}
