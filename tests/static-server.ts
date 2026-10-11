// Serveur statique des tests d'installation (Î8) : sert `out/` à la racine et sous `/depot/` (même dossier, D-8.4), sans
// cache HTTP, et expose des commandes de test :
//   GET /__stats                       nombre de requêtes par chemin (relatif à la racine du livre)
//   GET /__reset                       remet à zéro compteurs, coupures et mutation
//   GET /__fail?path=<p>&times=<n>     coupe la connexion au milieu du corps des <n> prochaines réponses de <p>
//   GET /__mutate?on=1                 simule une reconstruction du livre : index.html modifié, book.json à jour
//
//   npx tsx tests/static-server.ts [port] [dossier]      (défauts : 4173, out)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const port = Number(process.argv[2] ?? 4173);
const root = path.resolve(process.argv[3] ?? 'out');

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
