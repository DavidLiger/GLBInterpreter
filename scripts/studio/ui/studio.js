// Studio GLBI (ST1 à ST3 ; ST4 : parcours en six étapes et design) : page locale servie par scripts/studio/server.ts. JS sans framework.
// État reçu par le flux /__studio/events (événements `etat`, `journal`, `bye`, `second`, `remplace`) ; toute action par POST
// /__studio/action (JSON, en-tête x-glbi-studio). Marqueur du studio (contrôle de fin de build) : glbi-studio-st1.
// ST2 : formulaire de book.json (valeurs gardées dans la page, validées par le serveur avec bookSchema ; aucune règle du contrat
// recopiée ici : le motif des identifiants de scène et les langues viennent du serveur), création d'un livre, Blender.
// ST3 : essais sur téléphone ; images des QR par GET /__studio/qr (sans effet).
// ST4 (spec-app-bureau.md §16) : parcours en six étapes calculé à partir de l'état reçu (rien de plus n'est demandé au serveur,
// sauf les lignes de book:check par scène) ; une seule « prochaine action » mise en avant (le seul bouton plein hors des feuilles) ;
// messages de book:check rangés par outil et reformulés dans la page, sans changer ceux du build ; le reste dans des feuilles
// (journaux et processus, réglages, outils de développement, informations du livre).
'use strict';

const STUDIO_MARKER = 'glbi-studio-st1';
const $ = (id) => document.getElementById(id);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let S = null;
let journalName = 'studio';
let journalLines = [];
let stopped = false;
/** Étape affichée à droite, choisie par l'utilisateur ; `null` : celle de la prochaine action (le détail la suit). */
let chosen = null;

// ---------------------------------------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------------------------------------

const p2 = (n) => String(n).padStart(2, '0');

function frDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** « aujourd’hui à 14:02 », « le 19/10 à 14:02 ». */
function quand(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? `aujourd’hui à ${hm}` : `le ${p2(d.getDate())}/${p2(d.getMonth() + 1)} à ${hm}`;
}

function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${p2(s % 60)} s` : `${Math.floor(m / 60)} h ${p2(m % 60)} min`;
}

/** Nom du fichier seul (états courts du parcours). */
const base = (rel) => rel.split('/').pop();
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
/** Typographie française : espace insécable avant « : ; ? ! » et dans les guillemets (pas de signe seul en début de ligne). */
/** Les messages d'origine (`<code>`) restent tels quels, au caractère près. */
const typo = (s) => s.split(/(<code[\s\S]*?<\/code>)/).map((part, i) => (i % 2 ? part : part.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0'))).join('');

const ICON = {
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  blender: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9.5" r="4.5"/><circle cx="9" cy="9.5" r="1.5"/><path d="M5.5 6.5L1.5 4M8 5V1.8"/></svg>',
  atelier: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12.5V14h1.5L12.5 5 11 3.5zM9.5 5L11 6.5"/></svg>',
  studio: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M1.8 4.5V13h12.4V5.8H7.6L6.2 4.2H1.8z"/></svg>',
  folder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M1.8 4.5V13h12.4V5.8H7.6L6.2 4.2H1.8z"/></svg>',
  file: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 1.8h6l3 3v9.4h-9z"/><path d="M9.5 1.8v3h3"/></svg>',
  up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4"/></svg>',
};

// Messages passagers : couche supérieure (popover), remontée au-dessus d'une feuille ouverte à chaque message.
function toast(text, error) {
  if (!text) return;
  const box = $('toast');
  const el = document.createElement('div');
  el.className = `t${error ? ' err' : ''}`;
  el.textContent = typo(text);
  const drop = () => {
    el.remove();
    if (!box.children.length) try { box.hidePopover(); } catch { /* déjà fermé */ }
  };
  el.addEventListener('click', drop);
  box.append(el);
  try { box.hidePopover(); } catch { /* pas encore ouvert */ }
  try { box.showPopover(); } catch { /* navigateur sans popover : le message reste dans la page */ }
  setTimeout(drop, error ? 12000 : 5000);
}

/** Contenu remplacé seulement s'il a changé ; valeurs saisies ([data-keep]), volets ouverts (details[data-k]) et focus gardés. */
const lastHtml = new WeakMap();
function setHtml(target, html) {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el || lastHtml.get(el) === html) return false;
  const keep = {};
  for (const x of el.querySelectorAll('[data-keep]')) keep[x.dataset.keep] = x.value;
  const open = new Set([...el.querySelectorAll('details[data-k]')].filter((d) => d.open).map((d) => d.dataset.k));
  const act = document.activeElement;
  const focusKey = act && el.contains(act) ? act.dataset?.keep : undefined;
  lastHtml.set(el, html);
  el.innerHTML = typo(html);
  for (const x of el.querySelectorAll('[data-keep]')) if (x.dataset.keep in keep) x.value = keep[x.dataset.keep];
  for (const d of el.querySelectorAll('details[data-k]')) if (open.has(d.dataset.k)) d.open = true;
  if (focusKey) el.querySelector(`[data-keep="${focusKey}"]`)?.focus({ preventScroll: true });
  tick();
  return true;
}

// ---------------------------------------------------------------------------------------------------------
// Alertes au style Apple (remplacent window.confirm) et feuilles
// ---------------------------------------------------------------------------------------------------------

let alertResolve = null;
/** Confirmation : boîte centrée, « Annuler » à gauche (en gras, comme sur iOS), l'action à droite (en rouge si elle détruit). */
function confirmer(message, { titre = 'Confirmer', ok = 'Continuer', annuler = 'Annuler', danger = false } = {}) {
  if (alertResolve) alertResolve(false);
  return new Promise((resolve) => {
    const d = $('alerte');
    $('alerte-titre').textContent = typo(titre);
    $('alerte-message').textContent = typo(message);
    const bs = $('alerte-boutons');
    bs.className = `alert-buttons${ok.length + annuler.length > 22 ? ' stack' : ''}`;
    bs.innerHTML = `<button type="button" class="alert-btn strong" data-r="0">${h(annuler)}</button><button type="button" class="alert-btn${danger ? ' danger' : ''}" data-r="1">${h(ok)}</button>`;
    alertResolve = (v) => {
      alertResolve = null;
      if (d.open) d.close();
      resolve(v);
    };
    d.showModal();
    bs.querySelector('[data-r="1"]').focus();
  });
}
$('alerte-boutons').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-r]');
  if (b && alertResolve) alertResolve(b.dataset.r === '1');
});
$('alerte').addEventListener('cancel', (ev) => {
  ev.preventDefault();
  if (alertResolve) alertResolve(false);
});

const SHEETS = { journaux: 'feuille-journaux', reglages: 'feuille-reglages', outils: 'feuille-outils', livre: 'feuille-livre', creer: 'feuille-creer' };
function openSheet(name) {
  const d = $(SHEETS[name]);
  if (!d.open) d.showModal();
  if (name === 'creer') onCreateOpen();
  if (name === 'journaux') showJournal();
  return d;
}

// Clic sur le voile (hors de la feuille) : la ferme. Les alertes, elles, attendent une réponse.
for (const d of document.querySelectorAll('dialog.sheet')) {
  d.addEventListener('mousedown', (ev) => {
    if (ev.target !== d) return;
    const r = d.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) d.close();
  });
}
for (const id of ['fin', 'veille']) $(id).addEventListener('cancel', (ev) => ev.preventDefault());

// ---------------------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------------------

/** Action sans message affiché (validation en direct du formulaire). Sans réponse après 10 s : signalé (correctif ST2). */
async function post(action, extra = {}) {
  const slow = setTimeout(() => toast(`Le studio ne répond pas encore (${action}) : un autre onglet du studio, ou un processus bloqué ? Voir le journal du studio.`, true), 10_000);
  try {
    const res = await fetch('/__studio/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-glbi-studio': '1' },
      body: JSON.stringify({ action, ...extra }),
    });
    return await res.json().catch(() => ({ ok: false, error: `réponse ${res.status}` }));
  } catch {
    return { ok: false, error: 'studio injoignable' };
  } finally {
    clearTimeout(slow);
  }
}

/**
 * Messages passagers en mots simples (CC2, point de clôture de ST4) : les réponses du serveur restent techniques (elles sont
 * aussi écrites dans les journaux) ; la page les reformule avant de les montrer. Un message non reconnu est montré tel quel.
 */
const TASK_NAMES = { 'book:check': 'Vérification du livre', 'dev:book': 'Mise à jour du lecteur du PC', 'Lecteur de développement': 'Lecteur du PC', 'Préparer le livre': 'Préparation du livre' };
const taskName = (label) => TASK_NAMES[label] ?? label;
const PLAIN = [
  [/^book:check lancé$/, 'Vérification du livre lancée'],
  [/^dev:book lancé$/, 'Mise à jour du lecteur du PC lancée'],
  [/^atelier lancé sur le port \d+$/, 'Atelier en cours de démarrage'],
  [/^lecteur de développement lancé sur le port \d+$/, 'Lecteur du PC en cours de démarrage'],
  [/^serveur de test lancé sur le port \d+$/, 'Serveur de test en cours de démarrage (téléphone par le Wi-Fi)'],
  [/^lancement : Préparer le livre$/, 'Préparation du livre lancée'],
  [/^arrêt : (.+)$/, (m) => `${taskName(m[1])} : arrêt demandé`],
  [/^book\.json identique au formulaire : rien écrit$/, 'Rien à enregistrer : book.json est déjà à jour'],
  [/^book\.json non écrit : refusé par bookSchema/, 'Informations du livre non enregistrées : voir les messages sous le formulaire'],
  [/serveur de test refusé|publication refusée/, () => `Pas maintenant : ${outPlain(S.outputs.out).why}`],
  [/^une seule tâche à la fois parmi .* : (.+) en cours$/, (m) => `${taskName(m[1])} en cours : attendre sa fin`],
  [/^livre déjà ouvert$/, 'Ce livre est déjà ouvert'],
];
function plainMsg(text) {
  for (const [re, say] of PLAIN) {
    const m = text.match(re);
    if (m) return typeof say === 'function' ? say(m) : say;
  }
  return text
    .replace(/ \(il écrit [^)]*\)/, '')
    .replace(/ \(il supprime et réécrit out\/\)/, '')
    .replace(/\(elle envoie out\/\)/, '(elle envoie le livre préparé)')
    .replace(/^(book:check|dev:book|Lecteur de développement|Préparer le livre) (en cours|déjà en cours)/, (m, k, w) => `${taskName(k)} ${w}`);
}

async function act(action, extra = {}) {
  const r = await post(action, extra);
  if (r.confirm) {
    if (await confirmer(r.confirm, { ok: 'Continuer' })) return act(action, { ...extra, confirme: true });
    return r;
  }
  if (r.error) toast(plainMsg(r.error), true);
  else if (r.message) toast(plainMsg(r.message));
  return r;
}

const byName = (n) => S?.managed.find((m) => m.name === n);
const isRunning = (m) => !!m && (m.state === 'démarrage' || m.state === 'prêt' || m.state === 'en cours');

function badge(m) {
  const cls = { prêt: 'ok', terminé: 'ok', 'en cours': 'run', démarrage: 'run', erreur: 'err' }[m.state] ?? '';
  const code = m.state === 'erreur' && m.code !== null ? ` (code ${m.code})` : '';
  return `<span class="badge ${cls}">${h(m.state)}${code}</span>`;
}

/** Durée en direct : le contenu est écrit par `tick` (le HTML rendu ne change pas chaque seconde). */
const timeOf = (m) => (m.startedAt ? `<span class="t-dur" data-start="${m.startedAt}" data-end="${m.endedAt ?? ''}"></span>` : '');
function tick() {
  for (const el of document.querySelectorAll('.t-dur')) {
    const end = el.dataset.end ? Number(el.dataset.end) : Date.now();
    el.textContent = dur(end - Number(el.dataset.start));
  }
}
setInterval(tick, 1000);

/** Raison pour laquelle un processus ou une tâche ne peut pas démarrer maintenant ('' : rien ne l'empêche). Mêmes règles que le serveur. */
function blockReason(n) {
  const m = byName(n);
  const ex = S.exclusive ? byName(S.exclusive) : null;
  const needBook = ['atelier', 'dev', 'serveur-test', 'book-check', 'build', 'dev-book', 'publier'].includes(n);
  if (needBook && !S.book) return 'aucun livre ouvert';
  if (n === 'dev' && ex) return `${ex.label} en cours : attendre sa fin`;
  if (n === 'serveur-test') {
    if (ex && ex.name !== 'dev-book') return `${ex.label} en cours : attendre sa fin`;
    if (!S.outputs.out.ok) return outPlain(S.outputs.out).why;
  }
  if (m?.exclusive && ex && ex.name !== n) return `${ex.label} en cours : attendre sa fin`;
  if ((n === 'build' || n === 'suite') && isRunning(byName('publier'))) return 'publication d’essai en cours (elle envoie le livre préparé)';
  if (n === 'publier') {
    if (!S.outputs.out.ok) return outPlain(S.outputs.out).why;
    const w = ['build', 'suite'].map(byName).find(isRunning);
    if (w) return `${w.label} en cours : attendre sa fin`;
    if (isRunning(byName('cloudflare'))) return 'connexion à Cloudflare en cours';
  }
  if (n === 'cloudflare' && isRunning(byName('publier'))) return 'publication d’essai en cours';
  return '';
}

/** Bouton d'action : `b` = { label, act, data?, why? } ; `cls` : 'primary lg', 'sm'… */
function button(b, cls = '') {
  if (!b) return '';
  const data = Object.entries(b.data ?? {}).map(([k, v]) => ` data-${k}="${h(v)}"`).join('');
  return `<button type="button" class="btn ${cls}" data-act="${h(b.act)}"${data}${b.why ? ` disabled title="${h(b.why)}"` : ''}>${h(b.label)}</button>`;
}
const start = (label, nom, data = {}) => ({ label, act: 'demarrer', data: { nom, ...data }, why: blockReason(nom) });
const stop = (nom, label = 'Arrêter') => ({ label, act: 'arreter', data: { nom } });

// ---------------------------------------------------------------------------------------------------------
// Ouvrir l'atelier et le lecteur du PC : un clic, l'onglet s'ouvre tout de suite et se charge quand le serveur est prêt
// ---------------------------------------------------------------------------------------------------------

const pendingTabs = {};

function toolUrl(n, scene) {
  const m = byName(n);
  // Atelier : sur la scène demandée (#/s/<scène>, lu par l'atelier à son ouverture ; CC2).
  if (n === 'atelier') return `http://127.0.0.1:${m.port}/atelier/${scene ? `#/s/${encodeURIComponent(scene)}` : ''}`;
  return `http://localhost:${m.port}/${scene ? `#/s/${encodeURIComponent(scene)}` : ''}`;
}

