// scripts/docs/build-guide.ts — guides d'utilisation en PDF (lot GD) : `npm run docs:pdf` (tous les guides de docs/),
// `npm run docs:pdf -- studio` (docs/guide-studio.md seulement), `-- --html` (garde aussi le HTML, pour la mise au point).
// Markdown (marked) → HTML mis en page « manuel coloré » (couverture, À propos, sommaire, une couleur par partie, pastilles des
// sous-titres) → PDF A4 par le Chromium de Playwright (déjà présent pour test:install), pied de page numéroté (marges de page
// CSS @bottom-left et @bottom-right, dans la police du guide ; aucun sur la couverture), dans docs/pdf/
// (ignoré par Git : les PDF se régénèrent, ils ne s'éditent jamais).
// Repris de tools/build_guide_pdf.py de blender-addons (b6463b2), généralisé : tout ce qui est propre à un guide est dans son
// en-tête (scripts/docs/guide-rules.ts), aucune rustine propre à un guide. Les règles d'écriture sont contrôlées avant tout
// rendu : une règle enfreinte arrête le générateur avec le fichier et le numéro de ligne.
// Polices fournies par npm (même PDF sur toute machine) : Inter (@fontsource-variable/inter, axe de taille optique, qui tient
// aussi lieu d'Inter Display) et JetBrains Mono (@fontsource/jetbrains-mono), embarquées dans la page (data:), licence OFL-1.1.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { Marked } from 'marked';
import { formatIssues, lighten, parseGuide, partOf, type GuideMeta } from './guide-rules';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(DOCS, 'pdf');
const NODE_MODULES = path.join(ROOT, 'node_modules');

/** Texte d'une chaîne CSS (content: "…"). */
const cssString = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Faces latines (latin, latin-ext) d'un fichier CSS de Fontsource, fichiers woff2 embarqués en data:. */
function fontFaces(cssFile: string): string {
  const file = path.join(NODE_MODULES, cssFile);
  if (!fs.existsSync(file)) {
    throw new Error(`police absente : ${cssFile} (installer les dépendances du lot GD : voir le rapport ou l'architecture, « Réalisé en GD »)`);
  }
  const css = fs.readFileSync(file, 'utf8');
  const faces = css.split(/(?=\/\* )/).filter((block) => /^\/\* [^*]*-latin(-ext)?-/.test(block));
  return faces
    .map((block) =>
      block.replace(/url\(\.\/(files\/[^)]+)\)/g, (_, rel: string) => {
        const data = fs.readFileSync(path.join(path.dirname(file), rel)).toString('base64');
        return `url(data:font/woff2;base64,${data})`;
      }),
    )
    .join('\n');
}

function fontCss(): string {
  return [
    fontFaces('@fontsource-variable/inter/opsz.css'),
    fontFaces('@fontsource/jetbrains-mono/400.css'),
    fontFaces('@fontsource/jetbrains-mono/700.css'),
  ].join('\n');
}

const SANS = "'Inter Variable', 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', Consolas, monospace";

/**
 * Typographie française du texte (hors code et balises) : espace insécable avant « : ; ? ! » et à l'intérieur des guillemets
 * « », pour qu'un signe ne passe jamais seul à la ligne (le .md garde des espaces ordinaires, plus faciles à saisir).
 */
function frenchSpaces(html: string): string {
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<[^>]+>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0')))
    .join('');
}

/** Retouches génériques du HTML produit par marked (conventions décrites dans guide-rules.ts et les guides). */
function decorate(html: string): string {
  return frenchSpaces(html)
    // Sous-titres « 3.2 Titre » : numéro en pastille.
    .replace(/<h3>(\d+\.\d+) (.+?)<\/h3>/g, '<h3><span class="snum">$1</span>$2</h3>')
    // Cases à cocher (« - [ ] ») : liste de contrôle.
    .replace(/<li><input disabled="" type="checkbox"> ?/g, '<li class="check"><span class="box"></span>')
    .replace(/<ul>\n<li class="check">/g, '<ul class="checklist">\n<li class="check">')
    // Encadrés : paragraphe qui commence par « **Attention** », « **Astuce** » ou « **Non disponible** ».
    .replace(/<p><strong>(Attention)<\/strong>/g, '<p class="callout warn"><strong>$1</strong>')
    .replace(/<p><strong>(Astuce)<\/strong>/g, '<p class="callout tip"><strong>$1</strong>')
    .replace(/<p><strong>(Non disponible)<\/strong>/g, '<p class="callout off"><strong>$1</strong>')
    // « Attention » au fil d'un élément de liste.
    .replace(/<li>(.*?)<strong>Attention<\/strong>/g, '<li>$1<strong class="attn">Attention</strong>')
    // Question en gras seule en tête de paragraphe (foire aux questions) : carte.
    .replace(/<p><strong>([^<]*?\?)<\/strong>/g, '<p class="faq-q"><strong>$1</strong>');
}

