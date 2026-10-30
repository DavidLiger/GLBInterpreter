// Serveur statique des tests d'installation (Î8) : sert `out/` à la racine et sous `/depot/` (même dossier, D-8.4), sans
// cache HTTP, et expose des commandes de test :
//   GET /__stats                       nombre de requêtes par chemin (relatif à la racine du livre)
//   GET /__reset                       remet à zéro compteurs, coupures et mutation
//   GET /__fail?path=<p>&times=<n>     coupe la connexion au milieu du corps des <n> prochaines réponses de <p>
//   GET /__mutate?on=1                 simule une reconstruction du livre : index.html modifié, book.json à jour
//
//   GET /__annonces?scenario=<s>       flux d'annonces servi (AN1, tests/annonces-feed.ts ; défaut : valide)
//   GET /__annonces/stats              requêtes reçues par le serveur du flux : { feed, image, headers } (en-têtes de la
//                                      dernière requête du flux)
//
//   npx tsx tests/static-server.ts [port] [dossier] [--annonces <port>]      (défauts : 4173, out ; flux : aucun)
// Avec `--annonces <port>` (AN1), un second serveur sert le flux d'annonces de test sur ce port, toutes interfaces
// (`/v1/annonces.json`, `/v1/images/…`, CORS ouvert) : c'est l'adresse lue par le livre de test construit avec
// GLBI_ANNONCES_TEST=1 (même hôte que la page, port 4175).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { IMAGE_PATH, feedFor, isScenario, testImage, type Scenario } from './annonces-feed';

const args = process.argv.slice(2);
const flag = args.indexOf('--annonces');
const annoncesPort = flag >= 0 ? Number(args[flag + 1]) : null;
const positional = flag >= 0 ? args.filter((_, i) => i !== flag && i !== flag + 1) : args;
const port = Number(positional[0] ?? 4173);
const root = path.resolve(positional[1] ?? 'out');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.txt': 'text/plain',
};

let stats: Record<string, number> = {};
let failures: Record<string, number> = {};
let mutate = false;

const MUTATION = '\n<!-- reconstruction simulée (tests Î8) -->\n';

function readBookFile(rel: string): Buffer | null {
  const full = path.join(root, rel);
  if (!full.startsWith(root) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  let data = fs.readFileSync(full);
  if (mutate && rel === 'index.html') data = Buffer.concat([data, Buffer.from(MUTATION)]);
  if (mutate && rel === 'book.json') {
    const index = JSON.parse(data.toString('utf8'));
    const html = readBookFile('index.html')!;
    for (const f of index.files) {
      if (f.path === 'index.html') {
        f.size = html.length;
        f.sha256 = crypto.createHash('sha256').update(html).digest('hex');
      }
    }
    data = Buffer.from(JSON.stringify(index));
  }
  return data;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const send = (status: number, body: string, type = 'text/plain') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };

  if (url.pathname === '/__stats') return send(200, JSON.stringify(stats), 'application/json');
  if (url.pathname === '/__reset') {
    stats = {};
    failures = {};
    mutate = false;
    resetAnnonces();
    return send(200, 'ok');
  }
  if (url.pathname === '/__annonces/stats') return send(200, JSON.stringify(annonceStats), 'application/json');
  if (url.pathname === '/__annonces') {
    const sc = url.searchParams.get('scenario');
    if (!isScenario(sc)) return send(400, `scénario inconnu : ${sc}`);
    scenario = sc;
    annonceStats = { feed: 0, image: 0, headers: null };
    return send(200, 'ok');
  }
  if (url.pathname === '/__fail') {
    failures[url.searchParams.get('path') ?? ''] = Number(url.searchParams.get('times') ?? 1);
    return send(200, 'ok');
  }
  if (url.pathname === '/__mutate') {
    mutate = url.searchParams.get('on') === '1';
    return send(200, 'ok');
  }

  let rel = decodeURIComponent(url.pathname).replace(/^\/depot(\/|$)/, '/').replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  let data = readBookFile(rel);
  if (!data && !path.extname(rel)) {
    rel = `${rel}/index.html`;
    data = readBookFile(rel);
  }
  stats[rel] = (stats[rel] ?? 0) + 1;
  if (!data) return send(404, 'introuvable');

  const headers = { 'content-type': TYPES[path.extname(rel)] ?? 'application/octet-stream', 'content-length': String(data.length), 'cache-control': 'no-store' };
  if (failures[rel] > 0) {
    failures[rel]--;
    res.writeHead(200, headers);
    res.write(data.subarray(0, Math.floor(data.length / 2)));
    setTimeout(() => res.destroy(), 50); // coupure au milieu du corps
    return;
  }
  res.writeHead(200, headers);
  res.end(data);
});

server.listen(port, () => console.log(`serveur de test : http://localhost:${port}/ et /depot/ → ${root}`));

// ── Flux d'annonces de test (AN1) ──
let scenario: Scenario = 'valide';
let annonceStats: { feed: number; image: number; headers: Record<string, string | string[] | undefined> | null } = { feed: 0, image: 0, headers: null };
function resetAnnonces() {
  scenario = 'valide';
  annonceStats = { feed: 0, image: 0, headers: null };
}

if (annoncesPort) {
  const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
  http
    .createServer(async (req, res) => {
      const p = new URL(req.url ?? '/', 'http://x').pathname;
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors);
        return res.end();
      }
      if (p === '/v1/annonces.json') {
        annonceStats.feed++;
        annonceStats.headers = req.headers;
        const r = await feedFor(scenario);
        const reply = () => {
          if (res.destroyed) return;
          res.writeHead(r.status, { ...cors, 'content-type': 'application/json', 'content-length': String(r.body.length) });
          res.end(r.body);
        };
        if (r.delayMs) setTimeout(reply, r.delayMs);
        else reply();
        return;
      }
      if (p === `/v1/${IMAGE_PATH}`) {
        annonceStats.image++;
        const img = await testImage();
        res.writeHead(200, { ...cors, 'content-type': 'image/png', 'content-length': String(img.length) });
        return res.end(img);
      }
      res.writeHead(404, cors);
      res.end('introuvable');
    })
    .listen(annoncesPort, () => console.log(`flux d'annonces de test : http://<hôte>:${annoncesPort}/v1/annonces.json (scénario : ${scenario})`));
}