function writeTab(w, title, text) {
  try {
    w.document.open();
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${h(title)}</title>
      <meta name="color-scheme" content="light dark"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:17px/1.47 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f5f5f7;color:#1d1d1f}
      @media (prefers-color-scheme:dark){body{background:#1d1d1f;color:#f5f5f7}}div{max-width:460px;padding:24px;text-align:center}p{color:#7a7a7a;font-size:15px}</style></head>
      <body><div><h1 style="font-size:22px;font-weight:700;margin:0 0 8px">${h(title)}</h1><p>${h(text)}</p></div></body></html>`);
    w.document.close();
  } catch {
    // onglet déjà parti ailleurs
  }
}

/**
 * Onglet de l'atelier réutilisé (correctif CC2, remarque du test 6) : toujours le même onglet, nommé, au lieu d'un nouvel
 * onglet à chaque clic. `window.open('', nom)` rend l'onglet existant sans le recharger, ou ouvre un onglet vide
 * (`about:blank`, lisible car de la même origine ; un onglet de l'atelier, d'une autre origine, ne l'est pas). Limite :
 * seul un onglet ouvert par cette page du studio est retrouvé (un atelier ouvert à la main reste à part).
 */
const ATELIER_TAB = 'glbi-atelier';
function namedTab(name) {
  const w = window.open('', name);
  if (!w) return null;
  let blank = false;
  try {
    blank = w.location.href === 'about:blank';
  } catch {
    // onglet de l'atelier (autre origine) : déjà ouvert
  }
  return { w, blank };
}

async function openTool(n, scene) {
  const m = byName(n);
  const label = n === 'atelier' ? 'Atelier' : 'Lecteur du livre';
  if (m.state === 'prêt' && m.port) {
    if (n !== 'atelier') {
      window.open(toolUrl(n, scene), '_blank');
      return;
    }
    const t = namedTab(ATELIER_TAB);
    if (!t) return toast('Le navigateur a bloqué l’ouverture d’un onglet : autoriser les fenêtres surgissantes pour le studio.', true);
    // Onglet neuf : adresse complète. Onglet de l'atelier déjà ouvert : seule la scène change (#/s/<scène>, sans
    // rechargement, l'atelier suit et demande confirmation si une saisie n'est pas enregistrée) ; sans scène : mis au premier plan.
    if (t.blank || scene) t.w.location.href = toolUrl(n, scene);
    t.w.focus();
    return;
  }
  const why = isRunning(m) ? '' : blockReason(n);
  if (why) return toast(why, true);
  const w = n === 'atelier' ? namedTab(ATELIER_TAB)?.w : window.open('', '_blank');
  if (w) {
    writeTab(w, `${label} : démarrage…`, 'Cette page s’ouvrira toute seule dès que le studio aura démarré le serveur (une minute au plus la première fois).');
    pendingTabs[n] = { w, scene, since: Date.now() };
  } else {
    toast('Le navigateur a bloqué l’ouverture d’un onglet : le lien apparaîtra dans l’étape quand ce sera prêt.', true);
  }
  if (!isRunning(m)) {
    const r = await act('demarrer', { nom: n });
    if (!r.ok && pendingTabs[n]) {
      writeTab(pendingTabs[n].w, `${label} : non démarré`, r.error ?? 'Voir le studio.');
      delete pendingTabs[n];
    }
  }
}

function checkPendingTabs() {
  for (const [n, p] of Object.entries(pendingTabs)) {
    if (p.w.closed) {
      delete pendingTabs[n];
      continue;
    }
    const m = byName(n);
    if (m.state === 'prêt' && m.port) {
      try { p.w.location.href = toolUrl(n, p.scene); } catch { /* onglet fermé */ }
      delete pendingTabs[n];
    } else if ((m.state === 'erreur' || m.state === 'arrêté') && m.startedAt && m.startedAt >= p.since - 2000) {
      writeTab(p.w, 'Démarrage interrompu', `${m.detail ?? m.state} : voir le journal dans le studio (Journaux et processus).`);
      delete pendingTabs[n];
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Sorties partagées en mots simples
// ---------------------------------------------------------------------------------------------------------

/** out/ (livre préparé pour le téléphone) : { short, long, why }. */
function outPlain(v) {
  const n = S.book?.newest;
  if (v.ok) return { short: `prêt ${quand(Date.parse(v.record.date))}`, long: `Livre préparé ${quand(Date.parse(v.record.date))}, à jour.`, why: '' };
  switch (v.problem) {
    case 'perime':
      return {
        short: `à refaire : ${n ? `${base(n.rel)} modifié` : 'livre modifié'}`,
        long: `Le livre a changé depuis la dernière préparation${n ? ` (${n.rel}, ${quand(n.mtime)})` : ''}.`,
        why: `le livre a changé depuis sa préparation${n ? ` (${n.rel})` : ''} : « Préparer le livre » d’abord`,
      };
    case 'test':
      return { short: 'à faire : contient le livre de test', long: 'Le livre préparé est celui du livre de test (suite complète des outils de développement).', why: 'le livre préparé est le livre de test : « Préparer le livre » d’abord' };
    case 'autre':
      return { short: 'à faire : contient un autre livre', long: `Le livre préparé est un autre livre (« ${v.record?.bookId ?? '?'} »).`, why: `le livre préparé est un autre livre (« ${v.record?.bookId ?? '?'} ») : « Préparer le livre » d’abord` };
    case 'inconnu':
      return { short: 'à faire : préparé hors du studio', long: 'Le livre préparé a été construit hors du studio (ou modifié depuis) : le studio ne sait pas ce qu’il contient.', why: 'livre préparé hors du studio : « Préparer le livre » d’abord' };
    default:
      return { short: 'pas encore préparé', long: 'Le livre n’a pas encore été préparé pour le téléphone.', why: 'livre pas encore préparé : « Préparer le livre » d’abord' };
  }
}

/** public/dev-book/ (version lue par le lecteur du PC). */
function devPlain(v) {
  const n = S.book?.newest;
  if (v.ok) return `Le lecteur du PC a la dernière version (${quand(Date.parse(v.record.date))}).`;
  if (v.problem === 'perime') return `Le livre a changé depuis la dernière ouverture du lecteur${n ? ` (${n.rel}, ${quand(n.mtime)})` : ''}.`;
  if (v.problem === 'autre') return `Le lecteur du PC a un autre livre (« ${v.record?.bookId ?? '?'} ») : il sera mis à jour au démarrage.`;
  return 'Le lecteur du PC sera mis à jour tout seul au démarrage.';
}

// ---------------------------------------------------------------------------------------------------------
// book:check : messages rangés par outil et reformulés (les messages d'origine restent consultables)
// ---------------------------------------------------------------------------------------------------------

const TOOLS = {
  blender: { titre: 'Blender', ico: ICON.blender },
  atelier: { titre: 'l’atelier', ico: ICON.atelier },
  studio: { titre: 'le studio ou le dossier du livre', ico: ICON.studio },
};
const Q = '« ([^»]+) »';
const LANG_FR = { fr: 'français', en: 'anglais', es: 'espagnol' };
const rx = (s) => new RegExp(s);
// [motif, outil, correction, phrase] : le premier motif qui correspond l'emporte. `correction` : ce que propose le studio
// (blender : ouvrir le .blend ; atelier : ouvrir l'atelier ; livre : « Modifier le livre » ; dossier : copier le chemin).
// Motifs tirés des textes de scripts/book-check.ts, src/schema/merge.ts et src/schema/glbi.ts (base 5643449 ; événements,
// coupe au noir et clés mal placées ajoutés en AC1 ; position de la caméra pendant une action, DP-19, en AC2 ; carte de
// collection, intitulés de book.json et onglet Carte de l'atelier, en CC2, textes de CC1 à 030d95d ; types de cartes en CC3).
const EXPLAIN = [
  // Dossier du livre, book.json
  [/book\.json absent$/, 'studio', 'livre', 'book.json manque dans le dossier : créer le livre dans le studio (« Changer de livre »).'],
  [/^book\.json : JSON illisible/, 'studio', 'livre', 'book.json est illisible (fichier abîmé ?) : le corriger dans « Modifier le livre ».'],
  [/^book\.json : pas de ogImage/, 'studio', 'livre', 'Le livre n’a pas d’image de partage (l’aperçu montré quand on envoie son adresse) : la choisir dans « Modifier le livre ».'],
  // Carte de collection (CC1, CC2) : intitulés des caractéristiques, section « Carte de collection » du livre
  [rx(`^book\\.json : cardFields : intitulé en double ${Q}`), 'studio', 'livre', (m) => `Deux intitulés de la carte de collection ont l’identifiant « ${m[1]} » : en retirer un dans « Modifier le livre » (section Carte de collection).`],
  [/^book\.json : cardFields : au moins un intitulé/, 'studio', 'livre', 'La liste des intitulés de la carte de collection est vide : ajouter un intitulé, ou la retirer, dans « Modifier le livre ».'],
  [/^book\.json : cardFields : (\d+) intitulés au plus/, 'studio', 'livre', (m) => `La carte de collection a trop d’intitulés (${m[1]} au plus) : en retirer dans « Modifier le livre ».`],
  [/^book\.json : cardFields\.(\d+)\.label\.(fr|en|es) : (\d+) caractères \((\d+) au plus\)/, 'studio', 'livre', (m) => `L’intitulé n° ${Number(m[1]) + 1} de la carte de collection est trop long en ${LANG_FR[m[2]]} (${m[3]} caractères, ${m[4]} au plus) : le raccourcir dans « Modifier le livre ».`],
  [/^book\.json : cardFields\.(\d+)\./, 'studio', 'livre', (m) => `L’intitulé n° ${Number(m[1]) + 1} de la carte de collection est refusé (identifiant ou traduction) : le corriger dans « Modifier le livre ».`],
  // Types de cartes (CC3, DP-20) : section « Types de cartes » du livre ; textes de src/schema/glbi.ts (bookSchema)
  [/^book\.json : cardTypes : cardFields et cardTypes ensemble/, 'studio', 'livre', 'Le livre déclare à la fois une seule liste d’intitulés (cardFields) et des types de cartes (cardTypes) : n’en garder qu’une, dans « Modifier le livre » (section Carte de collection ou Types de cartes ; plusieurs types : cardTypes).'],
  [/^book\.json : cardTypes : au moins 2 types/, 'studio', 'livre', 'Le livre n’a qu’un type de carte dans cardTypes : avec un seul type, il faut une simple liste d’intitulés (cardFields). L’enregistrer à nouveau dans « Modifier le livre », qui écrit la bonne forme.'],
  [rx(`^book\\.json : cardTypes : type en double ${Q}`), 'studio', 'livre', (m) => `Deux types de cartes ont l’identifiant « ${m[1]} » : en retirer un dans « Modifier le livre » (section Types de cartes).`],
  [rx(`^book\\.json : cardTypes\\.(\\d+)\\.fields : intitulé en double ${Q}`), 'studio', 'livre', (m) => `Le type de carte n° ${Number(m[1]) + 1} a deux intitulés d’identifiant « ${m[2]} » : en retirer un dans « Modifier le livre » (section Types de cartes).`],
  [/^book\.json : cardTypes\.(\d+)\.fields : au moins un intitulé/, 'studio', 'livre', (m) => `Le type de carte n° ${Number(m[1]) + 1} n’a pas d’intitulé : en ajouter un, ou retirer le type, dans « Modifier le livre ».`],
  [/^book\.json : cardTypes\.(\d+)\.fields : (\d+) intitulés au plus/, 'studio', 'livre', (m) => `Le type de carte n° ${Number(m[1]) + 1} a trop d’intitulés (${m[2]} au plus) : en retirer dans « Modifier le livre ».`],
  [/^book\.json : cardTypes\.(\d+)\.name\.(fr|en|es) : (\d+) caractères \((\d+) au plus\)/, 'studio', 'livre', (m) => `Le nom du type de carte n° ${Number(m[1]) + 1} est trop long en ${LANG_FR[m[2]]} (${m[3]} caractères, ${m[4]} au plus) : le raccourcir dans « Modifier le livre ».`],
  [/^book\.json : cardTypes\.(\d+)\.fields\.(\d+)\.label\.(fr|en|es) : (\d+) caractères \((\d+) au plus\)/, 'studio', 'livre', (m) => `L’intitulé n° ${Number(m[2]) + 1} du type de carte n° ${Number(m[1]) + 1} est trop long en ${LANG_FR[m[3]]} (${m[4]} caractères, ${m[5]} au plus) : le raccourcir dans « Modifier le livre ».`],
  [/^book\.json : cardTypes\.(\d+)\.(name|id)\b/, 'studio', 'livre', (m) => `Le type de carte n° ${Number(m[1]) + 1} est refusé (${m[2] === 'id' ? 'identifiant' : 'nom, à traduire en français, anglais et espagnol'}) : le corriger dans « Modifier le livre ».`],
  [/^book\.json : cardTypes\.(\d+)\.fields\.(\d+)\./, 'studio', 'livre', (m) => `L’intitulé n° ${Number(m[2]) + 1} du type de carte n° ${Number(m[1]) + 1} est refusé (identifiant ou traduction) : le corriger dans « Modifier le livre ».`],
  [/^book\.json : (.+)$/, 'studio', 'livre', (m) => `Une information du livre est refusée (${m[1]}) : la corriger dans « Modifier le livre ».`],
  [/^icon\.png absent/, 'studio', 'dossier', 'L’icône du livre manque : déposer icon.png (image carrée de 512 px ou plus) dans le dossier du livre.'],
  [/^icon(-maskable)?\.png : .*carré/, 'studio', 'dossier', (m) => `L’icône${m[1] ? ' maskable' : ' du livre'} n’a pas la bonne taille : il faut une image carrée d’au moins 512 × 512 px.`],
  [/^icon(-maskable)?\.png : image illisible/, 'studio', 'dossier', 'L’icône du livre est illisible : la remplacer par un PNG valide.'],
  [rx(`^asset ${Q} introuvable`), 'studio', 'dossier', (m) => `Le fichier « ${m[1]} » manque dans le dossier du livre : l’y copier, ou choisir un autre fichier dans l’atelier.`],
  [/^fichier\(s\) source non référencé\(s\), non copié\(s\) : (.+)$/, 'studio', 'dossier', (m) => `Fichiers du dossier que le livre n’utilise pas (ils ne seront pas publiés) : ${m[1]}.`],
  [/^scenes\/(.+)\.json : ancienne config/, 'studio', 'dossier', (m) => `Un ancien fichier scenes/${m[1]}.json traîne dans le dossier : le supprimer (il n’est plus lu).`],
  // Modèle exporté (Blender, addon GLBGenerator)
  [/scenes\/.+\.glb absent du dossier source$/, 'blender', 'blender', 'Le modèle exporté de la scène manque : ouvrir la scène dans Blender et l’exporter avec l’addon GLBGenerator.'],
  [/\.glb illisible/, 'blender', 'blender', 'Le modèle exporté est illisible : l’exporter à nouveau depuis Blender.'],
  [/pas de nœud GLBI_ROOT/, 'blender', 'blender', 'Le modèle n’a pas été exporté avec l’addon GLBGenerator : l’exporter avec le bouton de l’addon.'],
  [/nœuds GLBI_ROOT dans le GLB/, 'blender', 'blender', 'Le modèle contient plusieurs objets GLBI_ROOT : n’en garder qu’un dans Blender.'],
  [/glbi_config/, 'blender', 'blender', 'Les réglages que l’addon écrit dans le modèle sont illisibles : exporter à nouveau avec l’addon.'],
  [/glbi_version 1 /, 'blender', 'blender', 'Le modèle a été exporté avec une ancienne version de l’addon : l’exporter à nouveau avec l’addon actuel.'],
  [/glbi_version doit être|version vaut .*glbi_version vaut/, 'blender', 'blender', 'La version des réglages de l’addon ne convient pas : exporter à nouveau avec l’addon actuel.'],
  [rx(`scene\\.id vaut ${Q}, attendu ${Q}`), 'blender', 'blender', (m) => `Dans l’addon, la scène s’appelle « ${m[1]} » au lieu de « ${m[2]} » : corriger son identifiant dans le panneau de l’addon, puis exporter.`],
  [/modules\.camera réglé mais pas de cible/, 'blender', 'blender', 'Le cadrage est réglé dans l’atelier, mais le modèle n’a pas de cible de caméra : la choisir dans l’addon, puis exporter.'],
  [rx(`animations\\.idle : clip ${Q} absent du GLB`), 'blender', 'blender', (m) => `L’animation de repos « ${m[1]} » n’est pas dans le modèle exporté.`],
  [rx(`\\(${Q}\\) : clip ${Q} absent du GLB`), 'blender', 'blender', (m) => `Le bouton « ${m[1]} » joue l’animation « ${m[2]} », qui n’est pas dans le modèle exporté.`],
  // Position de la caméra pendant une action (AC2, DP-19) : empty choisi dans l'addon, avant les motifs plus généraux
  [rx(`action ${Q} : cameraPosition ${Q} introuvable`), 'blender', 'blender', (m) => `La position de caméra « ${m[2]} » du bouton « ${m[1]} » n’existe pas dans le modèle exporté : vérifier le nom de l’objet vide dans Blender, ou le choix dans l’addon, puis exporter.`],
  [rx(`action ${Q} : position de caméra ${Q} sans cible de caméra`), 'blender', 'blender', (m) => `Le bouton « ${m[1]} » place la caméra sur « ${m[2]} », mais le modèle n’a pas de cible de caméra (la caméra la regarde) : choisir la cible dans l’addon, puis exporter.`],
  [rx(`action ${Q} : position de caméra ${Q} identique à la cible`), 'blender', 'blender', (m) => `Le bouton « ${m[1]} » place la caméra sur la cible elle-même (« ${m[2]} ») : choisir dans l’addon un autre objet vide pour la position de la caméra, puis exporter.`],
  [rx(`action ${Q} : cameraPosition ${Q} porte un maillage`), 'blender', 'blender', (m) => `La position de caméra « ${m[2]} » du bouton « ${m[1]} » est un objet avec un maillage : choisir un objet vide (empty) dans l’addon.`],
  [rx(`camera\\.target ${Q} introuvable`), 'blender', 'blender', (m) => `La cible de la caméra « ${m[1]} » n’existe pas dans le modèle exporté : vérifier son nom dans Blender.`],
  [rx(`\\.object ${Q} introuvable dans le GLB`), 'blender', 'blender', (m) => `L’objet « ${m[1]} » n’existe pas dans le modèle exporté : vérifier son nom dans Blender.`],
  [rx(`clip ${Q} en double dans le GLB`), 'blender', 'blender', (m) => `Deux animations s’appellent « ${m[1]} » : renommer l’une d’elles dans Blender.`],
  // Actions combinées (AC1) : marqueurs de la timeline (événements) et coupe au noir, écrits par l'addon
  [rx(`action ${Q} : événement ${Q} à ([\\d,]+) s, clip de ([\\d,]+) s`), 'blender', 'blender', (m) => `Le marqueur « ${m[1]}:${m[2]} » est placé à ${m[3]} s, après la fin de l’animation du bouton (${m[4]} s) : le déplacer dans la timeline de Blender, puis exporter.`],
  [rx(`id d'événement en double ${Q}`), 'blender', 'blender', (m) => `Deux marqueurs du même bouton s’appellent « ${m[1]} » : renommer l’un d’eux dans la timeline de Blender, puis exporter.`],
  [/clé « (events|transition|cameraPosition) » non admise : pas de/, 'blender', 'blender', (m) => ({
    events: 'Des marqueurs ont été posés pour l’animation de repos, qui n’en accepte pas : les placer sur l’animation d’un bouton dans Blender, puis exporter.',
    transition: 'L’animation de repos est marquée « coupe au noir » : la coupe ne vaut que pour un bouton ; décocher dans l’addon, puis exporter.',
    cameraPosition: 'L’animation de repos a une position de caméra : elle ne vaut que pour un bouton ; la retirer dans l’addon, puis exporter.',
  })[m[1]]],
  [/\.events\.\d+\.time : instant négatif/, 'blender', 'blender', 'Un marqueur est placé avant le début de l’animation du bouton : le déplacer dans la timeline de Blender, puis exporter.'],
  [rx(`clé ${Q} non admise, elle appartient à scenes/`), 'blender', 'blender', (m) => `Le modèle exporté contient « ${m[1]} », un réglage qui se fait dans l’atelier : exporter à nouveau avec l’addon actuel.`],
  [/n'a qu'un clip « Animation »/, 'blender', 'blender', 'Le modèle n’a qu’une animation « Animation » : à l’export, le mode d’animation doit être « Actions » (l’addon le règle).'],
  [rx(`(\\d+) nœuds nommés ${Q}`), 'blender', 'blender', (m) => `${m[1]} objets s’appellent « ${m[2]} » dans Blender : leur donner des noms différents.`],
  [/porte un maillage \(un empty est attendu/, 'blender', 'blender', 'La cible de la caméra est un objet avec un maillage : choisir un objet vide (empty) dans l’addon.'],
  [rx(`${Q} déclaré armature mais aucun os`), 'blender', 'blender', (m) => `« ${m[1]} » est déclaré comme armature mais n’a pas d’os : vérifier l’objet choisi dans l’addon.`],
  [rx(`${Q} déclaré mesh mais sans maillage`), 'blender', 'blender', (m) => `« ${m[1]} » est déclaré comme maillage mais n’en a pas : vérifier l’objet choisi dans l’addon.`],
  [rx(`le clip ${Q} n'anime ni ${Q}`), 'blender', 'blender', (m) => `L’animation « ${m[1]} » ne fait bouger ni « ${m[2]} » ni ce qu’il contient.`],
  [/clip\(s\) du GLB non déclaré\(s\) : (.+)$/, 'blender', 'blender', (m) => `Animations du modèle qu’aucun bouton n’utilise : ${m[1]}.`],
  [/clip\(s\) dans le GLB mais pas de module animations/, 'blender', 'blender', 'Le modèle a des animations, mais aucun bouton n’est déclaré dans l’addon.'],
  [/aucun crédit de modèle/, 'blender', 'blender', 'Le modèle n’a pas de crédit (auteur, licence) : le renseigner dans Blender (propriétés src_* de l’addon).'],
  [/crédit de modèle incomplet/, 'blender', 'blender', 'Le crédit du modèle est incomplet : auteur et licence attendus (propriétés src_* de l’addon).'],
  // Réglages de la scène (atelier)
  // Carte de collection (CC1, CC2) : onglet Carte de l'atelier ; types de cartes (CC3) : menu Type de l'onglet Carte
  [rx(`modules\\.card\\.type : type ${Q} absent de book\\.json \\(cardTypes : (.*)\\)`), 'atelier', 'atelier', (m) => `La carte de la scène a le type « ${m[1]} », que le livre n’a pas (types du livre : ${m[2]}) : choisir un autre type dans l’atelier (onglet Carte, menu Type), ou ajouter ce type dans « Modifier le livre ».`],
  [rx(`modules\\.card\\.type : type ${Q} absent de book\\.json \\(book\\.json n'a qu'un type`), 'atelier', 'atelier', (m) => `La carte de la scène a le type « ${m[1]} », mais le livre n’a qu’un type de carte (personnage) : retirer ce type dans l’atelier (onglet Carte, « Retirer ce type »), ou déclarer des types de cartes dans « Modifier le livre ».`],
  [rx(`modules\\.card\\.fields : intitulé ${Q} absent du type ${Q} \\(intitulés : (.*)\\)`), 'atelier', 'atelier', (m) => `La carte de la scène donne une valeur à « ${m[1]} », un intitulé que son type « ${m[2]} » n’a pas (intitulés du type : ${m[3]}) : retirer cette valeur dans l’atelier (onglet Carte), changer le type de la carte, ou ajouter l’intitulé au type dans « Modifier le livre ».`],
  [/modules\.card\.type : /, 'atelier', 'atelier', 'Le type de la carte est refusé (identifiant : lettres, chiffres, _ et -) : choisir un type dans l’atelier (onglet Carte, menu Type).'],
  [rx(`modules\\.card\\.fields : intitulé ${Q} absent de book\\.json \\(cardFields : (.*)\\)`), 'atelier', 'atelier', (m) => `La carte de la scène donne une valeur à « ${m[1]} », un intitulé que le livre n’a pas (intitulés du livre : ${m[2]}) : retirer cette valeur dans l’atelier (onglet Carte), ou ajouter l’intitulé dans « Modifier le livre ».`],
  [rx(`carte : caractéristique ${Q} sans valeur`), 'atelier', 'atelier', (m) => `La carte de la scène n’a pas de valeur pour « ${m[1]} » (la carte affichera « — ») : la saisir dans l’atelier (onglet Carte).`],
  [/carte sans paragraphe \(modules\.card\.text\)/, 'atelier', 'atelier', 'La carte de la scène n’a pas de paragraphe : sans lui, la scène n’a pas de carte. L’écrire dans l’atelier (onglet Carte), en français, anglais et espagnol.'],
  [/modules\.card\.(subtitle|text|fields\.([^.\s]+))\.(fr|en|es) : (\d+) caractères \((\d+) au plus\)/, 'atelier', 'atelier', (m) => `Un texte de la carte est trop long (${m[1] === 'subtitle' ? 'sous-titre' : m[1] === 'text' ? 'paragraphe' : `valeur « ${m[2]} »`}, en ${LANG_FR[m[3]]} : ${m[4]} caractères, ${m[5]} au plus) : le raccourcir dans l’atelier (onglet Carte).`],
  [/modules\.card\.image : /, 'atelier', 'atelier', 'L’illustration de la carte est refusée (nom ou format du fichier) : en choisir une autre dans l’atelier (onglet Carte).'],
  [/edit\.json absent ; ouvrir la scène dans l'atelier/, 'atelier', 'atelier', 'Les réglages de la scène n’existent pas encore : ouvrir la scène dans l’atelier et les enregistrer.'],
  [rx(`action ${Q} absente du GLB \\(actions du GLB : (.*)\\)`), 'atelier', 'atelier', (m) => `La scène exportée et ses réglages ne correspondent plus : les réglages parlent d’une action « ${m[1]} » que le modèle n’a pas${m[2] ? ` (il a : ${m[2]})` : ''}. La retirer dans l’atelier, ou la remettre dans Blender.`],
  [/actions éditées mais le GLB n'a pas de module animations/, 'atelier', 'atelier', 'La scène exportée et ses réglages ne correspondent plus : les réglages ont des boutons, le modèle exporté n’a pas d’animation.'],
  [/nom de la scène \(scene\.name\) absent/, 'atelier', 'atelier', 'La scène n’a pas encore de nom : le donner dans l’atelier (en français, anglais et espagnol).'],
  [rx(`action ${Q} sans libellé`), 'atelier', 'atelier', (m) => `Le bouton « ${m[1]} » n’a pas de texte : l’écrire dans l’atelier (en français, anglais et espagnol).`],
  [rx(`événement ${Q} de l'action ${Q} sans son`), 'atelier', 'atelier', (m) => `Le marqueur « ${m[1]} » du bouton « ${m[2]} » n’a pas de son : rien ne sera joué à cet instant tant qu’il n’est pas choisi dans l’atelier.`],
  [rx(`action ${Q} : événement ${Q} absent du GLB \\(événements du GLB : (.*)\\)`), 'atelier', 'atelier', (m) => `La scène exportée et ses réglages ne correspondent plus : les réglages donnent un son au marqueur « ${m[2]} » du bouton « ${m[1]} », que le modèle n’a pas (il a : ${m[3]}). Le retirer dans l’atelier, ou remettre le marqueur dans Blender.`],
  [rx(`clé ${Q} non admise, elle appartient au GLB`), 'atelier', 'atelier', (m) => `Les réglages de la scène contiennent « ${m[1]} », qui se règle dans Blender (addon) : le retirer du fichier des réglages de la scène.`],
  [/cadrage non réglé/, 'atelier', 'atelier', 'Le cadrage n’est pas réglé : le lecteur prendra un cadrage par défaut (onglet Caméra de l’atelier).'],
  [rx(`son ${Q} sans entrée dans modules\\.credits\\.assets`), 'atelier', 'atelier', (m) => `Le son « ${m[1]} » n’a pas de crédit : l’ajouter dans l’atelier.`],
  [rx(`crédit pour ${Q}, asset non utilisé`), 'atelier', 'atelier', (m) => `Un crédit concerne « ${m[1]} », que la scène n’utilise pas : le retirer dans l’atelier.`],
];

/** Une ligne du rapport → { tool, fix, say }. Repli par origine du message (glb, edit, fusion, build) quand aucun motif ne correspond. */
function explain(l) {
  for (const [re, tool, fix, say] of EXPLAIN) {
    const m = l.message.match(re);
    if (m) return { tool, fix, say: typeof say === 'function' ? say(m) : say };
  }
  if (l.origin === 'glb') return { tool: 'blender', fix: 'blender', say: 'Le modèle exporté contient un réglage refusé : vérifier la scène dans l’addon, puis l’exporter à nouveau.' };
  if (l.origin === 'edit') return { tool: 'atelier', fix: 'atelier', say: 'Un réglage de la scène est refusé : ouvrir la scène dans l’atelier (onglet Rapport).' };
  if (l.origin === 'fusion') return { tool: 'atelier', fix: 'atelier', say: 'La scène exportée et ses réglages ne correspondent plus : ouvrir la scène dans l’atelier (onglet Rapport).' };
  if (l.scene) return { tool: 'atelier', fix: 'atelier', say: 'Point signalé par la vérification, sans explication simple pour l’instant : voir le message d’origine (l’onglet Rapport de l’atelier le montre aussi).' };
  return { tool: 'studio', fix: 'livre', say: 'Point signalé par la vérification, sans explication simple pour l’instant : voir le message d’origine.' };
}

/** Lignes du dernier book:check rangées par outil, erreurs d'abord. */
function checkGroups(c) {
  const g = { blender: [], atelier: [], studio: [] };
  for (const l of c.lines ?? []) g[(l.ex = explain(l)).tool].push(l);
  for (const k of Object.keys(g)) g[k].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  return g;
}

// ---------------------------------------------------------------------------------------------------------
// Parcours : six étapes calculées à partir de l'état reçu
// ---------------------------------------------------------------------------------------------------------

const STEP_TITLES = ['Livre', 'Scènes', 'Vérifier', 'Essayer sur le PC', 'Préparer le livre pour le téléphone', 'Essayer sur téléphone'];
const waitBook = () => ({ state: 'wait', status: 'après l’étape 1', next: null });
const bookUsable = () => !!S.book && S.book.file.valid && !S.book.errors.length;

function stepLivre() {
  const b = S.book;
  if (!b) {
    return {
      state: 'todo', status: 'aucun livre ouvert',
      next: { title: 'Ouvrir ou créer un livre', text: 'Choisir le dossier du livre (il contient book.json). Un dossier sans book.json propose « Créer un livre ici ».',
        btn: { label: 'Ouvrir un livre…', act: 'parcourir', data: { quoi: 'livre' } } },
    };
  }
  if (!b.file.stamp) {
    return { state: 'error', status: 'book.json absent du dossier',
      next: { title: 'Créer book.json', text: 'Le dossier ouvert n’a plus de book.json : le créer ici.', btn: { label: 'Créer un livre ici…', act: 'creerIci' } } };
  }
  if (!bookUsable()) {
    return { state: 'error', status: 'book.json à corriger',
      next: { title: 'Corriger les informations du livre', text: `book.json est refusé : ${h(b.errors[0] ?? 'voir « Modifier le livre »')}${b.errors.length > 1 ? ` (et ${b.errors.length - 1} autre(s))` : ''}.`,
        btn: { label: 'Modifier le livre…', act: 'feuille', data: { f: 'livre' } } } };
  }
  if (formDirty()) {
    return { state: 'again', status: 'modifications non enregistrées',
      next: { title: 'Enregistrer les informations du livre', text: 'Le formulaire du livre a des modifications qui ne sont pas encore dans book.json.', btn: { label: 'Modifier le livre…', act: 'feuille', data: { f: 'livre' } } } };
  }
  if (!b.icon) {
    return { state: 'todo', status: 'icône à ajouter',
      next: { title: 'Ajouter l’icône du livre', text: `Déposer une image carrée nommée <strong>icon.png</strong> (512 × 512 px au moins) dans le dossier du livre ; l’étape se coche toute seule.<br><span class="mono">${h(b.dir)}</span>`,
        btn: { label: 'Ouvrir le dossier du livre', act: 'ouvrirDossier' } } };
  }
  return { state: 'done', status: 'book.json valide, icône présente', next: null };
}

/** Prochaine action d'une scène incomplète (modèle exporté, puis réglages). */
function sceneNext(s) {
  const bl = S.blender;
  if (!s.glb.present) {
    if (!s.blend.present) {
      if (bl.gabarit && bl.gabaritOk) return { title: `Créer la scène ${s.id} dans Blender`, text: `Le studio copie le gabarit de scène en blender/${h(s.id)}.blend, puis on l’ouvre dans Blender.`, btn: { label: 'Créer depuis le gabarit', act: 'creerDepuisGabarit', data: { scene: s.id } } };
      return { title: `Créer la scène ${s.id} dans Blender`, text: `Choisir le gabarit de scène (.blend préparé), que le studio copiera en blender/${h(s.id)}.blend ; ou enregistrer la scène depuis Blender sous ce nom, dans le dossier blender du livre.`,
        btn: { label: 'Choisir le gabarit…', act: 'parcourir', data: { quoi: 'gabarit', cible: 'gabarit-direct' } } };
    }
    if (!bl.exe || !bl.exeOk) {
      return { title: 'Indiquer où est Blender', text: 'Le studio cherche blender.exe dans C:\\Program Files\\Blender Foundation ; sinon, le choisir.',
        btn: bl.exe ? { label: 'Choisir blender.exe…', act: 'parcourir', data: { quoi: 'blender', cible: 'blender-direct' } } : { label: 'Détecter Blender', act: 'detecterBlender' } };
    }
    return { title: `Modéliser la scène ${s.id} dans Blender`, text: 'Dans Blender, finir la scène puis l’exporter avec l’addon GLBGenerator : le modèle arrive tout seul dans le livre et l’étape avance.',
      btn: { label: `Ouvrir ${s.id} dans Blender`, act: 'ouvrirBlender', data: { scene: s.id } } };
  }
  return { title: `Régler la scène ${s.id} dans l’atelier`, text: 'Dans l’atelier : nom de la scène, textes des boutons, sons, cadrage. Ses réglages sont enregistrés dans le livre.',
    btn: { label: `Ouvrir ${s.id} dans l’atelier`, act: 'ouvrirOutil', data: { nom: 'atelier', scene: s.id } } };
}

function stepScenes() {
  if (!bookUsable()) return waitBook();
  const sc = S.book.scenes;
  const done = sc.filter((s) => s.glb.present && s.edit.present);
  if (done.length === sc.length) return { state: 'done', status: `${plural(sc.length, 'scène', 'scènes')} : modèle et réglages présents`, next: null };
  const first = sc.find((s) => !(s.glb.present && s.edit.present));
  return { state: 'todo', status: `${done.length} sur ${plural(sc.length, 'scène terminée', 'scènes terminées')}`, next: sceneNext(first) };
}

/** Correction proposée pour la première erreur du premier outil concerné (Blender, puis l'atelier, puis le studio). */
function fixNext(groups) {
  for (const tool of ['blender', 'atelier', 'studio']) {
    const errs = groups[tool].filter((l) => l.level === 'error');
    if (!errs.length) continue;
    const l = errs[0];
    const more = errs.length > 1 ? ` (${plural(errs.length, 'erreur', 'erreurs')} à corriger dans ${TOOLS[tool].titre})` : '';
    const text = `${h(l.ex.say)}${more}`;
    if (tool === 'blender') {
      const s = S.book.scenes.find((x) => x.id === l.scene);
      const bl = S.blender;
      const can = s?.blend.present && bl.exe && bl.exeOk;
      return { title: l.scene ? `Corriger la scène ${l.scene} dans Blender` : 'Corriger dans Blender', text: `${text} Exporter ensuite avec l’addon, puis vérifier à nouveau.`,
        btn: can ? { label: `Ouvrir ${l.scene} dans Blender`, act: 'ouvrirBlender', data: { scene: l.scene } } : null };
    }
    if (tool === 'atelier') {
      return { title: l.scene ? `Corriger la scène ${l.scene} dans l’atelier` : 'Corriger dans l’atelier', text: `${text} Enregistrer, puis vérifier à nouveau.`,
        btn: { label: l.scene ? `Ouvrir ${l.scene} dans l’atelier` : 'Ouvrir l’atelier', act: 'ouvrirOutil', data: l.scene ? { nom: 'atelier', scene: l.scene } : { nom: 'atelier' } } };
    }
    if (l.ex.fix === 'livre') return { title: 'Corriger les informations du livre', text, btn: { label: 'Modifier le livre…', act: 'feuille', data: { f: 'livre' } } };
    return { title: 'Compléter le dossier du livre', text: `${text}<br><span class="mono">${h(S.book.dir)}</span>`, btn: { label: 'Ouvrir le dossier du livre', act: 'ouvrirDossier' } };
  }
  return null;
}

function stepVerifier() {
  if (!bookUsable()) return waitBook();
  const b = S.book;
  const c = b.check;
  const m = byName('book-check');
  const verify = (label) => start(label, 'book-check');
  if (isRunning(m)) return { state: 'running', status: 'vérification en cours…', next: { title: 'Vérification du livre', text: 'Le studio contrôle les modèles exportés, les réglages des scènes et les fichiers du livre.', run: m } };
  if (!c) {
    return { state: 'todo', status: 'pas encore vérifié',
      next: { title: 'Vérifier le livre', text: 'Le studio contrôle tout le livre : modèles exportés, réglages des scènes, fichiers. Quelques secondes.', btn: verify('Vérifier le livre') } };
  }
  if (c.error) return { state: 'error', status: 'vérification interrompue', next: { title: 'Vérifier à nouveau', text: 'La dernière vérification s’est arrêtée sans résultat (voir son journal).', btn: verify('Vérifier à nouveau') } };
  const n = b.newest;
  if (n && n.mtime > c.date) {
    return { state: 'again', status: `à refaire : ${base(n.rel)} modifié`,
      next: { title: 'Vérifier à nouveau', text: `${h(n.rel)} a changé ${quand(n.mtime)}, après la dernière vérification.`, btn: verify('Vérifier à nouveau') } };
  }
  if (c.errors) return { state: 'error', status: `${plural(c.errors, 'erreur', 'erreurs')} à corriger`, next: fixNext(checkGroups(c)) };
  return { state: 'done', status: c.warnings ? `livre valide · ${plural(c.warnings, 'point', 'points')} à regarder` : 'livre valide', next: null };
}

function stepPC() {
  if (!bookUsable()) return waitBook();
  const dev = byName('dev');
  const dvb = S.outputs.devBook;
  const upd = byName('dev-book');
  if (dev.state === 'démarrage' || isRunning(upd)) {
    return { state: 'running', status: isRunning(upd) ? 'mise à jour du lecteur…' : 'démarrage du lecteur…',
      next: { title: isRunning(upd) ? 'Mise à jour du lecteur du PC' : 'Démarrage du lecteur du PC', text: pendingTabs.dev ? 'Le livre s’ouvrira tout seul dans l’onglet préparé.' : 'Le lien du livre apparaîtra dans cette étape.', run: isRunning(upd) ? upd : dev } };
  }
  if (dev.state === 'prêt' && !dvb.ok) {
    return { state: 'again', status: 'lecteur à mettre à jour',
      next: { title: 'Mettre à jour le lecteur du PC', text: `${h(devPlain(dvb))} Ensuite, recharger l’onglet du lecteur.`, btn: start('Mettre à jour le lecteur', 'dev-book') } };
  }
  if (dvb.ok) return { state: 'done', status: dev.state === 'prêt' ? 'lecteur en marche, à jour' : 'dernière version essayée', next: null };
  const tryIt = { title: 'Essayer le livre sur ce PC', text: 'Le livre s’ouvre dans un onglet du navigateur, comme sur un téléphone, sans rien préparer. La première fois, compter une minute.',
    btn: { label: 'Essayer sur ce PC', act: 'ouvrirOutil', data: { nom: 'dev' }, why: blockReason('dev') } };
  if (dev.state === 'erreur') return { state: 'error', status: 'le lecteur n’a pas démarré', next: { ...tryIt, text: `${h(dev.detail ?? 'Voir le journal du lecteur.')} Essayer à nouveau :` } };
  return { state: dvb.problem === 'perime' ? 'again' : 'todo', status: dvb.problem === 'perime' ? 'à refaire : livre modifié' : 'à faire', next: tryIt };
}

function stepPreparer() {
  if (!bookUsable()) return waitBook();
  const build = byName('build');
  const out = S.outputs.out;
  const o = outPlain(out);
  if (isRunning(build)) return { state: 'running', status: 'préparation en cours…', next: { title: 'Préparation du livre pour le téléphone', text: 'Le studio fabrique le livre complet, celui qui s’installe sur un téléphone.', run: build } };
  if (out.ok) return { state: 'done', status: o.short, next: null };
  const go = (title, text) => ({ title, text, btn: start('Préparer le livre', 'build') });
  if (build.state === 'erreur') return { state: 'error', status: 'la dernière préparation a échoué', next: go('Préparer le livre à nouveau', 'La dernière préparation a échoué : son journal dit pourquoi (la vérification, étape 3, l’explique souvent).') };
  return { state: out.problem === 'perime' ? 'again' : 'todo', status: o.short,
    next: go('Préparer le livre pour le téléphone', `${h(o.long)} Le studio fabrique le livre complet, celui qui s’installe sur un téléphone : une à quelques minutes, à refaire après chaque modification.`) };
}

function stepTelephone() {
  if (!bookUsable()) return waitBook();
  const out = S.outputs.out;
  const srv = byName('serveur-test');
  const pub = byName('publier');
  const cf = byName('cloudflare');
  const E3 = S.essai;
  if (isRunning(pub)) return { state: 'running', status: 'publication en cours…', next: { title: 'Publication de l’essai', text: `Envoi du livre préparé sur ${h(E3.adresse)}.`, run: pub } };
  if (isRunning(cf)) return { state: 'running', status: 'connexion à Cloudflare…', next: { title: 'Connexion à Cloudflare', text: 'Accepter la connexion dans l’onglet que Cloudflare a ouvert.', run: cf } };
  if (srv.state === 'démarrage') return { state: 'running', status: 'démarrage du serveur de test…', next: { title: 'Démarrage du serveur de test', text: 'Le QR à filmer apparaît dès que le serveur répond.', run: srv } };
  if (!out.ok) return { state: 'wait', status: 'après la préparation (étape 5)', next: null };
  const on = [srv.state === 'prêt' && 'Android : serveur en marche', E3.outPublie && 'iPhone : essai publié'].filter(Boolean);
  if (on.length) return { state: 'done', status: on.join(' · '), next: null };
  if (E3.publication) {
    if (E3.cloudflare?.connecte === false) {
      return { state: 'again', status: 'essai à republier',
        next: { title: 'Se connecter à Cloudflare', text: 'wrangler n’est pas connecté : la connexion ouvre une page de Cloudflare à accepter, une fois.', btn: start('Se connecter à Cloudflare', 'cloudflare') } };
    }
    return { state: 'again', status: 'essai à republier',
      next: { title: 'Publier un essai', text: `Le livre préparé a changé depuis le dernier essai. Le publier sur ${h(E3.adresse)} : ses QR d’essai s’ouvrent sur iPhone comme sur Android.`, btn: start('Publier un essai', 'publier') } };
  }
  return { state: 'todo', status: 'à faire',
    next: { title: 'Essayer sur un téléphone Android', text: 'Le PC sert le livre sur le Wi-Fi ; un QR à filmer apparaît dans cette étape. Pour un iPhone : « Publier un essai », dans la même étape.', btn: start('Démarrer le serveur de test', 'serveur-test') } };
}

function parcours() {
  const steps = [stepLivre(), stepScenes(), stepVerifier(), stepPC(), stepPreparer(), stepTelephone()];
  steps.forEach((s, i) => (s.title = STEP_TITLES[i]));
  const nextIndex = steps.findIndex((s) => s.state !== 'done' && s.next);
  return { steps, nextIndex, next: nextIndex >= 0 ? steps[nextIndex].next : null };
}

// ---------------------------------------------------------------------------------------------------------
// Rendu : barre du haut, alertes, parcours, prochaine action, détail de l'étape
// ---------------------------------------------------------------------------------------------------------

function renderTop() {
  const b = S.book;
  setHtml('top-book', b
    ? `<strong>${h(b.title ?? '(sans titre)')}</strong><span class="path" title="${h(b.dir)}">${h(b.dir)}</span>`
    : '<span class="path">aucun livre ouvert</span>');
  $('studio-pid').textContent = `Studio : PID ${S.studio.pid} · port ${S.studio.port} · repo ${S.studio.root}`;
  $('studio-port').textContent = S.studio.port;
}

function renderAlertes() {
  const out = [];
  if (S.studio.caseWarning) out.push(`<div class="alerte-bar"><span class="lvl"></span><span class="txt">${h(S.studio.caseWarning)}</span></div>`);
  if (S.restes.length) {
    out.push(`<div class="alerte-bar err"><span class="lvl"></span><span class="txt"><strong>Processus d’un studio arrêté brutalement</strong> encore en marche (${S.restes.length}).</span>
      ${button({ label: 'Arrêter les restes', act: 'arreterRestes' }, 'sm danger')}${button({ label: 'Les laisser tourner', act: 'laisserRestes' }, 'sm ghost')}
      <details data-k="restes"><summary>Détails</summary>${S.restes.map((r) => `<p class="mono">PID ${r.pid} — ${h(r.nom)} — ${r.nombre} processus — ${h(r.commande)}</p>`).join('')}</details></div>`);
  }
  for (const i of S.portIssues) {
    const owners = i.owners.length
      ? i.owners.map((o) => `<p class="mono">PID ${o.pid} — ${h(o.command)} ${o.ours ? button({ label: 'Arrêter ce processus', act: 'arreterPid', data: { pid: o.pid } }, 'sm danger') : '<span class="muted">(pas un processus du repo : à arrêter à la main)</span>'}</p>`).join('')
      : '<p class="muted">processus occupant inconnu</p>';
    out.push(`<div class="alerte-bar"><span class="lvl"></span><span class="txt">Port <strong>${i.port}</strong> (${h(i.usage)}) déjà occupé${i.reason ? ` : ${h(i.reason)}` : ''}.</span>
      <details data-k="port-${i.port}"><summary>Qui l’occupe ?</summary>${owners}</details></div>`);
  }
  if (S.relance?.length) {
    const labels = S.relance.map((n) => byName(n)?.label ?? n).join(', ');
    out.push(`<div class="alerte-bar info"><span class="lvl"></span><span class="txt">Changement de livre : ${h(labels)} arrêté(s).</span>
      ${button({ label: 'Relancer sur ce livre', act: 'relancer' }, 'sm')}${button({ label: 'Non merci', act: 'oublierRelance' }, 'sm ghost')}</div>`);
  }
  if (!S.studio.httpServer) out.push('<div class="alerte-bar"><span class="lvl"></span><span class="txt">http-server absent de node_modules (serveur de test) : lancer <code>npm i -D -E http-server@14.1.1</code>.</span></div>');
  setHtml('alertes', out.join(''));
}

function renderSteps(P, shown) {
  setHtml('etapes', P.steps.map((s, i) => `<li><button type="button" class="step s-${s.state}${i === P.nextIndex ? ' is-next' : ''}" data-act="etape" data-n="${i}" aria-current="${i === shown}">
      <span class="mark">${s.state === 'done' ? ICON.check : `<span>${i + 1}</span>`}</span>
      <span><span class="t">${h(s.title)}</span><span class="st">${h(s.status)}</span></span></button></li>`).join(''));
}

function renderNext(P, shown) {
  const n = P.next;
  const ex = S.exclusive ? byName(S.exclusive) : null;
  if (!n) {
    return setHtml('prochaine', `<div class="eyebrow">Prochaine action</div><h1>Tout est à jour</h1>
      <p>Modifier une scène dans Blender ou dans l’atelier : le parcours montrera les étapes à refaire.</p>`);
  }
  const step = P.nextIndex;
  const see = shown !== step ? ` · <button type="button" class="link" data-act="etape" data-n="${step}">voir l’étape</button>` : '';
  let actions = '';
  let why = '';
  if (n.run) {
    actions = `<div class="running"><span class="spinner" aria-hidden="true"></span>${h(n.run.label)} · ${timeOf(n.run)}</div>
      <div class="row">${button({ label: 'Voir le journal', act: 'journal', data: { nom: n.run.name } }, 'sm ghost')}${button(stop(n.run.name), 'sm')}</div>`;
  } else if (n.btn) {
    actions = button(n.btn, 'primary lg');
    if (n.btn.why) why = `<p class="why">Pas maintenant : ${h(n.btn.why)}.</p>`;
  }
  const also = ex && ex.name !== n.run?.name ? `<p class="also">En cours aussi : ${h(ex.label)} · ${timeOf(ex)}</p>` : '';
  setHtml('prochaine', `<div class="eyebrow">Prochaine action · étape ${step + 1}${see}</div>
    <h1>${h(n.title)}</h1><p>${n.text}</p>${why}${also}<div class="actions">${actions}</div>`);
}

function renderDetail(P, i) {
  const d = [detailLivre, detailScenes, detailVerifier, detailPC, detailPreparer, detailTelephone][i](P.steps[i]);
  setHtml('detail', `<div class="detail-head"><div class="grow"><h2>${i + 1} · ${h(d.title)}</h2>${d.sub ? `<p class="sub">${d.sub}</p>` : ''}</div>${d.actions ?? ''}</div>
    <div class="detail-body">${d.body}</div>`);
}

function renderCoulisses() {
  const live = ['atelier', 'dev', 'serveur-test'].map(byName).filter(isRunning);
  const failed = ['atelier', 'dev', 'serveur-test'].map(byName).some((m) => m.state === 'erreur');
  $('dot-proc').className = `dot${failed ? ' err' : live.length ? ' run' : ''}`;
  $('meta-proc').textContent = live.length ? `${live.length} en marche` : '';
  $('meta-proc').title = live.map((m) => m.label).join(', ');
  $('dot-reglages').className = `dot${!S.blender.exe || !S.blender.exeOk ? ' warn' : ''}`;
  const dev = ['test-engine', 'test-schema', 'suite'].map(byName);
  $('dot-outils').className = `dot${dev.some(isRunning) ? ' run' : dev.some((m) => m.state === 'erreur') ? ' err' : ''}`;
}

function render() {
  if (!S) return;
  syncForm();
  const P = parcours();
  if (chosen !== null && chosen === P.nextIndex) chosen = null;
  const shown = chosen ?? (P.nextIndex >= 0 ? P.nextIndex : 5);
  renderTop();
  renderAlertes();
  renderSteps(P, shown);
  renderNext(P, shown);
  renderDetail(P, shown);
  renderCoulisses();
  renderProcs();
  renderOutputs();
  renderTasks();
  renderTabs();
  renderPorts();
  renderBlender();
  renderEssaiReglages();
  checkPendingTabs();
}

// ---------------------------------------------------------------------------------------------------------
// Détail des étapes
// ---------------------------------------------------------------------------------------------------------

function openPanel() {
  const recents = S.recents.filter((r) => !S.book || r !== S.book.dir);
  return `<div class="block">
    <h3 class="section-title">${S.book ? 'Ouvrir un autre livre' : 'Ouvrir un livre'}</h3>
    <form id="ouvrir" class="field-row" autocomplete="off">
      <label class="grow"><span class="sr">Dossier du livre</span><input data-keep="chemin" id="chemin" type="text" spellcheck="false" placeholder="Dossier du livre (il contient book.json), ex. D:\\Livres\\dino ou books/test-dino"></label>
      <button type="submit" class="btn">Ouvrir</button>
      ${button({ label: 'Parcourir…', act: 'parcourir', data: { quoi: 'livre' } })}
      ${button({ label: 'Créer un livre…', act: 'feuille', data: { f: 'creer' } }, 'ghost')}
    </form>
    ${recents.length ? `<p class="hint">Livres récents</p><ul class="recents">${recents.map((r) => `<li><span class="path" title="${h(r)}">${h(r)}</span>
      ${button({ label: 'Ouvrir', act: 'ouvrir', data: { chemin: r } }, 'sm')}${button({ label: '×', act: 'oublierRecent', data: { chemin: r } }, 'sm ghost icon')}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function detailLivre() {
  const b = S.book;
  if (!b) return { title: 'Livre', sub: 'Aucun livre ouvert.', body: openPanel() };
  const f = b.file.content.form;
  const t = f.title ?? {};
  const legal = f.legal ?? {};
  const facts = [
    ['Titre', `${h(t.fr || '—')}<br><span class="muted">${h(t.en || '—')} · ${h(t.es || '—')}</span>`],
    ['Identifiant (bookId)', `<span class="mono">${h(f.bookId || '—')}</span> <span class="muted">· ne change plus</span>`],
    ['Adresse imprimée', `<span class="mono">${h(f.origin || '—')}</span>`],
    ['Scènes', `${plural(b.scenes.length, 'scène', 'scènes')}, dans l’ordre de déblocage : ${h(b.scenes.map((s) => s.id).join(', ') || '—')}`],
    ['Icône', b.icon ? '<span class="t-ok">icon.png présent</span>' : '<span class="t-warn">icon.png absent (image carrée de 512 px ou plus, à déposer dans le dossier)</span>'],
    ['Image de partage', f.ogImage ? `<span class="mono">${h(f.ogImage)}</span>` : '<span class="muted">aucune</span>'],
    ['Mention légale', h(legal.text?.fr ? `${legal.text.fr} (${legal.year ?? '?'})` : '—')],
    ['Carte de collection', cardFacts(f.cardTypes ?? [])],
    ['Dossier', `<span class="mono">${h(b.dir)}</span>${b.typed ? `<br><span class="muted">saisi « ${h(b.typed)} », ramené à la casse réelle</span>` : ''}`],
  ];
  const errs = b.errors.length ? `<div class="notice err"><strong>book.json refusé</strong><ul class="errors">${b.errors.map((e) => `<li>${h(e)}</li>`).join('')}</ul></div>` : '';
  return {
    title: 'Livre',
    sub: bookUsable() ? 'Informations de book.json, écrites par le studio.' : 'book.json à corriger.',
    actions: `${button({ label: 'Ouvrir le dossier', act: 'ouvrirDossier' }, 'ghost')}${button({ label: 'Copier le chemin', act: 'copier', data: { texte: b.dir } }, 'ghost')}${button({ label: 'Modifier le livre…', act: 'feuille', data: { f: 'livre' } })}`,
    body: `${errs}<dl class="facts two">${facts.map(([k, v], i) => (i === facts.length - 1 ? `<dt class="first">${k}</dt><dd class="full">${v}</dd>` : `<dt>${k}</dt><dd>${v}</dd>`)).join('')}</dl>
      <p class="hint">Plus tard ici : mini-jeu, annonces (sections de book.json des lots suivants).</p>${openPanel()}`,
  };
}

function box(c, label) {
  return c.present
    ? `<span class="box"><span class="tick">${ICON.check}</span>${h(label)}${c.mtime ? ` <span class="d">${frDate(c.mtime).slice(0, 11)}</span>` : ''}</span>`
    : `<span class="box no"><span class="tick"></span>à faire</span>`;
}

function detailScenes() {
  if (!bookUsable()) return { title: 'Scènes', sub: 'Après l’étape 1.', body: '<p class="empty">Ouvrir un livre valide d’abord.</p>' };
  const b = S.book;
  const bl = S.blender;
  const rows = b.scenes.map((s) => {
    const openWhy = !s.blend.present ? `blender/${s.id}.blend absent` : !bl.exe ? 'chemin de blender.exe non réglé (Réglages)' : !bl.exeOk ? 'blender.exe introuvable (Réglages)' : '';
    const blend = s.blend.present
      ? button({ label: 'Ouvrir dans Blender', act: 'ouvrirBlender', data: { scene: s.id }, why: openWhy }, 'sm')
      : button({ label: 'Créer depuis le gabarit', act: 'creerDepuisGabarit', data: { scene: s.id }, why: !bl.gabarit ? 'aucun gabarit réglé (Réglages) : rien n’est créé' : !bl.gabaritOk ? 'gabarit introuvable (Réglages)' : '' }, 'sm');
    const atelier = s.glb.present ? button({ label: 'Régler dans l’atelier', act: 'ouvrirOutil', data: { nom: 'atelier', scene: s.id } }, 'sm ghost') : '';
    const chk = s.check ? (s.check.errors ? `<span class="t-err">${plural(s.check.errors, 'erreur', 'erreurs')}</span>` : s.check.warnings ? `<span class="t-warn">${plural(s.check.warnings, 'point', 'points')}</span>` : '<span class="t-ok">rien à signaler</span>') : '<span class="muted">—</span>';
    return `<tr><td class="id">${h(s.id)}</td><td>${box(s.blend, 'Blender')}</td><td>${box(s.glb, 'exporté')}</td><td>${box(s.edit, 'réglée')}</td><td class="small nowrap">${chk}</td>
      <td><div class="acts">${blend}${atelier}</div></td></tr>`;
  });
  const tpl = bl.gabarit && bl.gabaritOk ? 'le gabarit de scène est copié en blender/<scène>.blend' : 'aucun gabarit réglé : pas de .blend créé';
  return {
    title: 'Scènes',
    sub: 'La scène dans Blender, le modèle exporté par l’addon, puis ses réglages faits dans l’atelier.',
    actions: `<form class="add-scene" id="ajout-scene" autocomplete="off"><label><span class="sr">Nouvelle scène</span><input data-keep="nouvelle-scene" type="text" spellcheck="false" placeholder="nouvelle scène, ex. trex" title="${h(`ajoutée en fin de liste et enregistrée dans book.json ; ${tpl}`)}"></label>
      <button type="submit" class="btn">Ajouter</button></form>${button({ label: 'Ordre, retrait…', act: 'feuille', data: { f: 'livre' } }, 'ghost')}`,
    body: `<table class="table"><thead><tr><th>Scène</th><th title="blender/&lt;scène&gt;.blend">Scène Blender</th><th title="scenes/&lt;scène&gt;.glb">Modèle exporté</th><th title="scenes/&lt;scène&gt;.edit.json">Réglages</th><th>Vérification</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>
      <p class="hint">L’ordre des scènes est l’ordre de déblocage dans le livre. Un modèle s’exporte depuis Blender avec l’addon GLBGenerator ; il arrive tout seul ici.</p>`,
  };
}

function detailVerifier(st) {
  if (!bookUsable()) return { title: 'Vérifier le livre', sub: 'Après l’étape 1.', body: '<p class="empty">Ouvrir un livre valide d’abord.</p>' };
  const b = S.book;
  const c = b.check;
  const m = byName('book-check');
  const run = isRunning(m);
  const actions = run ? button(stop('book-check'), 'sm') : button(start(c ? 'Vérifier à nouveau' : 'Vérifier', 'book-check'));
  if (run) return { title: 'Vérifier le livre', sub: 'Vérification en cours…', actions, body: `<p class="empty"><span class="spinner" style="display:inline-block;vertical-align:middle"></span> ${h(m.label)} · ${timeOf(m)}</p>` };
  if (!c) return { title: 'Vérifier le livre', sub: 'Pas encore vérifié depuis l’ouverture du livre.', actions, body: '<p class="empty">La vérification contrôle les modèles exportés, les réglages des scènes et les fichiers du livre ; chaque problème est rangé avec l’outil qui le corrige.</p>' };
  if (c.error) return { title: 'Vérifier le livre', sub: `Vérification ${quand(c.date)} : interrompue.`, actions, body: `<p class="empty">${h(c.error)} ${button({ label: 'Voir le journal', act: 'journal', data: { nom: 'book-check' } }, 'sm ghost')}</p>` };
  const g = checkGroups(c);
  const stale = st.state === 'again' ? ` · <span class="t-warn">à refaire : ${h(b.newest.rel)} modifié depuis</span>` : '';
  const sub = `Vérifié ${quand(c.date)} · ${plural(c.errors, 'erreur', 'erreurs')}, ${plural(c.warnings, 'point', 'points')} à regarder${stale}`;
  const groups = ['blender', 'atelier', 'studio'].filter((k) => g[k].length).map((k) => {
    const errs = g[k].filter((l) => l.level === 'error').length;
    const warns = g[k].length - errs;
    const head = errs ? `À corriger dans ${TOOLS[k].titre}` : `À regarder dans ${TOOLS[k].titre}`;
    const count = [errs && plural(errs, 'erreur', 'erreurs'), warns && `${plural(warns, 'point', 'points')} sans blocage`].filter(Boolean).join(', ');
    let toolBtn = '';
    if (k === 'atelier') toolBtn = button({ label: 'Ouvrir l’atelier', act: 'ouvrirOutil', data: { nom: 'atelier' } }, 'sm');
    if (k === 'studio' && g.studio.some((l) => l.ex.fix === 'livre')) toolBtn += button({ label: 'Modifier le livre…', act: 'feuille', data: { f: 'livre' } }, 'sm');
    if (k === 'studio' && g.studio.some((l) => l.ex.fix === 'dossier')) toolBtn += button({ label: 'Ouvrir le dossier', act: 'ouvrirDossier' }, 'sm ghost');
    const items = g[k].map((l, j) => {
      const s = l.scene ? b.scenes.find((x) => x.id === l.scene) : null;
      const blend = k === 'blender' && s?.blend.present ? button({ label: 'Ouvrir dans Blender', act: 'ouvrirBlender', data: { scene: s.id }, why: !S.blender.exeOk ? 'blender.exe non réglé (Réglages)' : '' }, 'sm ghost') : '';
      // Atelier ouvert sur la scène à corriger (CC2, point de clôture de ST4).
      const atel = k === 'atelier' && s ? button({ label: 'Ouvrir dans l’atelier', act: 'ouvrirOutil', data: { nom: 'atelier', scene: s.id } }, 'sm ghost') : '';
      return `<li class="issue${l.level === 'error' ? '' : ' warn'}"><span class="lvl" title="${l.level === 'error' ? 'erreur' : 'à regarder'}"></span>
        <div>${l.scene ? `<span class="scene">${h(l.scene)}</span>` : ''}${h(l.ex.say)}</div>${blend || atel || '<span></span>'}
        <details data-k="orig-${k}-${j}-${h(l.message.slice(0, 40))}"><summary>Message d’origine</summary><code>${h(l.message)}</code></details></li>`;
    }).join('');
    return `<div class="tool"><div class="tool-head"><span class="tool-ico">${TOOLS[k].ico}</span><h3>${h(head)}</h3><span class="count">${count}</span><span class="grow"></span>${toolBtn}</div>
      <ul class="issues">${items}</ul></div>`;
  });
  return {
    title: 'Vérifier le livre', sub, actions,
    body: groups.length ? groups.join('') : `<p class="empty">Rien à signaler : le livre est valide. ${button({ label: 'Voir le journal', act: 'journal', data: { nom: 'book-check' } }, 'sm ghost')}</p>`,
  };
}

function devLinks(m, kind) {
  if (m.state !== 'prêt' || !m.port) return '';
  const ids = S.book ? S.book.scenes.map((s) => s.id) : [];
  const base = kind === 'dev' ? `http://localhost:${m.port}/` : `http://localhost:${m.port}/`;
  const scene = (id) => (kind === 'dev' ? `${base}#/s/${encodeURIComponent(id)}` : `${base}s/${encodeURIComponent(id)}/`);
  return `<div class="links"><a href="${base}" target="_blank" rel="noopener">menu du livre</a>${ids.map((id) => `<a href="${scene(id)}" target="_blank" rel="noopener">${h(id)}</a>`).join('')}</div>`;
}

function detailPC() {
  if (!bookUsable()) return { title: 'Essayer sur le PC', sub: 'Après l’étape 1.', body: '<p class="empty">Ouvrir un livre valide d’abord.</p>' };
  const dev = byName('dev');
  const at = byName('atelier');
  const upd = byName('dev-book');
  const dvb = S.outputs.devBook;
  const procTile = (m, title, text, openLabel, extra) => `<div class="tile"><h3>${h(title)} ${badge(m)} <span class="proc-meta">${timeOf(m)}</span></h3>
      <p class="small">${text}</p>${m.detail ? `<p class="small muted">${h(m.detail)}</p>` : ''}
      <div class="buttons">${button({ label: openLabel, act: 'ouvrirOutil', data: { nom: m.name }, why: isRunning(m) ? '' : blockReason(m.name) })}${isRunning(m) ? button(stop(m.name), 'ghost') : ''}${button({ label: 'Journal', act: 'journal', data: { nom: m.name } }, 'ghost sm')}</div>${extra ?? ''}</div>`;
  const updBtn = dev.state === 'prêt' && !dvb.ok && !isRunning(upd) ? `<div class="buttons">${button(start('Mettre à jour le lecteur', 'dev-book'), 'sm')}</div>` : isRunning(upd) ? `<p class="small">Mise à jour en cours… ${timeOf(upd)}</p>` : '';
  return {
    title: 'Essayer sur le PC',
    sub: 'Rien à préparer : la version du PC se met à jour toute seule au démarrage du lecteur.',
    body: `<div class="tiles">
      ${procTile(dev, 'Lecteur du livre', `Le livre comme sur un téléphone, dans un onglet du navigateur. ${h(devPlain(dvb))}`, 'Ouvrir le lecteur', `${updBtn}${devLinks(dev, 'dev')}`)}
      ${procTile(at, 'Atelier', 'Les réglages des scènes : textes, sons, cadrage, quiz, crédits. Il enregistre dans le livre.', 'Ouvrir l’atelier')}
    </div>`,
  };
}

function detailPreparer() {
  if (!bookUsable()) return { title: 'Préparer le livre pour le téléphone', sub: 'Après l’étape 1.', body: '<p class="empty">Ouvrir un livre valide d’abord.</p>' };
  const build = byName('build');
  const out = S.outputs.out;
  const o = outPlain(out);
  const run = isRunning(build);
  const r = out.record;
  const facts = [
    ['État', out.ok ? `<span class="t-ok">${h(o.long)}</span>` : `<span class="t-warn">${h(o.long)}</span>`],
    ...(r ? [['Dernière préparation', `${h(quand(Date.parse(r.date)))} <span class="muted">· mode ${h(r.mode)} · commit ${h(r.commit ?? 'inconnu')}${r.modifie ? ' (modifié)' : ''}</span>`]] : []),
    ['Préparation', build.startedAt ? `${badge(build)} ${timeOf(build)} ${build.detail ? `<span class="muted">${h(build.detail)}</span>` : ''}` : '<span class="muted">pas encore lancée depuis l’ouverture du studio</span>'],
  ];
  return {
    title: 'Préparer le livre pour le téléphone',
    sub: 'Le livre complet, tel qu’il s’installe sur un téléphone (dossier out/ du repo).',
    actions: `${button({ label: 'Journal', act: 'journal', data: { nom: 'build' } }, 'ghost sm')}${run ? button(stop('build')) : button(start('Préparer le livre', 'build'))}`,
    body: `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <p class="hint">À refaire après chaque modification du livre, avant un essai sur téléphone. La préparation arrête d’abord le serveur de test et le lecteur du PC s’ils tournent.</p>`,
  };
}

// ----- Essais sur téléphone (ST3) -----

/** QR affiché par visionneuse (un seul à la fois : une caméra en lit un sans hésiter), adresse IP choisie. */
const QV = { essai: 0, reseau: 0, impression: 0 };
let lanIp = null;
const qrSrc = (params) => `/__studio/qr?${new URLSearchParams(params).toString()}`;

function qrViewer(key, items) {
  if (!items.length) return '';
  const i = Math.min(QV[key], items.length - 1);
  QV[key] = i;
  const it = items[i];
  return `<div class="qr"><div class="qr-nav">
      <button type="button" class="btn sm icon" data-act="qrPrec" data-q="${key}" ${i === 0 ? 'disabled' : ''} aria-label="QR précédent">‹</button>
      <select data-q-select="${key}" aria-label="QR affiché">${items.map((x, j) => `<option value="${j}" ${j === i ? 'selected' : ''}>${h(x.label)}</option>`).join('')}</select>
      <button type="button" class="btn sm icon" data-act="qrSuiv" data-q="${key}" ${i === items.length - 1 ? 'disabled' : ''} aria-label="QR suivant">›</button>
    </div>
    <img src="${h(it.src)}" alt="QR : ${h(it.url)}">
    <div class="qr-url">${h(it.url)}</div></div>`;
}

function tileAndroid() {
  const R = S.reseau;
  const srv = byName('serveur-test');
  if (!R.adresses.length) return '<div class="tile"><h3>Android, par le Wi-Fi</h3><p class="small t-warn">Aucune adresse du réseau local trouvée (Wi-Fi coupé ?).</p></div>';
  if (!R.adresses.some((a) => a.ip === lanIp)) lanIp = R.adresses[0].ip;
  const origin = `http://${lanIp}:${R.port}`;
  const parts = [];
  if (srv.state === 'prêt') {
    const items = [
      ...S.book.scenes.map((x) => ({ label: `scène ${x.id}`, url: `${origin}/s/${x.id}/`, src: qrSrc({ type: 'reseau', ip: lanIp, scene: x.id, v: R.port }) })),
      { label: 'menu du livre', url: `${origin}/`, src: qrSrc({ type: 'reseau', ip: lanIp, scene: '', v: R.port }) },
    ];
    parts.push(`<div class="buttons">${badge(srv)}<span class="proc-meta">${timeOf(srv)}</span>${button(stop('serveur-test'), 'sm ghost')}</div>`);
    if (!S.outputs.out.ok) parts.push('<p class="small t-warn">Le serveur sert la préparation d’avant la modification : l’arrêter, « Préparer le livre », puis le redémarrer.</p>');
    parts.push(qrViewer('reseau', items));
  } else if (isRunning(srv)) {
    parts.push(`<p class="small"><span class="spinner" style="display:inline-block;vertical-align:middle"></span> ${h(srv.detail ?? 'démarrage du serveur de test…')}</p>`);
  } else {
    const b = start('Démarrer le serveur de test', 'serveur-test');
    parts.push(`<div class="buttons">${button(b)}</div>`);
    if (b.why) parts.push(`<p class="small t-warn">Pas maintenant : ${h(b.why)}.</p>`);
  }
  parts.push(`<label class="field">Adresse du PC sur le Wi-Fi <select data-lan-ip>${R.adresses.map((a) => `<option value="${h(a.ip)}" ${a.ip === lanIp ? 'selected' : ''}>${h(a.ip)} — ${h(a.nom)}${a.virtuelle ? ' (virtuelle ?)' : ''}</option>`).join('')}</select></label>`);
  parts.push(`<details data-k="android-aide"><summary>Première fois sur ce téléphone ?</summary><ol>
      <li>Téléphone sur le même Wi-Fi que le PC.</li>
      <li>Chrome du téléphone : <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> → Enabled, saisir <code>${h(origin)}</code>, puis Relaunch (à refaire si l’adresse change).</li>
      <li>Filmer le QR avec l’appareil photo, ouvrir l’adresse dans Chrome.</li>
      <li>Après un essai raté : « Clear site data » (effacer les données du site) avant de recommencer.</li>
      <li>Le téléphone ne joint pas le PC : choisir une autre adresse, ou autoriser Node.js sur les réseaux privés dans le pare-feu de Windows.</li></ol></details>`);
  return `<div class="tile"><h3>Android, par le Wi-Fi</h3>${parts.join('')}</div>`;
}

function tileIphone() {
  const E3 = S.essai;
  const pub = byName('publier');
  const cf = byName('cloudflare');
  const c = E3.cloudflare;
  const cfState = !c ? '<span class="muted">connexion vérifiée à chaque publication</span>'
    : c.connecte === true ? `<span class="t-ok">connecté</span>${c.compte ? ` <span class="muted">${h(c.compte)}</span>` : ''}`
    : c.connecte === false ? '<span class="t-err">non connecté</span>' : '<span class="t-warn">réponse de wrangler non reconnue (voir le journal)</span>';
  const parts = [`<p class="small">Adresse d’essai : <a href="${h(E3.adresse)}" target="_blank" rel="noopener">${h(E3.adresse)}</a></p>`, `<p class="small">Cloudflare : ${cfState}</p>`];
  const b = start('Publier un essai', 'publier');
  const btns = [];
  if (isRunning(pub)) btns.push(`${badge(pub)}<span class="proc-meta">${timeOf(pub)}</span>`, button(stop('publier'), 'sm ghost'));
  else btns.push(button(b));
  if (isRunning(cf)) btns.push(`${badge(cf)}`, button(stop('cloudflare'), 'sm ghost'));
  else if (c?.connecte !== true) btns.push(button(start('Se connecter à Cloudflare', 'cloudflare'), 'ghost'));
  btns.push(button({ label: 'Journal', act: 'journal', data: { nom: 'publier' } }, 'ghost sm'));
  parts.push(`<div class="buttons">${btns.join('')}</div>`);
  if (!isRunning(pub) && b.why) parts.push(`<p class="small t-warn">Pas maintenant : ${h(b.why)}.</p>`);
  if (pub.detail) parts.push(`<p class="small muted">${h(pub.detail)}</p>`);
  const p = E3.publication;
  if (p) {
    parts.push(`<p class="small">Dernier essai : ${h(quand(Date.parse(p.date)))} ${E3.outPublie ? '<span class="badge ok">à jour</span>' : '<span class="badge warn">à republier</span>'}</p>`);
    const items = E3.qr.map((q) => ({ label: `scène ${q.scene}`, url: q.url, src: qrSrc({ type: 'essai', scene: q.scene, v: p.date }) }));
    parts.push(items.length ? qrViewer('essai', items) : '<p class="small t-warn">QR d’essai absents de dist/qr-essai/ : publier à nouveau.</p>');
    if (p.deploiement) parts.push(`<p class="hint">Ce déploiement : ${h(p.deploiement)}</p>`);
  }
  parts.push(`<details data-k="iphone-aide"><summary>Comment faire ?</summary><ol>
      <li>Appareil photo de l’iPhone sur le QR d’essai : la scène s’ouvre dans Safari.</li>
      <li>Partager → « Sur l’écran d’accueil », puis ouvrir le livre depuis son icône (le téléchargement se fait dans l’app).</li>
      <li>Dans l’app : menu → « Scanner un QR code » lit les mêmes QR.</li></ol>
      <p class="hint">Les QR d’essai (dist/qr-essai/) codent l’adresse d’essai ; le livre publié garde l’adresse imprimée : on essaie ce qui sera publié en vrai. Ils marchent aussi sur Android, sans réglage de Chrome.</p></details>`);
  return `<div class="tile"><h3>iPhone, par un essai publié</h3>${parts.join('')}</div>`;
}

function tileImpression() {
  const b = S.book;
  const I = S.impression;
  if (!I.items.length) return `<div class="tile"><h3>QR du livre imprimé</h3><p class="small muted">Écrits par « Préparer le livre » dans dist/qr/${h(b.bookId ?? '?')}/.</p></div>`;
  const items = I.items.map((q) => ({ label: q.fichier.replace(/\.svg$/, ''), url: q.url ?? '(adresse inconnue : urls.txt absent)', src: qrSrc({ type: 'impression', scene: q.scene, v: I.date ?? 0 }) }));
  return `<div class="tile"><h3>QR du livre imprimé</h3><p class="small muted">dist/qr/${h(b.bookId)}/ — préparés ${h(quand(I.date))}</p>${qrViewer('impression', items)}
    <details data-k="impression-aide"><summary>À quoi servent-ils ?</summary><ol>
      <li>Ouvrir le livre sur le téléphone (Android par le Wi-Fi, ou essai publié).</li>
      <li>Menu du livre → « Scanner un QR code », filmer le QR affiché ici : la scène s’ouvre.</li></ol>
      <p class="hint">Ils codent l’adresse imprimée (origin de book.json) : l’appareil photo du téléphone ouvrirait cette adresse, pas l’essai.</p></details></div>`;
}

function detailTelephone() {
  if (!bookUsable()) return { title: 'Essayer sur téléphone', sub: 'Après l’étape 1.', body: '<p class="empty">Ouvrir un livre valide d’abord.</p>' };
  const out = S.outputs.out;
  const o = outPlain(out);
  return {
    title: 'Essayer sur téléphone',
    sub: out.ok ? `Livre préparé ${h(quand(Date.parse(out.record.date)))}.` : `<span class="t-warn">${h(o.long)} « Préparer le livre » (étape 5) d’abord.</span>`,
    body: `<div class="tiles">${tileAndroid()}${tileIphone()}${tileImpression()}</div>`,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Feuille « Journaux et processus »
// ---------------------------------------------------------------------------------------------------------

function renderProcs() {
  setHtml('procs', ['atelier', 'dev', 'serveur-test'].map((n) => {
    const m = byName(n);
    const run = isRunning(m);
    const port = m.port ?? S.ports[{ atelier: 'atelier', dev: 'dev', 'serveur-test': 'test' }[n]];
    return `<div class="proc"><div class="proc-head"><span class="proc-name">${h(m.label)}</span>${badge(m)}</div>
      <div class="proc-meta">${[timeOf(m), m.pid ? `PID ${m.pid}` : '', `port ${port}`].filter(Boolean).join(' · ')}</div>
      ${m.detail ? `<div class="proc-detail">${h(m.detail)}</div>` : ''}
      <div class="row wrap">${run ? button(stop(n), 'sm') : button(start('Démarrer', n), 'sm')}${button({ label: 'Journal', act: 'journal', data: { nom: n } }, 'sm ghost')}</div>
      ${n === 'atelier' && m.state === 'prêt' ? `<div class="links"><a href="http://127.0.0.1:${m.port}/atelier/" target="_blank" rel="noopener">atelier</a></div>` : devLinks(m, n === 'dev' ? 'dev' : 'test')}</div>`;
  }).join(''));
}

function renderOutputs() {
  const block = (title, v, plain, fix) => {
    const r = v.record;
    const meta = r ? `<div class="proc-meta">mode ${h(r.mode)} · commit ${h(r.commit ?? 'inconnu')}${r.modifie ? ' (arbre modifié)' : ''} · ${h(r.source)}</div>` : '';
    return `<div class="proc"><div class="proc-head"><span class="proc-name">${title}</span><span class="badge ${v.ok ? 'ok' : 'warn'}">${v.ok ? 'à jour' : 'à refaire'}</span></div>
      <div class="proc-detail">${h(plain)}</div><div class="proc-meta mono">${h(v.message)}</div>${meta}${!v.ok && S.book ? `<div class="row">${button(fix, 'sm')}</div>` : ''}</div>`;
  };
  setHtml('outputs', `<div class="rows">${block('Livre préparé (out/)', S.outputs.out, outPlain(S.outputs.out).long, start('Préparer le livre', 'build'))}
    ${block('Lecteur du PC (public/dev-book/)', S.outputs.devBook, devPlain(S.outputs.devBook), start('Mettre à jour (dev:book)', 'dev-book'))}</div>`);
}

// ---------------------------------------------------------------------------------------------------------
// Feuille « Outils de développement »
// ---------------------------------------------------------------------------------------------------------

const TASKS = [
  ['test-engine', 'Tests sans navigateur du lecteur (npm run test:engine).'],
  ['test-schema', 'Tests sans navigateur du contrat (Zod, fusion ; npm run test:schema).'],
  ['suite', 'Livre de test, préparation en parties de 1 Mio, puis test:install (environ 9 min sous Windows) ; le livre préparé est ensuite le livre de test.'],
  ['book-check', 'Vérification du livre ouvert, la même que l’étape 3 (npm run book:check).'],
  ['dev-book', 'Mise à jour de public/dev-book/ pour le lecteur du PC (npm run dev:book), lancée toute seule par le lecteur.'],
  ['build', 'Préparation du livre ouvert dans out/ (npm run build), la même que l’étape 5.'],
];

function renderTasks() {
  setHtml('tasks', TASKS.map(([n, help], i) => {
    const m = byName(n);
    const run = isRunning(m);
    return `${i === 3 ? '<h3 class="eyebrow" style="padding-top:16px">Commandes du parcours</h3>' : ''}<div class="proc"><div class="proc-head"><span class="proc-name">${h(m.label)}</span>${m.startedAt ? badge(m) : '<span class="badge">jamais lancée</span>'}
      <span class="proc-meta">${[timeOf(m), m.pid ? `PID ${m.pid}` : ''].filter(Boolean).join(' · ')}</span>
      ${run ? button(stop(n), 'sm') : button(start('Lancer', n), 'sm')}${button({ label: 'Journal', act: 'journal', data: { nom: n } }, 'sm ghost')}</div>
      <div class="proc-detail muted">${h(help)}</div>${m.detail ? `<div class="proc-detail">${h(m.detail)}</div>` : ''}</div>`;
  }).join(''));
}

// ---------------------------------------------------------------------------------------------------------
// Feuille « Réglages » : ports, Blender, projet d'essai
// ---------------------------------------------------------------------------------------------------------

let portsFilled = false;
function renderPorts() {
  const f = $('ports');
  if (portsFilled && f.contains(document.activeElement)) return;
  for (const k of ['atelier', 'dev', 'test']) f.elements[k].value = S.ports[k];
  portsFilled = true;
}

let blenderKey = null;
function renderBlender() {
  const f = $('blender-form');
  const bl = S.blender;
  const key = JSON.stringify([bl.exe, bl.gabarit]);
  if (blenderKey !== key && !f.contains(document.activeElement)) {
    f.elements.exe.value = bl.exe ?? '';
    f.elements.gabarit.value = bl.gabarit ?? '';
    blenderKey = key;
  }
  setHtml('blender-exe-etat', !bl.exe
    ? `<span class="t-warn">non réglé</span>${S.studio.windows ? ' : « Détecter » cherche dans C:\\Program Files\\Blender Foundation\\Blender &lt;version&gt;\\' : ''}`
    : bl.exeOk ? '<span class="t-ok">trouvé</span>' : '<span class="t-err">introuvable</span>');
  setHtml('blender-gabarit-etat', !bl.gabarit
    ? 'aucun gabarit : rien n’est créé à l’ajout d’une scène'
    : bl.gabaritOk ? '<span class="t-ok">trouvé</span>' : '<span class="t-err">introuvable</span>');
}

let essaiKey = null;
function renderEssaiReglages() {
  const f = $('essai-form');
  const E3 = S.essai;
  if (essaiKey !== E3.projet && !f.contains(document.activeElement)) {
    f.elements.projet.value = E3.projet;
    essaiKey = E3.projet;
  }
  const c = E3.cloudflare;
  const cf = byName('cloudflare');
  setHtml('essai-reglages', `<p class="hint">Adresse d’essai : ${h(E3.adresse)} · wrangler ${h(E3.wrangler)} (npx) · Cloudflare : ${!c ? 'connexion vérifiée à chaque publication' : c.connecte === true ? `connecté${c.compte ? ` (${h(c.compte)})` : ''}` : c.connecte === false ? 'non connecté' : 'réponse non reconnue'}</p>
    <div class="form-actions">${isRunning(cf) ? button(stop('cloudflare'), 'sm') : button(start('Se connecter à Cloudflare', 'cloudflare'), 'sm')}${button({ label: 'Journal', act: 'journal', data: { nom: 'cloudflare' } }, 'sm ghost')}</div>`);
}

$('blender-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target.elements;
  blenderKey = null;
  act('blender', { exe: f.exe.value, gabarit: f.gabarit.value });
});

$('essai-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  essaiKey = null;
  act('reglerEssai', { projet: ev.target.elements.projet.value });
});

$('ports').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  act('ports', { ports: { atelier: Number(f.elements.atelier.value), dev: Number(f.elements.dev.value), test: Number(f.elements.test.value) } }).then(() => {
    portsFilled = false;
  });
});

// ---------------------------------------------------------------------------------------------------------
// book.json : formulaire du livre ouvert (ST2, spec-app-bureau.md §4), dans la feuille « Informations du livre »
// ---------------------------------------------------------------------------------------------------------

// F : formulaire du livre ouvert. `base` : empreinte de book.json quand le formulaire a été rempli (une empreinte différente
// sur le disque = modification à la main) ; `loaded` : valeurs alors lues (formulaire modifié = valeurs différentes).
let F = null;
let validateTimer = null;

const clone = (v) => JSON.parse(JSON.stringify(v));
const sameStamp = (a, b) => (!a && !b) || (!!a && !!b && a.size === b.size && Math.abs(a.mtime - b.mtime) < 1);
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  const t = ks.reduce((x, k) => (x[k] ??= {}), o);
  t[last] = v;
}
const formDirty = () => !!F && JSON.stringify(F.values) !== F.loaded;
const scenePattern = () => new RegExp(S.schema.scenePattern);

function loadForm() {
  const b = S.book;
  const c = b.file.content;
  F = {
    dir: b.dir,
    base: b.file.stamp,
    values: { ...clone(c.form), cardTypes: clone(c.form.cardTypes ?? []) },
    loaded: JSON.stringify({ ...c.form, cardTypes: c.form.cardTypes ?? [] }),
    bookIdLocked: c.bookIdOnDisk !== null,
    unlock: c.unlockThreshold,
    hasUnlock: Object.prototype.hasOwnProperty.call(c, 'unlockThreshold'),
    // Types et intitulés des cartes lus sur le disque (CC2, CC3) : identifiants non modifiables (clés dans edit.json).
    diskTypeIds: (c.form.cardTypes ?? []).map((t) => t.id),
    diskFieldIds: Object.fromEntries((c.form.cardTypes ?? []).map((t) => [t.id, t.fields.map((f) => f.id)])),
    readable: b.file.readable,
    valid: b.file.valid,
    exists: !!b.file.stamp,
    errors: [],
    saving: false,
    reloadOn: null,
    images: null,
  };
  renderForm();
  validateSoon(0);
}

/** Appelé à chaque état reçu : formulaire (re)rempli au changement de livre ou après un enregistrement ; état à jour. */
function syncForm() {
  const b = S.book;
  if (!b) {
    F = null;
    $('book-form').innerHTML = '<p class="empty">Aucun livre ouvert.</p>';
    return;
  }
  if (!F || F.dir !== b.dir) return loadForm();
  if (F.reloadOn && sameStamp(b.file.stamp, F.reloadOn)) return loadForm();
  renderFormStatus();
}

function fieldText(label, path, extra = '') {
  return `<label class="field">${h(label)} <input type="text" data-f="${path}" value="${h(getPath(F.values, path) ?? '')}" ${extra}></label>`;
}

function renderForm() {
  const v = F.values;
  const langs = S.schema.languages.join(', ');
  $('book-form').innerHTML = `<form class="form" id="livre-form" autocomplete="off">
    <div id="f-status"></div>
    <div class="fields">
      <label class="field">Identifiant du livre (bookId) <input type="text" data-f="bookId" value="${h(v.bookId)}" spellcheck="false" ${F.bookIdLocked ? 'readonly title="identifiant d’un livre existant : non modifiable"' : ''}></label>
      <label class="field">Langues <input type="text" value="${h(langs)}" readonly title="exigées par le contrat (bookSchema)"></label>
    </div>
    ${F.bookIdLocked ? '<p class="hint">Identifiant d’un livre existant : non modifiable (clé de la progression et du cache sur les téléphones, figée après publication) ; pour un autre identifiant, créer un autre livre.</p>' : ''}
    <div class="fields">${fieldText('Titre en français', 'title.fr')}${fieldText('en anglais', 'title.en')}${fieldText('en espagnol', 'title.es')}</div>
    <div class="fields">
      ${fieldText('Adresse imprimée (origin)', 'origin', 'spellcheck="false" placeholder="ex. https://dino.editions-liger.com"')}
      <label class="field">Image de partage (ogImage) <select data-f="ogImage" id="f-og"></select></label>
    </div>
    <div class="fields legal">
      <label class="field">Année <input type="number" min="2000" max="2100" data-f="legal.year" value="${h(v.legal.year)}"></label>
      ${fieldText('Mention légale en français', 'legal.text.fr')}${fieldText('en anglais', 'legal.text.en')}${fieldText('en espagnol', 'legal.text.es')}
    </div>
    ${F.hasUnlock ? `<p class="hint">unlockThreshold : <code>${h(JSON.stringify(F.unlock))}</code> (mini-jeu, hors formulaire) : conservé tel quel.</p>` : ''}
    <h3 class="section-title" id="f-cards-title">Carte de collection</h3>
    <div id="f-cards"></div>
    <h3 class="section-title">Scènes</h3>
    <p class="hint">L’ordre des scènes est l’<strong>ordre de déblocage</strong> dans le livre : glisser une ligne, ou ↑ ↓. Retirer une scène laisse ses fichiers sur le disque. Renommer une scène est refusé (identifiant écrit dans le modèle par l’addon, clé de progression, QR imprimés) : retirer puis ajouter crée une autre scène.</p>
    <ol class="scene-list" id="f-scenes"></ol>
    <div class="field-row wrap">
      <label class="field">Nouvelle scène <input type="text" id="f-new-id" spellcheck="false" placeholder="ex. trex"></label>
      <label class="field">Position <select id="f-new-pos"></select></label>
      <button type="button" class="btn" data-act="ajouterScene">Ajouter</button>
    </div>
    <p class="hint" id="f-tpl"></p>
    <ul class="errors" id="f-errors"></ul>
    <div class="form-actions">
      <button type="submit" class="btn primary" id="f-save">Enregistrer book.json</button>
      <button type="button" class="btn ghost" data-act="reprendre">Reprendre le fichier du disque</button>
      <span class="small" id="f-dirty"></span>
    </div>
  </form>`;
  renderCardTypes();
  renderSceneList();
  renderFormStatus();
}

// Carte de collection (CC2) et types de cartes (CC3, DP-20, spec-carte-collection.md §15.11) : `F.values.cardTypes`,
// validés par bookSchema comme le reste du formulaire. Un seul type (livre à cardFields) : section « Carte de collection »
// de CC2 ; deux ou plus : section « Types de cartes ». Forme la plus courte écrite par le serveur (bookjson.ts) : un type →
// cardFields (nom perdu), deux ou plus → cardTypes.
const CARD_FIELDS_MAX = 8;
const CARD_LABEL_MAX = 14;
const CARD_TYPE_NAME_MAX = 14;
const DEFAULT_TYPE_ID = 'personnage';
const DEFAULT_TYPE_NAME = { fr: 'Personnage', en: 'Character', es: 'Personaje' };
/** Identifiant proposé d'après le texte français (« Époque » → « epoque »), tant qu'il n'est pas saisi à la main. */
const slugOf = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
// Intitulés et types dont l'identifiant suit le texte français ; types à identifiant fixe (`personnage` mis en tête).
const autoIds = new WeakSet();
const fixedTypes = new WeakSet();
const countHtml = (v, max = CARD_LABEL_MAX) => {
  const n = String(v ?? '').trim().length;
  return `<span class="${n > max ? 't-err' : 'muted'}">${n}/${max}</span>`;
};
const typeName = (t) => t.name?.fr?.trim() || t.id || 'type sans nom';
const scenesText = (list) => (list.length > 1 ? `des scènes ${list.join(', ')}` : `de la scène ${list[0]}`);
/** « La carte de la scène duo » / « Les cartes des scènes duo, vallee » ; `one` et `many` : suite accordée. */
const cardsOf = (list, one, many) => (list.length > 1 ? `Les cartes ${scenesText(list)} ${many}` : `La carte ${scenesText(list)} ${one}`);

/** Détail de l'étape Livre : intitulés (un type) ou noms des types. */
function cardFacts(types) {
  if (types.length >= 2) return `${h(types.map((t) => t.name?.fr || t.id).join(' · '))} <span class="muted">· types de cartes</span>`;
  const fields = types[0]?.fields ?? [];
  return fields.length ? `${h(fields.map((c) => c.label?.fr || c.id).join(' · '))} <span class="muted">· intitulés des caractéristiques</span>` : '<span class="muted">aucun intitulé de caractéristique</span>';
}

function fieldRows(t, ti) {
  const onDiskIds = F.diskTypeIds.includes(t.id) ? (F.diskFieldIds[t.id] ?? []) : [];
  const list = t.fields;
  return list.map((f, i) => {
    const onDisk = onDiskIds.includes(f.id) && !autoIds.has(f);
    const p = `cardTypes.${ti}.fields.${i}`;
    const lab = (l, name) => `<label class="field">${name} <input type="text" data-f="${p}.label.${l}" value="${h(f.label[l])}"> <span class="small" id="f-card-n-${ti}-${i}-${l}">${countHtml(f.label[l])}</span></label>`;
    return `<li data-ci="${i}">
      <div class="card-field-row">
        <label class="field">Identifiant <input type="text" data-f="${p}.id" value="${h(f.id)}" spellcheck="false" ${onDisk ? 'readonly title="identifiant d’un intitulé enregistré : clé des valeurs dans les réglages des scènes, non modifiable (retirer puis ajouter)"' : 'placeholder="ex. poids"'}></label>
        ${lab('fr', 'Français')}${lab('en', 'Anglais')}${lab('es', 'Espagnol')}
      </div>
      <button type="button" class="btn sm icon" data-act="monterIntitule" data-t="${ti}" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="monter">↑</button>
      <button type="button" class="btn sm icon" data-act="descendreIntitule" data-t="${ti}" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="descendre">↓</button>
      <button type="button" class="btn sm danger" data-act="retirerIntitule" data-t="${ti}" data-i="${i}">Retirer</button></li>`;
  }).join('');
}

const addFieldButton = (t, ti) => {
  const full = (t?.fields.length ?? 0) >= CARD_FIELDS_MAX;
  return `<button type="button" class="btn sm" data-act="ajouterIntitule" data-t="${ti}" ${full ? `disabled title="${CARD_FIELDS_MAX} intitulés au plus"` : ''}>Ajouter un intitulé</button>`;
};

function renderCardTypes() {
  const types = F.values.cardTypes;
  $('f-cards-title').textContent = types.length >= 2 ? 'Types de cartes' : 'Carte de collection';
  if (types.length < 2) {
    const t = types[0];
    $('f-cards').innerHTML = `<p class="hint">Intitulés des caractéristiques, communs à toutes les cartes du livre (${CARD_FIELDS_MAX} au plus, ${CARD_LABEL_MAX} caractères au plus par langue ; de 5 à 8, la carte prend une mise en page compacte), dans l’ordre d’affichage sur la carte. Les valeurs de chaque scène se saisissent dans l’atelier (onglet Carte). Aucun intitulé : les cartes n’ont pas de caractéristiques. « Ajouter un type » : plusieurs types de cartes (personnage, lieu, arme…), chacun avec ses intitulés.</p>
      <ol class="scene-list card-fields">${(t ? fieldRows(t, 0) : '') || '<li class="muted">aucun intitulé : cardFields absent de book.json</li>'}</ol>
      <div class="form-actions">${addFieldButton(t, 0)}<button type="button" class="btn sm" data-act="ajouterType">Ajouter un type</button></div>`;
    return;
  }
  $('f-cards').innerHTML = `<p class="hint">Types de cartes du livre, dans l’ordre : le premier est le type par défaut (carte sans type choisi). Chaque type a son nom (affiché sur la carte, ${CARD_TYPE_NAME_MAX} caractères au plus) et ses intitulés (1 à ${CARD_FIELDS_MAX}). Le type de chaque carte se choisit dans l’atelier (onglet Carte). Un identifiant enregistré ne change plus (clé dans les réglages des scènes).</p>
    ${types.map((t, ti) => {
      const locked = fixedTypes.has(t) || (F.diskTypeIds.includes(t.id) && !autoIds.has(t));
      const nm = (l, name) => `<label class="field">${name} <input type="text" data-f="cardTypes.${ti}.name.${l}" value="${h(t.name[l])}"> <span class="small" id="f-type-n-${ti}-${l}">${countHtml(t.name[l], CARD_TYPE_NAME_MAX)}</span></label>`;
      return `<section class="card-type" data-ti="${ti}">
        <div class="card-field-row">
          <label class="field">Identifiant du type <input type="text" data-f="cardTypes.${ti}.id" value="${h(t.id)}" spellcheck="false" ${locked ? 'readonly title="identifiant d’un type enregistré : clé dans les réglages des scènes, non modifiable"' : 'placeholder="ex. lieu"'}></label>
          ${nm('fr', 'Nom en français')}${nm('en', 'en anglais')}${nm('es', 'en espagnol')}
        </div>
        <div class="field-row wrap">
          ${ti === 0 ? '<span class="badge">type par défaut</span>' : ''}
          <button type="button" class="btn sm icon" data-act="monterType" data-t="${ti}" ${ti === 0 ? 'disabled' : ''} aria-label="monter le type">↑</button>
          <button type="button" class="btn sm icon" data-act="descendreType" data-t="${ti}" ${ti === types.length - 1 ? 'disabled' : ''} aria-label="descendre le type">↓</button>
          <button type="button" class="btn sm danger" data-act="retirerType" data-t="${ti}">Retirer le type</button>
        </div>
        <ol class="scene-list card-fields">${fieldRows(t, ti) || '<li class="muted">aucun intitulé (au moins un par type)</li>'}</ol>
        <div class="form-actions">${addFieldButton(t, ti)}</div>
      </section>`;
    }).join('')}
    <div class="form-actions"><button type="button" class="btn sm" data-act="ajouterType">Ajouter un type</button></div>`;
}

/** Type implicite d'un livre sans intitulés (créé au premier intitulé ou au premier type ajouté). */
function ensureFirstType() {
  if (!F.values.cardTypes.length) F.values.cardTypes.push({ id: DEFAULT_TYPE_ID, name: { fr: '', en: '', es: '' }, fields: [] });
  return F.values.cardTypes[0];
}

function addCardField(ti) {
  const t = ti === 0 ? ensureFirstType() : F.values.cardTypes[ti];
  if (!t || t.fields.length >= CARD_FIELDS_MAX) return;
  const f = { id: '', label: { fr: '', en: '', es: '' } };
  autoIds.add(f);
  t.fields.push(f);
  renderCardTypes();
  formEdited();
  document.querySelector(`[data-f="cardTypes.${ti}.fields.${t.fields.length - 1}.label.fr"]`)?.focus();
}

function moveCardField(ti, from, to) {
  const l = F.values.cardTypes[ti]?.fields;
  if (!l || to < 0 || to >= l.length) return;
  const [x] = l.splice(from, 1);
  l.splice(to, 0, x);
  renderCardTypes();
  formEdited();
}

/** Retirer un intitulé : confirmation si des cartes de ce type lui donnent une valeur (elles deviendraient des erreurs). */
async function removeCardField(ti, i) {
  const t = F.values.cardTypes[ti];
  const f = t?.fields[i];
  if (!f) return;
  const onDisk = F.diskTypeIds.includes(t.id) && (F.diskFieldIds[t.id] ?? []).includes(f.id);
  const used = f.id && onDisk ? ((await post('usageIntitule', { id: f.id, type: { id: t.id, tete: ti === 0 } })).scenes ?? []) : [];
  if (used.length) {
    const msg = `L’intitulé « ${f.label.fr || f.id} » a une valeur sur la carte ${scenesText(used)}. Une fois book.json enregistré, ces valeurs seront signalées en erreur par la vérification, jusqu’à leur retrait dans l’atelier (onglet Carte).`;
    if (!(await confirmer(msg, { titre: 'Retirer l’intitulé', ok: 'Retirer', danger: true }))) return;
  }
  t.fields.splice(i, 1);
  renderCardTypes();
  formEdited();
}

/** Usage d'un type par les cartes (lecture seule des réglages des scènes) ; type neuf sans identifiant : aucun. */
async function typeUsage(t, tete) {
  if (!t.id) return { scenes: [], explicit: [], implicit: [], cards: {} };
  const r = await post('usageType', { id: t.id, tete });
  return r.ok ? r : { scenes: [], explicit: [], implicit: [], cards: {} };
}

/** « Ajouter un type » : au premier ajout, le type actuel devient `personnage` (identifiant fixe, en tête, nom proposé). */
function addCardType() {
  const types = F.values.cardTypes;
  if (types.length < 2) {
    const first = ensureFirstType();
    if (!first.id) first.id = DEFAULT_TYPE_ID;
    if (!first.name.fr && !first.name.en && !first.name.es) first.name = { ...DEFAULT_TYPE_NAME };
    if (first.id === DEFAULT_TYPE_ID) fixedTypes.add(first);
  }
  const t = { id: '', name: { fr: '', en: '', es: '' }, fields: [] };
  autoIds.add(t);
  types.push(t);
  renderCardTypes();
  formEdited();
  document.querySelector(`[data-f="cardTypes.${types.length - 1}.name.fr"]`)?.focus();
}

/** Filet du type de tête (DP-20) : les cartes sans type prendront le nouveau type de tête ; confirmation qui les nomme. */
async function headChangeOk(oldHead, newHead) {
  if (!oldHead || !newHead || oldHead === newHead) return true;
  const u = await typeUsage(oldHead, true);
  if (!u.implicit.length) return true;
  const many = u.implicit.length > 1;
  return confirmer(`${cardsOf(u.implicit, 'n’a pas de type choisi : elle a le type par défaut, le premier de la liste.', 'n’ont pas de type choisi : elles ont le type par défaut, le premier de la liste.')} ${many ? 'Leur' : 'Son'} type deviendra « ${typeName(newHead)} » (au lieu de « ${typeName(oldHead)} »). Pour ${many ? 'qu’elles gardent leur' : 'qu’elle garde son'} type, le choisir dans l’atelier (onglet Carte) avant de changer l’ordre.`, { titre: 'Type par défaut', ok: 'Changer l’ordre', danger: true });
}

async function moveCardType(from, to) {
  const l = F.values.cardTypes;
  if (to < 0 || to >= l.length || from === to) return;
  const next = [...l];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  if (!(await headChangeOk(l[0], next[0]))) return;
  F.values.cardTypes = next;
  renderCardTypes();
  formEdited();
}

/**
 * « Retirer le type » : confirmation qui nomme les cartes de ce type (type choisi, ou sans type s'il est en tête) ; filet
 * du type de tête ; retour à un seul type (book.json reçoit cardFields, le nom du type n'est pas gardé, les cartes d'un
 * type autre que « personnage » seront refusées).
 */
async function removeCardType(ti) {
  const l = F.values.cardTypes;
  const t = l[ti];
  if (!t) return;
  const u = await typeUsage(t, ti === 0);
  const rest = l.filter((_, k) => k !== ti);
  const msgs = [];
  // Retour à un seul type : le message des cartes refusées couvre aussi celles du type retiré (pas de redite).
  if (u.explicit.length && rest.length !== 1) msgs.push(`${cardsOf(u.explicit, `a le type « ${typeName(t)} » : une fois book.json enregistré, elle sera signalée en erreur (type absent du livre)`, `ont le type « ${typeName(t)} » : une fois book.json enregistré, elles seront signalées en erreur (type absent du livre)`)}, jusqu’au choix d’un autre type dans l’atelier (onglet Carte).`);
  if (ti === 0 && u.implicit.length && rest.length) msgs.push(`${cardsOf(u.implicit, 'n’a pas de type choisi : son', 'n’ont pas de type choisi : leur')} type deviendra « ${typeName(rest[0])} ».`);
  if (rest.length === 1) {
    const refused = Object.entries(u.cards).filter(([, ty]) => ty !== null && ty !== DEFAULT_TYPE_ID).map(([sc]) => sc);
    msgs.push(`Il ne restera qu’un type : book.json gardera seulement ses intitulés (cardFields) ; son nom (« ${typeName(rest[0])} ») ne sera pas gardé, et les cartes n’afficheront plus de type.${refused.length ? ` ${cardsOf(refused, `a un type choisi autre que « ${DEFAULT_TYPE_ID} » : elle sera refusée`, `ont un type choisi autre que « ${DEFAULT_TYPE_ID} » : elles seront refusées`)} par la vérification, jusqu’au retrait de ce type dans l’atelier (onglet Carte, « Retirer ce type »).` : ''}`);
  }
  if (msgs.length && !(await confirmer(msgs.join(' '), { titre: 'Retirer le type', ok: 'Retirer', danger: true }))) return;
  F.values.cardTypes = rest;
  renderCardTypes();
  formEdited();
}

function renderSceneList() {
  const list = F.values.scenes;
  const disk = new Set((S.book?.scenes ?? []).map((s) => s.id));
  $('f-scenes').innerHTML = list.map((id, i) => `<li draggable="true" data-i="${i}"><span class="grip" title="glisser" aria-hidden="true">⠿</span>
      <span class="sid">${h(id)}${disk.has(id) ? '' : ' <span class="badge warn">ajoutée, à enregistrer</span>'}</span>
      <button type="button" class="btn sm icon" data-act="monterScene" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="monter">↑</button>
      <button type="button" class="btn sm icon" data-act="descendreScene" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="descendre">↓</button>
      <button type="button" class="btn sm danger" data-act="retirerScene" data-i="${i}">Retirer</button></li>`).join('')
    || '<li class="muted">aucune scène (au moins une est exigée)</li>';
  const pos = $('f-new-pos');
  pos.innerHTML = `<option value="${list.length}">à la fin</option>${list.map((id, i) => `<option value="${i}">avant ${h(id)} (n° ${i + 1})</option>`).join('')}`;
}

function renderFormStatus() {
  if (!F || !$('f-status')) return;
  const b = S.book;
  const parts = [];
  if (!F.saving && !sameStamp(b.file.stamp, F.base)) {
    parts.push(`<div class="notice warn"><p><strong>book.json modifié à la main</strong> depuis sa lecture par le studio${b.file.stamp ? '' : ' (fichier supprimé)'}.
      « Enregistrer » demandera confirmation avant d’écraser.</p>
      <div class="form-actions"><button type="button" class="btn sm" data-act="reprendre">Reprendre le fichier du disque</button></div></div>`);
  }
  if (F.exists && !F.valid) {
    parts.push(`<div class="notice err"><p>book.json ${F.readable ? 'refusé par bookSchema' : 'illisible'} à la lecture : formulaire prérempli avec ce qui est lisible ; rien n’est écrit tant que l’ensemble n’est pas valide.</p></div>`);
  }
  if (!F.exists) parts.push('<div class="notice err"><p>book.json absent du dossier : « Enregistrer » le crée.</p></div>');
  setHtml('f-status', parts.join(''));
  $('f-errors').innerHTML = F.errors.map((e) => `<li>${h(e)}</li>`).join('');
  $('f-save').disabled = F.errors.length > 0 || F.saving;
  $('f-save').textContent = F.saving ? 'Enregistrement…' : 'Enregistrer book.json';
  $('f-save').title = F.errors.length ? 'formulaire refusé par bookSchema : voir les messages' : '';
  $('f-dirty').innerHTML = formDirty() ? '<span class="t-warn">modifications non enregistrées</span>' : '<span class="muted">identique au fichier lu</span>';
  const bl = S.blender;
  $('f-tpl').textContent = bl.gabarit
    ? 'Gabarit réglé : à l’enregistrement, copié en blender/<scène>.blend pour chaque scène ajoutée, seulement si le fichier n’existe pas.'
    : 'Aucun gabarit de scène réglé (Réglages) : aucun .blend n’est créé à l’ajout.';
  // Menu ogImage : images présentes dans le dossier du livre.
  const imgs = JSON.stringify(b.images);
  const og = $('f-og');
  if (F.images !== imgs && document.activeElement !== og) {
    F.images = imgs;
    const cur = F.values.ogImage;
    const opts = [['', '(aucune)'], ...b.images.map((i) => [i, i])];
    if (cur && !b.images.includes(cur)) opts.push([cur, `${cur} (introuvable dans le dossier)`]);
    og.innerHTML = opts.map(([v, l]) => `<option value="${h(v)}" ${v === cur ? 'selected' : ''}>${h(l)}</option>`).join('');
  }
}

function validateSoon(ms = 250) {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(async () => {
    if (!F) return;
    const dir = F.dir;
    const r = await post('validerLivre', { livre: F.values });
    if (!F || F.dir !== dir) return;
    F.errors = r.erreurs ?? (r.error ? [r.error] : []);
    renderFormStatus();
    render();
  }, ms);
}

function formEdited() {
  renderFormStatus();
  validateSoon();
}

async function saveForm() {
  if (!F || F.saving) return { ok: false };
  F.saving = true;
  renderFormStatus();
  const r = await act('enregistrerLivre', { livre: F.values, base: F.base });
  F.saving = false;
  if (r.erreurs) F.errors = r.erreurs;
  if (r.ok) {
    if (r.inchange) loadForm();
    else F.reloadOn = r.stamp ?? null;
  }
  renderFormStatus();
  render();
  return r;
}

function moveScene(from, to) {
  const l = F.values.scenes;
  if (to < 0 || to >= l.length || from === to) return;
  const [x] = l.splice(from, 1);
  l.splice(to, 0, x);
  renderSceneList();
  formEdited();
}

/** Identifiant de scène saisi : refus lisible, ou `null` s'il convient. */
function sceneIdError(id) {
  if (!id) return 'identifiant de la scène vide';
  if (!scenePattern().test(id)) return `identifiant « ${id} » refusé : lettres, chiffres, _ et - (motif du contrat : ${S.schema.scenePattern})`;
  if (F.values.scenes.includes(id)) return `scène « ${id} » déjà dans la liste (renommer une scène est refusé)`;
  return null;
}

function addScene() {
  const input = $('f-new-id');
  const id = input.value.trim();
  const err = sceneIdError(id);
  if (err) return toast(err, true);
  const at = Number($('f-new-pos').value);
  F.values.scenes.splice(Number.isInteger(at) ? at : F.values.scenes.length, 0, id);
  input.value = '';
  renderSceneList();
  formEdited();
}

/** Étape « Scènes » : ajoute la scène en fin de liste et enregistre book.json aussitôt (gabarit copié par le serveur). */
async function addSceneDirect(input) {
  if (!F) return;
  const id = input.value.trim();
  const err = sceneIdError(id);
  if (err) return toast(err, true);
  if (formDirty() && !(await confirmer('Le formulaire du livre a d’autres modifications non enregistrées : elles seront enregistrées en même temps.', { titre: 'Ajouter la scène', ok: 'Enregistrer' }))) return;
  F.values.scenes.push(id);
  renderSceneList();
  const r = await saveForm();
  if (r.ok) input.value = '';
  else if (!r.confirm) {
    // refus (bookSchema, studio) : la scène sort du formulaire, rien n'a été écrit
    F.values.scenes = F.values.scenes.filter((x) => x !== id);
    renderSceneList();
    formEdited();
  }
}

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (F && t.dataset?.f && t.closest('#livre-form')) {
    setPath(F.values, t.dataset.f, t.value);
    // Types et intitulés des cartes (CC2, CC3) : compteurs, identifiant proposé d'après le texte français.
    const m = /^cardTypes\.(\d+)\.(?:(id)|name\.(fr|en|es)|fields\.(\d+)\.(?:(id)|label\.(fr|en|es)))$/.exec(t.dataset.f);
    if (m) {
      const [, ti, typeId, nameLang, fi, fieldId, labelLang] = m;
      const ty = F.values.cardTypes[Number(ti)];
      const follow = (o, path, text) => {
        if (!autoIds.has(o)) return;
        o.id = slugOf(text);
        const idInput = document.querySelector(`[data-f="${path}"]`);
        if (idInput) idInput.value = o.id;
      };
      if (typeId) autoIds.delete(ty);
      else if (nameLang) {
        $(`f-type-n-${ti}-${nameLang}`).innerHTML = countHtml(t.value, CARD_TYPE_NAME_MAX);
        if (nameLang === 'fr') follow(ty, `cardTypes.${ti}.id`, t.value);
      } else {
        const f = ty.fields[Number(fi)];
        if (fieldId) autoIds.delete(f);
        else {
          $(`f-card-n-${ti}-${fi}-${labelLang}`).innerHTML = countHtml(t.value);
          if (labelLang === 'fr') follow(f, `cardTypes.${ti}.fields.${fi}.id`, t.value);
        }
      }
    }
    formEdited();
  }
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (F && t.id === 'f-og') {
    F.values.ogImage = t.value;
    formEdited();
  } else if (t.dataset?.qSelect) {
    QV[t.dataset.qSelect] = Number(t.value);
    render();
  } else if (t.dataset && 'lanIp' in t.dataset) {
    lanIp = t.value;
    render();
  }
});
document.addEventListener('submit', (ev) => {
  const id = ev.target.id;
  if (id === 'livre-form') {
    ev.preventDefault();
    saveForm();
  } else if (id === 'ouvrir') {
    ev.preventDefault();
    const chemin = ev.target.querySelector('input').value.trim();
    if (chemin) openBook(chemin);
  } else if (id === 'ajout-scene') {
    ev.preventDefault();
    addSceneDirect(ev.target.querySelector('input'));
  }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'f-new-id') {
    ev.preventDefault();
    addScene();
  }
});

// Glisser-déposer dans la liste des scènes.
let dragFrom = null;
document.addEventListener('dragstart', (ev) => {
  const li = ev.target.closest?.('#f-scenes li[data-i]');
  if (!li) return;
  dragFrom = Number(li.dataset.i);
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', String(dragFrom));
});
document.addEventListener('dragover', (ev) => {
  const li = ev.target.closest?.('#f-scenes li[data-i]');
  if (!li || dragFrom === null) return;
  ev.preventDefault();
  for (const x of document.querySelectorAll('#f-scenes li.drag-over')) if (x !== li) x.classList.remove('drag-over');
  li.classList.add('drag-over');
});
document.addEventListener('drop', (ev) => {
  const li = ev.target.closest?.('#f-scenes li[data-i]');
  if (!li || dragFrom === null) return;
  ev.preventDefault();
  const to = Number(li.dataset.i);
  const from = dragFrom;
  dragFrom = null;
  moveScene(from, to);
});
document.addEventListener('dragend', () => {
  dragFrom = null;
  for (const x of document.querySelectorAll('#f-scenes li.drag-over')) x.classList.remove('drag-over');
});

// ---------------------------------------------------------------------------------------------------------
// Créer un livre (ST2, §4), dans la feuille « Créer un livre »
// ---------------------------------------------------------------------------------------------------------

let createNameEdited = false;
let createTimer = null;
let createFilled = false;

function createValues() {
  const f = $('creer').elements;
  const scene = f.scene.value.trim();
  return {
    livre: {
      bookId: f.bookId.value,
      title: { fr: f['title.fr'].value, en: f['title.en'].value, es: f['title.es'].value },
      scenes: scene ? [scene] : [],
      origin: f.origin.value,
      ogImage: '',
      legal: { year: f['legal.year'].value, text: { fr: f['legal.text.fr'].value, en: f['legal.text.en'].value, es: f['legal.text.es'].value } },
    },
    parent: f.parent.value,
    dossier: f.dossier.value.trim(),
  };
}

function fillCreateDefaults() {
  if (createFilled || !S) return;
  createFilled = true;
  const f = $('creer').elements;
  const text = `© ${S.year} Éditions Liger`;
  f['legal.year'].value = S.year;
  for (const l of ['fr', 'en', 'es']) f[`legal.text.${l}`].value = text;
  if (S.book && !f.parent.value) f.parent.value = S.book.dir.replace(/[\\/][^\\/]+$/, '');
}

function validateCreateSoon() {
  clearTimeout(createTimer);
  createTimer = setTimeout(async () => {
    const r = await post('validerLivre', { creation: true, livre: createValues().livre });
    $('creer-erreurs').innerHTML = (r.erreurs ?? []).map((e) => `<li>${h(e)}</li>`).join('');
  }, 250);
}

function onCreateOpen() {
  fillCreateDefaults();
  validateCreateSoon();
}

$('creer').addEventListener('input', (ev) => {
  const f = $('creer').elements;
  if (ev.target.name === 'dossier') createNameEdited = f.dossier.value.trim() !== '';
  if (ev.target.name === 'bookId' && !createNameEdited) f.dossier.value = f.bookId.value.trim();
  validateCreateSoon();
});

$('creer').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const v = createValues();
  const btn = $('creer-bouton');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'Création…';
  const r = await act('creerLivre', { ...v, dossier: v.dossier || v.livre.bookId.trim() });
  btn.disabled = false;
  btn.textContent = 'Créer le livre';
  if (r.erreurs) $('creer-erreurs').innerHTML = r.erreurs.map((e) => `<li>${h(e)}</li>`).join('');
  if (r.ok) {
    $('creer').reset();
    createFilled = false;
    createNameEdited = false;
    $('feuille-creer').close();
    $('creer-erreurs').innerHTML = '';
    chosen = null;
  }
});