function renderHtml(meta: GuideMeta, body: string, fonts: string): string {
  const md = new Marked({ gfm: true });
  const parse = (s: string) => md.parse(s, { async: false }) as string;
  const inline = (s: string) => md.parseInline(s, { async: false }) as string;

  // Introduction (avant la section 1) : page « À propos », sans le titre « # … » (déjà sur la couverture).
  const cut = body.search(/^## 1\. /m);
  const intro = body.slice(0, cut).replace(/^# .*$/m, '').trim();
  const sections = body.slice(cut).split(/^## /m).filter(Boolean);

  const toc = new Map<number, { num: number; label: string }[]>();
  const chunks = sections.map((sec) => {
    const nl = sec.indexOf('\n');
    const title = sec.slice(0, nl < 0 ? undefined : nl);
    const rest = nl < 0 ? '' : sec.slice(nl + 1);
    const num = Number(title.split('.', 1)[0]);
    const label = title.slice(title.indexOf('.') + 1).trim();
    const found = partOf(meta.parties, num)!;
    const { index, part } = found;
    const c = part.color;
    const l = lighten(c);
    toc.set(index, [...(toc.get(index) ?? []), { num, label }]);
    const first = num === part.from;
    const span = Array.from({ length: part.to - part.from + 1 }, (_, k) => `<span>${part.from + k}</span>`).join('');
    const divider = first
      ? `<div class="part-divider"><div class="part-kicker">Partie ${index + 1}</div><div class="part-name">${esc(part.name)}</div><div class="part-list">${span}</div></div>`
      : '';
    return `<section class="chapter${first ? ' newpart' : ''}" id="s${num}" style="--c:${c};--l:${l}">${divider}<h2><span class="num">${num}</span><span class="t">${frenchSpaces(inline(label))}</span></h2>${decorate(parse(rest))}</section>`;
  });

  const tocHtml = meta.parties
    .map((p, i) => {
      const rows = (toc.get(i) ?? [])
        .map(({ num, label }) => `<a class="toc-row" href="#s${num}"><span class="toc-n">${num}</span><span>${esc(label.replace(/`/g, ''))}</span></a>`)
        .join('');
      return `<div class="toc-part" style="--c:${p.color};--l:${lighten(p.color)}"><div class="toc-head"><span>Partie ${i + 1}</span>${esc(p.name)}</div>${rows}</div>`;
    })
    .join('');

  const colors = meta.parties.map((p) => p.color);
  const col = (i: number) => colors[i % colors.length];
  const shapes = [
    // Formes hors de la bande du titre (environ 80 à 140 mm du haut).
    [120, 'right:-30mm;top:-30mm'],
    [70, 'right:60mm;top:6mm'],
    [46, 'right:30mm;top:150mm'],
    [26, 'right:86mm;top:172mm'],
    [18, 'right:12mm;top:204mm'],
  ]
    .map(([size, pos], i) => `<div class="shape" style="width:${size}mm;height:${size}mm;${pos};background:${col(i)}"></div>`)
    .join('');
  const band = `linear-gradient(90deg,${colors.map((c, i) => `${c} ${Math.round((i / Math.max(colors.length - 1, 1)) * 100)}%`).join(',')})`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(meta.titre)}</title>
<style>
${fonts}
@page { size: A4; margin: 18mm 16mm 20mm 16mm;
  @bottom-left { content: "${cssString(meta.pied)}"; font-family:${SANS}; font-size:7.5pt; color:#8a90a3; vertical-align:middle; }
  @bottom-right { content: counter(page); font-family:${SANS}; font-size:7.5pt; color:#8a90a3; vertical-align:middle; }
}
@page :first { margin: 0; }
:root { --ink:#1f2433; --muted:#5b6275; --line:#e4e7ef; --paper:#ffffff; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin:0; font-family:${SANS}; font-size:9.1pt; line-height:1.45; color:var(--ink); background:var(--paper); }
code { font-family:${MONO}; font-size:.84em; background:#f1f3f8; border:1px solid #e3e6ee; padding:.05em .35em; border-radius:4px; color:#2d3550; }
strong { font-weight:650; }
a { color:inherit; text-decoration:none; }
.display { font-family:${SANS}; font-optical-sizing:auto; }

/* Couverture */
.cover { height:297mm; width:210mm; position:relative; overflow:hidden; background:#151a2e; color:#fff; page-break-after:always; }
.cover .shape { position:absolute; border-radius:50%; opacity:.95; }
.cover .band { position:absolute; left:0; right:0; bottom:52mm; height:3mm; background:${band}; }
.cover .title { position:absolute; left:20mm; top:86mm; right:20mm; }
.cover .kicker { font-weight:600; letter-spacing:.18em; text-transform:uppercase; font-size:10pt; color:#9fb3ff; }
.cover h1 { font-weight:800; font-size:54pt; line-height:1; margin:6mm 0 4mm; letter-spacing:-.02em; }
.cover .sub { font-size:15pt; color:#d7dcf2; font-weight:400; max-width:130mm; }
.cover .meta { position:absolute; left:20mm; bottom:24mm; display:flex; gap:4mm; flex-wrap:wrap; max-width:120mm; }
.cover .pill { border:1.5px solid rgba(255,255,255,.35); border-radius:999px; padding:2mm 4.5mm; font-size:9.5pt; font-weight:500; }
.cover .brand { position:absolute; right:20mm; bottom:24mm; text-align:right; font-size:9pt; color:#aab3d6; line-height:1.4; }
.cover .brand b { color:#fff; font-size:12pt; font-weight:700; display:block; }

/* À propos + sommaire */
.front { page-break-after:always; }
.front h2.plain { font-size:20pt; font-weight:800; margin:0 0 3mm; letter-spacing:-.01em; border:0; padding:0; }
.about { background:#f6f7fb; border:1px solid var(--line); border-radius:4mm; padding:4mm 5mm; margin-bottom:6mm; font-size:8.8pt; }
.about p { margin:1.6mm 0; }
.toc { columns:2; column-gap:7mm; }
.toc-part { break-inside:avoid; margin-bottom:4mm; border-radius:3.5mm; overflow:hidden; border:1px solid var(--line); }
.toc-head { background:var(--c); color:#fff; font-weight:700; font-size:12pt; padding:2.6mm 4mm; }
.toc-head span { display:block; font-size:7.5pt; letter-spacing:.14em; text-transform:uppercase; opacity:.8; font-weight:600; }
.toc-row { display:flex; gap:3mm; align-items:baseline; padding:1.05mm 4mm; border-top:1px solid var(--line); font-size:9.2pt; }
.toc-n { flex:0 0 7mm; height:5.5mm; border-radius:1.5mm; background:var(--l); color:var(--c); font-weight:700; text-align:center; line-height:5.5mm; font-size:8.5pt; }

/* Parties */
.part-divider { break-inside:avoid; break-after:avoid; margin-top:4mm; background:var(--c); color:#fff; border-radius:4mm; padding:6mm 7mm; margin-bottom:6mm; position:relative; overflow:hidden; }
.part-divider::after { content:''; position:absolute; right:-14mm; top:-14mm; width:52mm; height:52mm; border-radius:50%; background:rgba(255,255,255,.14); }
.part-kicker { font-size:8pt; letter-spacing:.18em; text-transform:uppercase; font-weight:600; opacity:.85; }
.part-name { font-size:24pt; font-weight:800; letter-spacing:-.01em; }
.part-list span { display:inline-block; margin:2mm 1.5mm 0 0; background:rgba(255,255,255,.2); border-radius:1.5mm; padding:.4mm 2.2mm; font-size:8.5pt; font-weight:600; }
.front + .chapter .part-divider { margin-top:0; }

/* Titres */
h2 { display:block; break-inside:avoid; margin:7mm 0 3mm; padding-bottom:2mm; border-bottom:2.5px solid var(--c); break-after:avoid; font-size:15.5pt; font-weight:750; letter-spacing:-.01em; }
.chapter.newpart h2 { margin-top:0; }
h2 .num { min-width:10mm; height:10mm; line-height:10mm; border-radius:3mm; background:var(--c); color:#fff; display:inline-block; text-align:center; font-size:13pt; font-weight:800; padding:0 2mm; margin-right:3.5mm; vertical-align:middle; }
h2 .t { vertical-align:middle; }
h2 code { font-size:.8em; }
h3 { font-size:11.5pt; font-weight:700; margin:5mm 0 2mm; color:var(--ink); break-after:avoid; display:flex; align-items:center; gap:2.5mm; }
h3 .snum { background:var(--l); color:var(--c); border-radius:1.5mm; padding:.3mm 2mm; font-size:9pt; font-weight:800; }
p { margin:1.8mm 0; }
ul, ol { margin:1.5mm 0; padding-left:6mm; }
li { margin:.9mm 0; }
li::marker { color:var(--c); font-weight:700; }
ol > li { padding-left:1mm; }

/* Tableaux */
table { width:100%; border-collapse:separate; border-spacing:0; margin:3mm 0; font-size:8.7pt; border:1px solid var(--line); border-radius:3mm; overflow:hidden; }
thead th { background:var(--c); color:#fff; text-align:left; font-weight:650; padding:1.8mm 2.6mm; }
td { padding:1.6mm 2.6mm; border-top:1px solid var(--line); vertical-align:top; }
tbody tr:nth-child(even) td { background:#f8f9fc; }
tr { break-inside:avoid; }

/* Code */
pre { background:#151a2e; color:#e6e9f5; border-radius:3mm; padding:3.5mm 4.5mm; font-size:8.1pt; line-height:1.45; overflow:hidden; border-left:4px solid var(--c); break-inside:avoid; white-space:pre-wrap; }
pre code { background:transparent; border:0; color:inherit; padding:0; font-size:1em; }

/* Encadrés */
.callout { border-radius:3mm; padding:2.6mm 4mm; margin:3mm 0; break-inside:avoid; }
.callout.warn { background:#fff4e5; border-left:4px solid #f59e0b; }
.callout.tip { background:var(--l); border-left:4px solid var(--c); }
.callout.off { background:#f1f2f5; border-left:4px solid #8a90a3; color:#4a5063; }
strong.attn { background:#f59e0b; color:#fff; border-radius:1mm; padding:0 1.4mm; }
.faq-q { margin-top:3.5mm; padding:2mm 3.5mm; background:#f8f9fc; border-left:4px solid var(--c); border-radius:0 2mm 2mm 0; break-inside:avoid; }
.faq-q strong:first-child { display:block; color:var(--c); margin-bottom:.6mm; }

/* Liste de contrôle */
ul.checklist { list-style:none; padding-left:0; }
li.check { position:relative; padding:2mm 3mm 2mm 10.5mm; border:1px solid var(--line); border-radius:2.5mm; margin:1.8mm 0; break-inside:avoid; }
li.check .box { position:absolute; left:3.4mm; top:2.5mm; width:4.2mm; height:4.2mm; border:2px solid var(--c); border-radius:1.2mm; }
</style></head><body>

<div class="cover">
  ${shapes}
  <div class="title">
    <div class="kicker">${esc(meta.surtitre)}</div>
    <h1>${esc(meta.titre)}</h1>
    <div class="sub">${esc(meta.sousTitre)}</div>
  </div>
  <div class="band"></div>
  <div class="meta">${meta.pastilles.map((p) => `<span class="pill">${esc(p)}</span>`).join('')}</div>
  <div class="brand"><b>Éditions Liger</b>Livres augmentés</div>
</div>

<div class="front">
  <h2 class="plain">À propos de ce guide</h2>
  <div class="about">${frenchSpaces(parse(intro))}</div>
  <h2 class="plain">Sommaire</h2>
  <div class="toc">${tocHtml}</div>
</div>

${chunks.join('\n')}
</body></html>`;
}

/** Nombre de pages d'un PDF (objets « /Type /Page »). */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keepHtml = args.includes('--html');
  const names = args.filter((a) => !a.startsWith('--'));
  const all = fs.existsSync(DOCS)
    ? fs.readdirSync(DOCS).filter((f) => /^guide-[a-z0-9-]+\.md$/.test(f)).map((f) => f.slice(6, -3)).sort()
    : [];
  for (const n of names) {
    if (!all.includes(n)) {
      console.error(`docs:pdf : guide « ${n} » introuvable (docs/guide-${n}.md) ; guides : ${all.join(', ') || 'aucun'}`);
      process.exit(1);
    }
  }
  const chosen = names.length ? names : all;
  if (!chosen.length) {
    console.error('docs:pdf : aucun guide dans docs/ (fichiers docs/guide-<nom>.md)');
    process.exit(1);
  }

  // Règles d'écriture d'abord : rien n'est produit si un guide les enfreint.
  const guides = chosen.map((name) => {
    const rel = `docs/guide-${name}.md`;
    return { name, rel, parsed: parseGuide(fs.readFileSync(path.join(ROOT, rel), 'utf8')) };
  });
  const bad = guides.filter((g) => g.parsed.issues.length);
  if (bad.length) {
    for (const g of bad) console.error(formatIssues(g.rel, g.parsed.issues));
    const total = bad.reduce((s, g) => s + g.parsed.issues.length, 0);
    console.error(`docs:pdf : ${total} règle(s) d'écriture enfreinte(s) : aucun PDF produit.`);
    process.exit(1);
  }

  const fonts = fontCss();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const g of guides) {
      const meta = g.parsed.meta!;
      const html = renderHtml(meta, g.parsed.body, fonts);
      if (keepHtml) fs.writeFileSync(path.join(OUT, `guide-${g.name}.html`), html);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      await page.close();
      const file = path.join(OUT, `guide-${g.name}.pdf`);
      fs.writeFileSync(file, pdf);
      console.log(`docs:pdf : ${path.relative(ROOT, file).replace(/\\/g, '/')} : ${pageCount(pdf)} pages`);
    }
  } finally {
    await browser.close();
  }
}

await main();