/** Dossier sans book.json à l'ouverture : feuille de création préremplie (« Créer un livre ici »). */
function offerCreateHere(c) {
  openSheet('creer');
  const f = $('creer').elements;
  f.parent.value = c.parent;
  f.dossier.value = c.name;
  createNameEdited = true;
  toast(`« Créer un livre ici » : ${c.parent} → ${c.name}`);
  validateCreateSoon();
  f.bookId.focus();
}

/** Ouvrir un livre ; formulaire non enregistré : confirmation ; dossier sans book.json : « Créer un livre ici ». */
async function openBook(chemin) {
  if (formDirty() && !(await confirmer('Le formulaire du livre a des modifications non enregistrées. Ouvrir un autre livre quand même ?', { titre: 'Ouvrir un autre livre', ok: 'Ouvrir' }))) return;
  let r = await post('ouvrir', { chemin });
  if (r.confirm) {
    if (!(await confirmer(r.confirm, { ok: 'Continuer' }))) return;
    r = await post('ouvrir', { chemin, confirme: true });
  }
  // Dossier sans book.json : chemin normal d'un nouveau livre, pas une erreur à afficher en rouge.
  if (r.creer) return offerCreateHere(r.creer);
  if (r.error) return toast(r.error, true);
  if (r.message) toast(r.message);
  if (r.ok) chosen = null;
}

// ---------------------------------------------------------------------------------------------------------
// Explorateur de la page (« Parcourir… », correctif ST2) : liste fournie par le serveur (action `lister`, lecture seule)
// ---------------------------------------------------------------------------------------------------------

const E = { quoi: null, cible: null, liste: null, sel: null };
const EXPL = {
  livre: { titre: 'Ouvrir un livre', aide: 'Entrer dans le dossier du livre (repéré « livre » : il contient book.json), puis « Choisir ce dossier » ; ou « Ouvrir » sur sa ligne. Un dossier sans book.json propose de créer le livre.', dossier: true },
  parent: { titre: 'Dossier parent du nouveau livre', aide: 'Entrer dans le dossier qui contiendra le livre, puis « Choisir ce dossier ». Le dossier du livre est créé par « Créer le livre ».', dossier: true },
  blender: { titre: 'Programme blender.exe', aide: 'Choisir blender.exe (C:\\Program Files\\Blender Foundation\\Blender <version>\\).', dossier: false },
  gabarit: { titre: 'Gabarit de scène (.blend)', aide: 'Choisir le fichier .blend préparé comme gabarit.', dossier: false },
};
const joinPath = (dir, name) => (dir.endsWith(E.liste.sep) ? dir + name : dir + E.liste.sep + name);

async function explOpen(quoi, cible) {
  E.quoi = quoi;
  E.cible = cible;
  E.sel = null;
  $('expl-titre').textContent = EXPL[quoi].titre;
  $('expl-aide').textContent = EXPL[quoi].aide;
  const d = $('explorateur');
  if (!d.open) d.showModal();
  const field = { 'creer-parent': () => $('creer').elements.parent.value, 'blender-exe': () => $('blender-form').elements.exe.value, 'blender-direct': () => S.blender.exe ?? '',
    'blender-gabarit': () => $('blender-form').elements.gabarit.value, 'gabarit-direct': () => S.blender.gabarit ?? '' }[cible];
  const current = field ? field() : quoi === 'livre' && S.book ? S.book.dir.replace(/[\\/][^\\/]+$/, '') : '';
  const startDir = current && !EXPL[quoi].dossier ? current.replace(/[\\/][^\\/]*$/, '') : current;
  if (!(await explGo(startDir, true))) await explGo('');
}

function explClose() {
  if ($('explorateur').open) $('explorateur').close();
}
$('explorateur').addEventListener('close', () => {
  E.liste = null;
});

async function explGo(chemin, quiet = false) {
  const r = await post('lister', { quoi: E.quoi, chemin: chemin ?? '' });
  if (!r.ok) {
    if (!quiet) toast(r.error, true);
    return false;
  }
  E.liste = r.liste;
  E.sel = null;
  explRender();
  return true;
}

function explRender() {
  const l = E.liste;
  $('expl-chemin').value = l.chemin;
  const chip = (nom, chemin) => `<button type="button" class="chip" data-act="explAller" data-chemin="${h(chemin)}">${h(nom)}</button>`;
  $('expl-raccourcis').innerHTML = [...l.lecteurs.map((d) => chip(d, d)), ...l.raccourcis.map((r) => chip(r.nom, r.chemin))].join('');
  const rows = [
    ...(l.parent ? [`<li data-dir="${h(l.parent)}"><span class="ico">${ICON.up}</span><span class="nom">..</span></li>`] : []),
    ...l.dossiers.map((d) => `<li data-dir="${h(joinPath(l.chemin, d.nom))}"><span class="ico">${ICON.folder}</span><span class="nom">${h(d.nom)}</span>${
      d.livre ? `<span class="badge ok">livre</span>${E.quoi === 'livre' ? `<button type="button" class="btn sm" data-ouvrir="${h(joinPath(l.chemin, d.nom))}">Ouvrir</button>` : ''}` : ''}</li>`),
    ...l.fichiers.map((f) => `<li data-file="${h(joinPath(l.chemin, f))}" class="${E.sel === joinPath(l.chemin, f) ? 'sel' : ''}"><span class="ico">${ICON.file}</span><span class="nom">${h(f)}</span></li>`),
  ];
  $('expl-liste').innerHTML = rows.join('') || '<li class="muted">dossier vide</li>';
  if (l.coupe) $('expl-liste').insertAdjacentHTML('beforeend', `<li class="muted">… ${l.coupe} entrée(s) non affichée(s)</li>`);
  const dirMode = EXPL[E.quoi].dossier;
  $('expl-choisir').textContent = dirMode ? 'Choisir ce dossier' : 'Choisir ce fichier';
  $('expl-choisir').disabled = !dirMode && !E.sel;
  $('expl-choix').textContent = dirMode ? l.chemin : (E.sel ?? 'aucun fichier choisi');
  $('expl-liste').scrollTop = 0;
}

function explChoose(chemin) {
  const value = chemin ?? (EXPL[E.quoi].dossier ? E.liste.chemin : E.sel);
  if (!value) return;
  const d = { quoi: E.quoi, cible: E.cible, chemin: value };
  explClose();
  onBrowsed(d);
}

$('expl-liste').addEventListener('click', (ev) => {
  const open = ev.target.closest('[data-ouvrir]');
  if (open) return explChoose(open.dataset.ouvrir);
  const li = ev.target.closest('li');
  if (!li) return;
  if (li.dataset.dir) return explGo(li.dataset.dir);
  if (li.dataset.file) {
    E.sel = li.dataset.file;
    explRender();
  }
});
$('expl-liste').addEventListener('dblclick', (ev) => {
  const li = ev.target.closest('li[data-file]');
  if (li) explChoose(li.dataset.file);
});
$('expl-aller').addEventListener('submit', (ev) => {
  ev.preventDefault();
  explGo($('expl-chemin').value);
});

/** Chemin choisi dans l'explorateur (« Parcourir… »). `*-direct` : choix fait depuis le parcours, enregistré aussitôt. */
function onBrowsed(d) {
  if (!d.chemin) return;
  if (d.quoi === 'livre') {
    const input = document.querySelector('[data-keep="chemin"]');
    if (input) input.value = d.chemin;
    openBook(d.chemin);
    return;
  }
  if (d.cible === 'blender-direct' || d.cible === 'gabarit-direct') {
    blenderKey = null;
    const bl = S.blender;
    act('blender', d.cible === 'blender-direct' ? { exe: d.chemin, gabarit: bl.gabarit ?? '' } : { exe: bl.exe ?? '', gabarit: d.chemin });
    return;
  }
  const target = { 'creer-parent': $('creer').elements.parent, 'blender-exe': $('blender-form').elements.exe, 'blender-gabarit': $('blender-form').elements.gabarit }[d.cible];
  if (target) {
    target.value = d.chemin;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ---------------------------------------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------------------------------------

function renderTabs() {
  setHtml('tabs', S.journals.map((j) => {
    const m = byName(j.name);
    const dot = !m ? '' : isRunning(m) ? 'run' : m.state === 'erreur' ? 'err' : '';
    return `<button type="button" class="chip" role="tab" aria-selected="${j.name === journalName}" data-act="journalTab" data-nom="${j.name}"><span class="dot ${dot}"></span>${h(j.label)}</button>`;
  }).join(''));
}

function lineClass(l) {
  if (l.startsWith('[studio]')) return 'l-studio';
  if (/\bERREUR :|\berror\b|✘|\bfailed\b/i.test(l)) return 'l-err';
  if (/\bavertissement :|\bwarning\b|⚠/i.test(l)) return 'l-warn';
  return '';
}

function lineHtml(l) {
  const c = lineClass(l);
  return c ? `<span class="${c}">${h(l)}</span>\n` : `${h(l)}\n`;
}

function showJournal() {
  const pre = $('journal');
  pre.innerHTML = journalLines.map(lineHtml).join('');
  if ($('suivre').checked) pre.scrollTop = pre.scrollHeight;
}

async function selectJournal(name) {
  journalName = name;
  if (S) renderTabs();
  try {
    const r = await fetch(`/__studio/journal?nom=${encodeURIComponent(name)}`).then((x) => x.json());
    if (journalName !== name) return;
    journalLines = r.lignes ?? [];
  } catch {
    journalLines = ['(journal illisible)'];
  }
  showJournal();
}

function appendJournal(name, lines) {
  if (name !== journalName) return;
  journalLines.push(...lines);
  if (journalLines.length > 2000) journalLines.splice(0, journalLines.length - 2000);
  const pre = $('journal');
  const atEnd = $('suivre').checked;
  pre.insertAdjacentHTML('beforeend', lines.map(lineHtml).join(''));
  while (pre.childNodes.length > 4000) pre.removeChild(pre.firstChild);
  if (atEnd) pre.scrollTop = pre.scrollHeight;
}

// ---------------------------------------------------------------------------------------------------------
// Clics
// ---------------------------------------------------------------------------------------------------------

/** Confirmations (alertes au style Apple), en mots de tous les jours. */
const CONFIRMS = {
  quitter: () => ({ titre: 'Tout arrêter et quitter ?', message: 'L’atelier, le lecteur du PC, le serveur de test et les tâches en cours sont arrêtés, puis le studio se ferme. Blender reste ouvert.', ok: 'Quitter', danger: true }),
  suite: () => ({ titre: 'Suite complète', message: 'Livre de test, préparation, puis tests d’installation : environ 9 minutes sous Windows. Le serveur de test et le lecteur du PC sont arrêtés ; ensuite, le livre préparé est le livre de test (« Préparer le livre » à refaire pour le vrai livre).', ok: 'Lancer' }),
  build: () => {
    const live = [['serveur-test', 'le serveur de test'], ['dev', 'le lecteur du PC']].filter(([n]) => isRunning(byName(n))).map(([, l]) => l);
    return live.length ? { titre: 'Préparer le livre', message: `La préparation arrête d’abord ${live.join(' et ')} (à relancer ensuite depuis le parcours).`, ok: 'Préparer' } : null;
  },
  publier: () => ({ titre: 'Publier un essai ?', message: `Le livre préparé « ${S.book?.bookId ?? '?'} » est envoyé sur ${S.essai.adresse}. L’essai précédent est remplacé (même adresse : installation et collection gardées sur les téléphones).`, ok: 'Publier' }),
  arreterRestes: () => ({ titre: 'Arrêter les restes ?', message: 'Les processus restés d’un studio précédent sont arrêtés (arbre complet).', ok: 'Arrêter', danger: true }),
  arreterPid: () => ({ titre: 'Arrêter ce processus ?', message: 'Le processus qui occupe le port est arrêté (arbre complet).', ok: 'Arrêter', danger: true }),
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copié : ${text}`);
  } catch {
    toast(`Copie refusée par le navigateur : ${text}`, true);
  }
}

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  // Page : parcours, feuilles, outils.
  if (a === 'etape') {
    chosen = Number(b.dataset.n);
    return render();
  }
  if (a === 'feuille') return openSheet(b.dataset.f);
  if (a === 'fermer') return b.closest('dialog')?.close();
  if (a === 'changerLivre') {
    chosen = 0;
    render();
    return document.querySelector('[data-keep="chemin"]')?.focus();
  }
  if (a === 'creerIci') {
    const dir = S.book.dir;
    const i = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'));
    return offerCreateHere({ parent: dir.slice(0, i), name: dir.slice(i + 1) });
  }
  if (a === 'copier') return copyText(b.dataset.texte);
  if (a === 'ouvrirOutil') {
    chosen = null;
    return openTool(b.dataset.nom, b.dataset.scene);
  }
  if (a === 'journal') {
    openSheet('journaux');
    return selectJournal(b.dataset.nom);
  }
  if (a === 'journalTab') return selectJournal(b.dataset.nom);
  // Formulaire de book.json (dans la page, rien n'est écrit avant « Enregistrer »).
  if (a === 'ajouterScene') return addScene();
  if (a === 'monterScene' || a === 'descendreScene') {
    const i = Number(b.dataset.i);
    return moveScene(i, a === 'monterScene' ? i - 1 : i + 1);
  }
  if (a === 'ajouterIntitule') return addCardField(Number(b.dataset.t ?? 0));
  if (a === 'monterIntitule' || a === 'descendreIntitule') {
    const i = Number(b.dataset.i);
    return moveCardField(Number(b.dataset.t ?? 0), i, a === 'monterIntitule' ? i - 1 : i + 1);
  }
  if (a === 'retirerIntitule') return removeCardField(Number(b.dataset.t ?? 0), Number(b.dataset.i));
  if (a === 'ajouterType') return addCardType();
  if (a === 'monterType' || a === 'descendreType') {
    const ti = Number(b.dataset.t);
    return moveCardType(ti, a === 'monterType' ? ti - 1 : ti + 1);
  }
  if (a === 'retirerType') return removeCardType(Number(b.dataset.t));
  if (a === 'retirerScene') {
    F.values.scenes.splice(Number(b.dataset.i), 1);
    renderSceneList();
    return formEdited();
  }
  if (a === 'reprendre') {
    if (formDirty() && !(await confirmer('Abandonner les modifications du formulaire et reprendre book.json du disque ?', { titre: 'Reprendre le fichier', ok: 'Reprendre', danger: true }))) return;
    return loadForm();
  }
  // « Parcourir… » : explorateur de la page (correctif ST2).
  if (a === 'parcourir') return explOpen(b.dataset.quoi ?? 'livre', b.dataset.cible ?? null);
  if (a === 'explFermer') return explClose();
  if (a === 'explHaut') return E.liste?.parent && explGo(E.liste.parent);
  if (a === 'explAller') return explGo(b.dataset.chemin);
  if (a === 'explChoisir') return explChoose();
  // Visionneuses de QR (ST3).
  if (a === 'qrPrec' || a === 'qrSuiv') {
    QV[b.dataset.q] = Math.max(0, QV[b.dataset.q] + (a === 'qrPrec' ? -1 : 1));
    return render();
  }
  // Actions du serveur.
  const ask = (a === 'demarrer' ? CONFIRMS[b.dataset.nom] : CONFIRMS[a])?.();
  if (ask && !(await confirmer(ask.message, ask))) return;
  if (a === 'ouvrir') return openBook(b.dataset.chemin);
  const extra = {};
  if (b.dataset.nom) extra.nom = b.dataset.nom;
  if (b.dataset.chemin) extra.chemin = b.dataset.chemin;
  if (b.dataset.pid) extra.pid = Number(b.dataset.pid);
  if (b.dataset.scene) extra.scene = b.dataset.scene;
  if (a === 'demarrer' && b.dataset.nom) {
    journalName = b.dataset.nom;
    if ($('feuille-journaux').open) selectJournal(b.dataset.nom);
  }
  if (a === 'detecterBlender') blenderKey = null;
  if (b.closest('#prochaine')) chosen = null;
  await act(a, extra);
});

// ---------------------------------------------------------------------------------------------------------
// Flux d'événements. Le navigateur abandonne parfois la reconnexion quand le studio est arrêté (connexion refusée) :
// la page la relance elle-même toutes les secondes, y compris après « Tout arrêter et quitter ». Un studio relancé retrouve
// donc cet onglet (il n'en ouvre pas un autre).
// ---------------------------------------------------------------------------------------------------------

let es = null;
let retryTimer = null;
/** Identifiant de cet onglet : un onglet qui se connecte remplace les autres (un seul onglet actif, correctif ST2). */
const TAB_ID = Math.random().toString(36).slice(2);
/** Mis en veille par un autre onglet du studio : plus de reconnexion tant que « Utiliser cet onglet » n'est pas cliqué. */
let replaced = false;

function setConn(text) {
  $('conn').hidden = !text;
  $('conn').textContent = text ?? '';
}

function reconnectSoon() {
  if (retryTimer || replaced) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, 1000);
}

function connect() {
  if (es) es.close();
  if (replaced) return;
  es = new EventSource(`/__studio/events?onglet=${TAB_ID}`);
  es.addEventListener('remplace', () => {
    replaced = true;
    es.close();
    if (!$('veille').open) $('veille').showModal();
  });
  es.addEventListener('etat', (e) => {
    const next = JSON.parse(e.data);
    if (next.marker !== STUDIO_MARKER) return;
    const restarted = S && S.studio.pid !== next.studio.pid;
    S = next;
    if (stopped || restarted) {
      stopped = false;
      if ($('fin').open) $('fin').close();
      selectJournal(journalName);
    }
    render();
  });
  es.addEventListener('journal', (e) => {
    const d = JSON.parse(e.data);
    appendJournal(d.nom, d.lignes);
  });
  // Second lancement du studio (studio.cmd) alors que cet onglet est connecté : pas de nouvel onglet, annonce ici.
  es.addEventListener('second', () => {
    toast('Studio déjà lancé : second lancement ignoré, pas de nouvel onglet (cette page reste celle du studio).');
    const title = document.title;
    let n = 0;
    const t = setInterval(() => {
      document.title = n % 2 ? title : '● Studio déjà ouvert ici';
      if (++n >= 10) {
        clearInterval(t);
        document.title = title;
      }
    }, 600);
  });
  es.addEventListener('bye', () => {
    stopped = true;
    if (!$('fin').open) $('fin').showModal();
    es.close();
    reconnectSoon();
  });
  es.addEventListener('open', () => {
    setConn(null);
    selectJournal(journalName);
  });
  es.onerror = () => {
    if (replaced) return;
    if (!stopped && S) setConn('studio injoignable : reconnexion…');
    if (es.readyState === EventSource.CLOSED) reconnectSoon();
  };
}

$('veille-reprendre').addEventListener('click', () => {
  replaced = false;
  $('veille').close();
  connect();
});

// Texte fixe de la page : même typographie que le texte rendu (espaces insécables), hors <code>.
(function typoStatic() {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest('code, pre, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) n.nodeValue = typo(n.nodeValue);
  for (const el of document.querySelectorAll('[placeholder], [title]')) for (const a of ['placeholder', 'title']) if (el.hasAttribute(a)) el.setAttribute(a, typo(el.getAttribute(a)));
})();

connect();
