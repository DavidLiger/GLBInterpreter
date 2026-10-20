// Studio GLBI (ST1, ST2) : page locale servie par scripts/studio/server.ts. JS sans framework.
// État reçu par le flux /__studio/events (événements `etat`, `journal`, `bye`, `second`) ; toute action par POST
// /__studio/action (JSON, en-tête x-glbi-studio). Marqueur du studio (contrôle de fin de build) : glbi-studio-st1.
// ST2 : formulaire de book.json (valeurs gardées dans la page, validées par le serveur avec bookSchema ; aucune règle du
// contrat recopiée ici : le motif des identifiants de scène et les langues viennent du serveur), création d'un livre, Blender.
'use strict';

const STUDIO_MARKER = 'glbi-studio-st1';
const $ = (id) => document.getElementById(id);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let S = null;
let journalName = 'studio';
let journalLines = [];
let stopped = false;

// ---------------------------------------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------------------------------------

function frDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

function toast(text, error) {
  if (!text) return;
  const el = document.createElement('div');
  el.className = `t${error ? ' err' : ''}`;
  el.textContent = text;
  $('toast').append(el);
  setTimeout(() => el.remove(), error ? 12000 : 5000);
}

/** Action sans message affiché (validation en direct du formulaire). */
async function post(action, extra = {}) {
  try {
    const res = await fetch('/__studio/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-glbi-studio': '1' },
      body: JSON.stringify({ action, ...extra }),
    });
    return await res.json().catch(() => ({ ok: false, error: `réponse ${res.status}` }));
  } catch {
    return { ok: false, error: 'studio injoignable' };
  }
}

async function act(action, extra = {}) {
  const r = await post(action, extra);
  if (r.confirm) {
    if (window.confirm(r.confirm)) return act(action, { ...extra, confirme: true });
    return r;
  }
  if (r.error) toast(r.error, true);
  else if (r.message) toast(r.message);
  return r;
}

const byName = (n) => S?.managed.find((m) => m.name === n);
const isRunning = (m) => m && (m.state === 'démarrage' || m.state === 'prêt' || m.state === 'en cours');

function badge(m) {
  const cls = { prêt: 'ok', terminé: 'ok', 'en cours': 'run', démarrage: 'run', erreur: 'err' }[m.state] ?? '';
  const code = m.state === 'erreur' && m.code !== null ? ` (code ${m.code})` : '';
  return `<span class="badge ${cls}">${h(m.state)}${code}</span>`;
}

function timeOf(m) {
  if (!m.startedAt) return '';
  const end = m.endedAt ?? Date.now();
  return `<span class="t-dur" data-start="${m.startedAt}" data-end="${m.endedAt ?? ''}">${dur(end - m.startedAt)}</span>`;
}

// ---------------------------------------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------------------------------------

function renderTop() {
  const b = S.book;
  $('top-book').textContent = b ? `${b.bookId ?? '?'} — ${b.dir}` : 'aucun livre ouvert';
  $('top-book').title = b ? b.dir : '';
  $('top-pid').textContent = `PID du studio : ${S.studio.pid} · port ${S.studio.port}`;
  $('parcourir').hidden = !S.studio.windows;
  $('studio-port').textContent = S.studio.port;
}

function renderBandeaux() {
  const out = [];
  if (S.studio.caseWarning) out.push(`<div class="bandeau warn"><p>${h(S.studio.caseWarning)}</p></div>`);
  if (S.restes.length) {
    out.push(`<div class="bandeau err"><p><strong>Restes d’un studio précédent</strong> (arrêté brutalement) encore en marche :</p>
      ${S.restes.map((r) => `<p class="mono small">PID ${r.pid} — ${h(r.nom)} — ${r.nombre} processus — ${h(r.commande)}</p>`).join('')}
      <div class="actions"><button class="btn danger" data-act="arreterRestes">Arrêter les restes</button>
      <button class="btn" data-act="laisserRestes">Les laisser tourner</button></div></div>`);
  }
  for (const i of S.portIssues) {
    const owners = i.owners.length
      ? i.owners.map((o) => `<p class="mono small">PID ${o.pid} — ${h(o.command)} ${o.ours ? `<button class="btn small danger" data-act="arreterPid" data-pid="${o.pid}">Arrêter ce processus</button>` : '<span class="muted">(pas un processus du repo : à arrêter à la main)</span>'}</p>`).join('')
      : '<p class="small muted">processus occupant inconnu</p>';
    out.push(`<div class="bandeau warn"><p>Port <strong>${i.port}</strong> (${h(i.usage)}) occupé${i.reason ? ` : ${h(i.reason)}` : ''}</p>${owners}</div>`);
  }
  if (S.relance?.length) {
    const labels = S.relance.map((n) => byName(n)?.label ?? n).join(', ');
    out.push(`<div class="bandeau info"><p>Changement de livre : ${h(labels)} arrêté(s).</p>
      <div class="actions"><button class="btn primary" data-act="relancer">Relancer sur ce livre</button>
      <button class="btn" data-act="oublierRelance">Non merci</button></div></div>`);
  }
  if (!S.studio.httpServer) {
    out.push('<div class="bandeau warn"><p>http-server absent de node_modules (serveur de test) : lancer <code>npm i -D -E http-server@14.1.1</code>.</p></div>');
  }
  $('bandeaux').innerHTML = out.join('');
}

function renderRecents() {
  const list = S.recents.filter((r) => !S.book || r !== S.book.dir);
  $('recents').innerHTML = list.length
    ? `<div class="small muted">Livres récents</div><ul>${list.map((r) => `<li><span class="path" title="${h(r)}">${h(r)}</span>
        <button class="btn small" data-act="ouvrir" data-chemin="${h(r)}">Ouvrir</button>
        <button class="btn small" data-act="oublierRecent" data-chemin="${h(r)}" title="Retirer de la liste">×</button></li>`).join('')}</ul>`
    : '';
}

function cell(c, label) {
  if (!c.present) return `<span class="absent">absent</span>`;
  return `<span class="ok-t">${label}</span>${c.mtime ? `<span class="date">${frDate(c.mtime)}</span>` : ''}`;
}

function renderBook() {
  const b = S.book;
  if (!b) {
    $('book-head').innerHTML = '<p class="muted">Ouvrir le dossier d’un livre (il doit contenir <code>book.json</code>).</p>';
    $('scenes').innerHTML = '';
    $('check').innerHTML = '';
    return;
  }
  $('book-head').innerHTML = `<p><strong>${h(b.title ?? '(sans titre)')}</strong> <span class="muted">· ${h(b.bookId ?? '?')} · ${b.scenes.length} scène(s)</span></p>
    <p class="mono small">${h(b.dir)}</p>
    ${b.typed ? `<p class="small muted">Saisi « ${h(b.typed)} », ramené à la casse réelle.</p>` : ''}
    ${!b.icon ? '<p class="small warn-t">icon.png absent : icône du livre obligatoire (PNG carré ≥ 512 px), erreur de book:check tant qu’elle manque.</p>' : ''}
    ${b.errors.length ? `<ul class="checklines">${b.errors.map((e) => `<li class="err-t">${h(e)}</li>`).join('')}</ul>` : ''}`;
  const rows = b.scenes.map((s) => {
    let check = '<span class="muted">—</span>';
    if (s.check) {
      const parts = [];
      if (s.check.errors) parts.push(`<span class="err-t">${s.check.errors} erreur(s)</span>`);
      if (s.check.warnings) parts.push(`<span class="warn-t">${s.check.warnings} avert.</span>`);
      check = parts.length ? parts.join(' ') : '<span class="ok-t">aucun message</span>';
    }
    const bl = S.blender;
    const openWhy = !s.blend.present ? `blender/${s.id}.blend absent` : !bl.exe ? 'chemin de blender.exe non réglé (section Blender)' : !bl.exeOk ? 'blender.exe introuvable (section Blender)' : '';
    const tplWhy = !bl.gabarit ? 'aucun gabarit réglé (section Blender) : rien n’est créé' : !bl.gabaritOk ? 'gabarit introuvable (section Blender)' : '';
    const blend = s.blend.present
      ? `<span class="ok-t">${h(s.id)}.blend</span>${s.blend.mtime ? `<span class="date">${frDate(s.blend.mtime)}</span>` : ''}`
      : `<span class="absent">absent</span><br><button class="btn small" data-act="creerDepuisGabarit" data-scene="${h(s.id)}" ${tplWhy ? `disabled title="${h(tplWhy)}"` : ''}>Créer depuis le gabarit</button>`;
    return `<tr><td class="mono">${h(s.id)}</td><td>${cell(s.glb, 'GLB')}</td><td>${cell(s.edit, 'edit.json')}</td>
      <td>${blend}</td><td>${check}</td>
      <td><button class="btn small" data-act="ouvrirBlender" data-scene="${h(s.id)}" ${openWhy ? `disabled title="${h(openWhy)}"` : ''}>Ouvrir dans Blender</button></td></tr>`;
  });
  $('scenes').innerHTML = b.scenes.length
    ? `<table><thead><tr><th>Scène</th><th>scenes/&lt;id&gt;.glb</th><th>scenes/&lt;id&gt;.edit.json</th><th>blender/&lt;id&gt;.blend</th><th>Dernier book:check</th><th>Blender</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
    : '<p class="muted">Aucune scène lisible dans book.json.</p>';
  const c = b.check;
  if (!c) $('check').innerHTML = '<p class="small muted">book:check pas encore lancé depuis le studio sur ce livre.</p>';
  else if (c.error) $('check').innerHTML = `<p class="small err-t">book:check du ${frDate(c.date)} : ${h(c.error)}</p>`;
  else {
    $('check').innerHTML = `<p class="small">book:check du ${frDate(c.date)} : ${c.ok ? '<span class="ok-t">livre valide</span>' : '<span class="err-t">livre refusé</span>'}
      — ${c.errors} erreur(s), ${c.warnings} avertissement(s) (détail dans le journal de book:check)</p>
      ${c.bookLines.length ? `<ul class="checklines">${c.bookLines.map((l) => `<li class="${l.level === 'error' ? 'err-t' : 'warn-t'}">${h(l.message)}</li>`).join('')}</ul>` : ''}`;
  }
}

function outputBlock(title, v, fixAct, fixLabel) {
  const r = v.record;
  const meta = r
    ? `<p class="small muted">mode ${h(r.mode)} · commit ${h(r.commit ?? 'inconnu')}${r.modifie ? ' (arbre modifié)' : ''} · ${h(r.source)}</p>`
    : '';
  const fix = !v.ok && S.book ? `<button class="btn small" data-act="demarrer" data-nom="${fixAct}">${fixLabel}</button>` : '';
  const PROBLEMS = { absent: 'absent', inconnu: 'origine inconnue', test: 'livre de test', autre: 'autre livre', perime: 'périmé' };
  return `<div class="out"><p><strong>${title}</strong> <span class="badge ${v.ok ? 'ok' : 'warn'}">${v.ok ? 'à jour' : (PROBLEMS[v.problem] ?? 'refusé')}</span></p>
    <p class="small">${h(v.message)}</p>${meta}${fix}</div>`;
}

function renderOutputs() {
  $('outputs').innerHTML =
    outputBlock('out/ (livre exporté)', S.outputs.out, 'build', 'Reconstruire (Build du livre)') +
    outputBlock('public/dev-book/ (lecteur de développement)', S.outputs.devBook, 'dev-book', 'Mettre à jour (dev:book)');
}

function procLinks(m) {
  const b = S.book;
  if (m.state !== 'prêt' || !m.port) return '';
  if (m.name === 'atelier') return `<div class="links"><a href="http://127.0.0.1:${m.port}/atelier/" target="_blank" rel="noopener">Ouvrir l’atelier</a></div>`;
  const scenes = b ? b.scenes.map((s) => s.id) : [];
  if (m.name === 'dev') {
    return `<div class="links"><a href="http://localhost:${m.port}/" target="_blank" rel="noopener">menu du livre</a>${scenes
      .map((id) => `<a href="http://localhost:${m.port}/#/s/${encodeURIComponent(id)}" target="_blank" rel="noopener">#/s/${h(id)}</a>`).join('')}</div>`;
  }
  return `<div class="links"><a href="http://localhost:${m.port}/" target="_blank" rel="noopener">menu du livre</a>${scenes
    .map((id) => `<a href="http://localhost:${m.port}/s/${encodeURIComponent(id)}/" target="_blank" rel="noopener">/s/${h(id)}/</a>`).join('')}</div>`;
}

function renderProcs() {
  const ex = S.exclusive ? byName(S.exclusive) : null;
  $('procs').innerHTML = ['atelier', 'dev', 'serveur-test'].map((n) => {
    const m = byName(n);
    const run = isRunning(m);
    const blocked = !S.book ? 'aucun livre ouvert' : n !== 'atelier' && ex && !(n === 'serveur-test' && ex.name === 'dev-book') ? `${ex.label} en cours` : '';
    let extra = '';
    if (n === 'dev' && !S.outputs.devBook.ok && S.book) extra = `<div class="proc-detail warn-t">${h(S.outputs.devBook.message)} : dev:book sera lancé d’abord (ou « Mettre à jour »).</div>`;
    if (n === 'serveur-test' && !S.outputs.out.ok && S.book && !run) extra = `<div class="proc-detail warn-t">${h(S.outputs.out.message)} : serveur refusé, reconstruire le livre.</div>`;
    return `<div class="proc"><div class="proc-head"><span class="proc-name">${h(m.label)}</span>${badge(m)}
      <span class="proc-meta">${[timeOf(m), m.pid ? `PID ${m.pid}` : '', m.port ? `port ${m.port}` : `port ${S.ports[{ atelier: 'atelier', dev: 'dev', 'serveur-test': 'test' }[n]]}`].filter(Boolean).join(' · ')}</span>
      ${run ? `<button class="btn" data-act="arreter" data-nom="${n}">Arrêter</button>` : `<button class="btn primary" data-act="demarrer" data-nom="${n}" ${blocked ? `disabled title="${h(blocked)}"` : ''}>Démarrer</button>`}
      <button class="btn small" data-act="journal" data-nom="${n}">journal</button></div>
      ${m.detail ? `<div class="proc-detail">${h(m.detail)}</div>` : ''}${extra}${procLinks(m)}</div>`;
  }).join('');
}

const TASKS = [
  ['book-check', 'Vérifie le livre ouvert (mêmes contrôles et textes que npm run book:check).'],
  ['build', 'Construit le livre ouvert dans out/ (supprime d’abord out/ et .next/ ; arrête le serveur de test et le lecteur de développement).'],
  ['dev-book', 'Met à jour public/dev-book/ (lecteur de développement).'],
  ['test-engine', 'Tests sans navigateur du lecteur.'],
  ['test-schema', 'Tests sans navigateur du contrat (Zod, fusion).'],
  ['suite', 'Livre de test, build --part-mib 1, test:install (environ 9 min sous Windows) ; out/ contient ensuite le livre de test.'],
];

function renderTasks() {
  const ex = S.exclusive ? byName(S.exclusive) : null;
  $('tasks').innerHTML = TASKS.map(([n, help]) => {
    const m = byName(n);
    const run = isRunning(m);
    const needBook = n === 'book-check' || n === 'build' || n === 'dev-book';
    const blocked = needBook && !S.book ? 'aucun livre ouvert' : m.exclusive && ex && ex.name !== n ? `${ex.label} en cours` : '';
    return `<div class="proc"><div class="proc-head"><span class="proc-name">${h(m.label)}</span>${m.startedAt ? badge(m) : '<span class="badge">jamais lancée</span>'}
      <span class="proc-meta">${[timeOf(m), m.pid ? `PID ${m.pid}` : ''].filter(Boolean).join(' · ')}</span>
      ${run ? `<button class="btn" data-act="arreter" data-nom="${n}">Arrêter</button>` : `<button class="btn primary" data-act="demarrer" data-nom="${n}" ${blocked ? `disabled title="${h(blocked)}"` : ''}>Lancer</button>`}
      <button class="btn small" data-act="journal" data-nom="${n}">journal</button></div>
      <div class="proc-detail muted">${h(help)}</div>${m.detail ? `<div class="proc-detail">${h(m.detail)}</div>` : ''}</div>`;
  }).join('');
}

function renderTabs() {
  if (!S) return;
  $('tabs').innerHTML = S.journals.map((j) => {
    const m = byName(j.name);
    const dot = !m ? '' : isRunning(m) ? 'run' : m.state === 'erreur' ? 'err' : m.state === 'terminé' || m.state === 'prêt' ? 'ok' : '';
    return `<button class="tab" role="tab" aria-selected="${j.name === journalName}" data-act="journal" data-nom="${j.name}"><span class="dot ${dot}"></span>${h(j.label)}</button>`;
  }).join('');
}

let portsFilled = false;
function renderPorts() {
  const f = $('ports');
  if (portsFilled && f.contains(document.activeElement)) return;
  for (const k of ['atelier', 'dev', 'test']) f.elements[k].value = S.ports[k];
  portsFilled = true;
}

function render() {
  if (!S) return;
  renderTop();
  renderBandeaux();
  renderRecents();
  renderBook();
  renderOutputs();
  renderProcs();
  renderTasks();
  renderTabs();
  renderPorts();
  syncForm();
  renderBlender();
}

// ---------------------------------------------------------------------------------------------------------
// book.json : formulaire du livre ouvert (ST2, spec-app-bureau.md §4)
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
    values: clone(c.form),
    loaded: JSON.stringify(c.form),
    bookIdLocked: c.bookIdOnDisk !== null,
    unlock: c.unlockThreshold,
    hasUnlock: Object.prototype.hasOwnProperty.call(c, 'unlockThreshold'),
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

/** Appelé à chaque état reçu : formulaire (re)rempli au changement de livre ou après un enregistrement ; bandeau à jour. */
function syncForm() {
  const b = S.book;
  if (!b) {
    F = null;
    $('book-form').innerHTML = '';
    return;
  }
  if (!F || F.dir !== b.dir) return loadForm();
  if (F.reloadOn && sameStamp(b.file.stamp, F.reloadOn)) return loadForm();
  renderFormStatus();
}

function fieldText(label, path, extra = '') {
  return `<label class="col">${h(label)} <input type="text" data-f="${path}" value="${h(getPath(F.values, path) ?? '')}" ${extra}></label>`;
}

function renderForm() {
  const v = F.values;
  const langs = S.schema.languages.join(', ');
  $('book-form').innerHTML = `<form class="form-box" id="livre-form" autocomplete="off">
    <h3>book.json</h3>
    <div id="f-status"></div>
    <div class="fields">
      <label class="col">bookId <input type="text" data-f="bookId" value="${h(v.bookId)}" spellcheck="false" ${F.bookIdLocked ? 'readonly title="bookId d’un livre existant : non modifiable"' : ''}></label>
      <label class="col">Langues <input type="text" value="${h(langs)}" readonly title="exigées par le contrat (bookSchema)"></label>
    </div>
    ${F.bookIdLocked ? '<p class="small muted">bookId d’un livre existant : non modifiable (clé de progression et nom du cache, figés après publication) ; pour un autre bookId, créer un autre livre.</p>' : ''}
    <div class="fields">${fieldText('Titre FR', 'title.fr')}${fieldText('Titre EN', 'title.en')}${fieldText('Titre ES', 'title.es')}</div>
    <div class="fields">
      ${fieldText('Adresse imprimée (origin)', 'origin', 'spellcheck="false" placeholder="https://dino.editions-liger.com"')}
      <label class="col">Image de partage (ogImage) <select data-f="ogImage" id="f-og"></select></label>
    </div>
    <div class="fields">
      <label class="col narrow">Année <input type="number" min="2000" max="2100" data-f="legal.year" value="${h(v.legal.year)}"></label>
      ${fieldText('Mention légale FR', 'legal.text.fr')}${fieldText('EN', 'legal.text.en')}${fieldText('ES', 'legal.text.es')}
    </div>
    ${F.hasUnlock ? `<p class="small muted">unlockThreshold : <code>${h(JSON.stringify(F.unlock))}</code> (mini-jeu, hors formulaire) : conservé tel quel.</p>` : ''}
    <h3>Scènes</h3>
    <p class="small muted">L’ordre des scènes est l’<strong>ordre de déblocage</strong> (progression du lecteur) : glisser une ligne, ou ↑ ↓. Retirer une scène laisse ses fichiers sur le disque. Renommer une scène est refusé (identifiant écrit dans le GLB par l’addon, clé de progression, QR imprimés) : retirer puis ajouter crée une autre scène.</p>
    <ol class="scene-list" id="f-scenes"></ol>
    <div class="row wrap">
      <label class="col">Nouvelle scène <input type="text" id="f-new-id" spellcheck="false" placeholder="identifiant, ex. trex"></label>
      <label class="col">Position <select id="f-new-pos"></select></label>
      <button type="button" class="btn" data-act="ajouterScene">Ajouter</button>
    </div>
    <p class="small muted" id="f-tpl"></p>
    <ul class="checklines" id="f-errors"></ul>
    <div class="form-actions">
      <button type="submit" class="btn primary" id="f-save">Enregistrer book.json</button>
      <button type="button" class="btn" data-act="reprendre">Reprendre le fichier du disque</button>
      <span class="small" id="f-dirty"></span>
    </div>
  </form>`;
  renderSceneList();
  renderFormStatus();
}

function renderSceneList() {
  const list = F.values.scenes;
  const disk = new Set((S.book?.scenes ?? []).map((s) => s.id));
  $('f-scenes').innerHTML = list.map((id, i) => `<li draggable="true" data-i="${i}"><span class="grip" title="glisser">⠿</span>
      <span class="sid">${h(id)}${disk.has(id) ? '' : ' <span class="badge warn">ajoutée, à enregistrer</span>'}</span>
      <button type="button" class="btn small" data-act="monterScene" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="monter">↑</button>
      <button type="button" class="btn small" data-act="descendreScene" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''} title="descendre">↓</button>
      <button type="button" class="btn small danger" data-act="retirerScene" data-i="${i}">Retirer</button></li>`).join('')
    || '<li class="muted">aucune scène (au moins une est exigée)</li>';
  const pos = $('f-new-pos');
  pos.innerHTML = `<option value="${list.length}">à la fin</option>${list.map((id, i) => `<option value="${i}">avant ${h(id)} (n° ${i + 1})</option>`).join('')}`;
}

function renderFormStatus() {
  if (!F || !$('f-status')) return;
  const b = S.book;
  const parts = [];
  if (!F.saving && !sameStamp(b.file.stamp, F.base)) {
    parts.push(`<div class="bandeau warn"><p><strong>book.json modifié à la main</strong> depuis sa lecture par le studio${b.file.stamp ? '' : ' (fichier supprimé)'}.
      « Enregistrer » demandera confirmation avant d’écraser.</p>
      <div class="actions"><button type="button" class="btn" data-act="reprendre">Reprendre le fichier du disque</button></div></div>`);
  }
  if (F.exists && !F.valid) {
    parts.push(`<div class="bandeau err"><p>book.json ${F.readable ? 'refusé par bookSchema' : 'illisible'} à la lecture (messages ci-dessus) : formulaire prérempli avec ce qui est lisible ; rien n’est écrit tant que l’ensemble n’est pas valide.</p></div>`);
  }
  if (!F.exists) parts.push('<div class="bandeau err"><p>book.json absent du dossier : « Enregistrer » le crée.</p></div>');
  $('f-status').innerHTML = parts.join('');
  $('f-errors').innerHTML = F.errors.map((e) => `<li class="err-t">${h(e)}</li>`).join('');
  $('f-save').disabled = F.errors.length > 0 || F.saving;
  $('f-save').title = F.errors.length ? 'formulaire refusé par bookSchema : voir les messages' : '';
  $('f-dirty').innerHTML = formDirty() ? '<span class="warn-t">modifications non enregistrées</span>' : '<span class="muted">formulaire identique au fichier lu</span>';
  const bl = S.blender;
  $('f-tpl').textContent = bl.gabarit
    ? `Gabarit réglé : à l’enregistrement, copié en blender/<scène>.blend pour chaque scène ajoutée, seulement si le fichier n’existe pas.`
    : 'Aucun gabarit de scène réglé (section Blender) : aucun .blend n’est créé à l’ajout.';
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
  }, ms);
}

function formEdited() {
  renderFormStatus();
  validateSoon();
}

async function saveForm() {
  if (!F || F.saving) return;
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
}

function moveScene(from, to) {
  const l = F.values.scenes;
  if (to < 0 || to >= l.length || from === to) return;
  const [x] = l.splice(from, 1);
  l.splice(to, 0, x);
  renderSceneList();
  formEdited();
}

function addScene() {
  const input = $('f-new-id');
  const id = input.value.trim();
  if (!id) return toast('identifiant de la scène vide', true);
  if (!scenePattern().test(id)) return toast(`identifiant « ${id} » refusé : lettres, chiffres, _ et - (motif du contrat : ${S.schema.scenePattern})`, true);
  if (F.values.scenes.includes(id)) return toast(`scène « ${id} » déjà dans la liste (renommer une scène est refusé)`, true);
  const at = Number($('f-new-pos').value);
  F.values.scenes.splice(Number.isInteger(at) ? at : F.values.scenes.length, 0, id);
  input.value = '';
  renderSceneList();
  formEdited();
}

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (F && t.dataset?.f && t.closest('#livre-form')) {
    setPath(F.values, t.dataset.f, t.value);
    formEdited();
  }
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (F && t.id === 'f-og') {
    F.values.ogImage = t.value;
    formEdited();
  }
});
document.addEventListener('submit', (ev) => {
  if (ev.target.id === 'livre-form') {
    ev.preventDefault();
    saveForm();
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
// Créer un livre (ST2, §4)
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
    $('creer-erreurs').innerHTML = (r.erreurs ?? []).map((e) => `<li class="err-t">${h(e)}</li>`).join('');
  }, 250);
}

$('creer').addEventListener('input', (ev) => {
  const f = $('creer').elements;
  if (ev.target.name === 'dossier') createNameEdited = f.dossier.value.trim() !== '';
  if (ev.target.name === 'bookId' && !createNameEdited) f.dossier.value = f.bookId.value.trim();
  validateCreateSoon();
});

$('creer-livre').addEventListener('toggle', () => {
  fillCreateDefaults();
  if ($('creer-livre').open) validateCreateSoon();
});

$('creer').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const v = createValues();
  const r = await act('creerLivre', { ...v, dossier: v.dossier || v.livre.bookId.trim() });
  if (r.erreurs) $('creer-erreurs').innerHTML = r.erreurs.map((e) => `<li class="err-t">${h(e)}</li>`).join('');
  if (r.ok) {
    $('creer').reset();
    createFilled = false;
    createNameEdited = false;
    $('creer-livre').open = false;
    $('creer-erreurs').innerHTML = '';
  }
});

/** Dossier sans book.json à l'ouverture : formulaire de création prérempli (« Créer un livre ici »). */
function offerCreateHere(c) {
  const d = $('creer-livre');
  d.open = true;
  fillCreateDefaults();
  const f = $('creer').elements;
  f.parent.value = c.parent;
  f.dossier.value = c.name;
  createNameEdited = true;
  d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast(`« Créer un livre ici » : ${c.parent} → ${c.name}`);
  validateCreateSoon();
}

// ---------------------------------------------------------------------------------------------------------
// Blender (ST2, §8)
// ---------------------------------------------------------------------------------------------------------

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
  $('blender-exe-etat').innerHTML = !bl.exe
    ? `<span class="warn-t">non réglé</span>${S.studio.windows ? ' : « Détecter » cherche dans C:\\Program Files\\Blender Foundation\\Blender &lt;version&gt;\\' : ''}`
    : bl.exeOk ? '<span class="ok-t">trouvé</span>' : '<span class="err-t">introuvable</span>';
  $('blender-gabarit-etat').innerHTML = !bl.gabarit
    ? '<span class="muted">aucun gabarit : rien n’est créé à l’ajout d’une scène</span>'
    : bl.gabaritOk ? '<span class="ok-t">trouvé</span>' : '<span class="err-t">introuvable</span>';
  for (const b of document.querySelectorAll('[data-quoi]')) b.hidden = !S.studio.windows;
}

$('blender-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target.elements;
  blenderKey = null;
  act('blender', { exe: f.exe.value, gabarit: f.gabarit.value });
});

// ---------------------------------------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------------------------------------

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
  renderTabs();
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
// Événements
// ---------------------------------------------------------------------------------------------------------

const CONFIRMS = {
  quitter: () => 'Arrêter tous les processus gérés (atelier, lecteur de développement, serveur de test, tâches) et quitter le studio ?',
  suite: () => 'Suite complète : livre de test, build --part-mib 1, puis test:install (environ 9 min sous Windows). Le serveur de test et le lecteur de développement sont arrêtés ; out/ contiendra ensuite le livre de test. Lancer ?',
  build: () => {
    const live = ['serveur-test', 'dev'].filter((n) => isRunning(byName(n))).map((n) => byName(n).label);
    return live.length ? `Le build arrête d’abord : ${live.join(', ')}, puis supprime out/ et .next/. Continuer ?` : null;
  },
  arreterRestes: () => 'Arrêter les processus restés d’un studio précédent (arbre complet) ?',
  arreterPid: () => 'Arrêter ce processus (arbre complet) ?',
};

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === 'journal') return selectJournal(b.dataset.nom);
  // Formulaire de book.json (dans la page, rien n'est écrit avant « Enregistrer »).
  if (a === 'ajouterScene') return addScene();
  if (a === 'monterScene' || a === 'descendreScene') {
    const i = Number(b.dataset.i);
    return moveScene(i, a === 'monterScene' ? i - 1 : i + 1);
  }
  if (a === 'retirerScene') {
    F.values.scenes.splice(Number(b.dataset.i), 1);
    renderSceneList();
    return formEdited();
  }
  if (a === 'reprendre') {
    if (formDirty() && !window.confirm('Abandonner les modifications du formulaire et reprendre book.json du disque ?')) return;
    return loadForm();
  }
  if (a === 'parcourir' && b.dataset.quoi) {
    toast('boîte de dialogue ouverte (elle peut apparaître derrière le navigateur)');
    const r = await act('parcourir', { quoi: b.dataset.quoi });
    if (!r.chemin) return;
    const target = { 'creer-parent': $('creer').elements.parent, 'blender-exe': $('blender-form').elements.exe, 'blender-gabarit': $('blender-form').elements.gabarit }[b.dataset.cible];
    if (target) {
      target.value = r.chemin;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return;
  }
  const ask = a === 'demarrer' ? CONFIRMS[b.dataset.nom] : CONFIRMS[a];
  const q = ask?.();
  if (q && !window.confirm(q)) return;
  if (a === 'parcourir') {
    toast('boîte de dialogue ouverte (elle peut apparaître derrière le navigateur)');
    const r = await act('parcourir');
    if (r.chemin) {
      $('chemin').value = r.chemin;
      await openBook(r.chemin);
    }
    return;
  }
  if (a === 'ouvrir') return openBook(b.dataset.chemin);
  const extra = {};
  if (b.dataset.nom) extra.nom = b.dataset.nom;
  if (b.dataset.chemin) extra.chemin = b.dataset.chemin;
  if (b.dataset.pid) extra.pid = Number(b.dataset.pid);
  if (b.dataset.scene) extra.scene = b.dataset.scene;
  if (a === 'demarrer' && b.dataset.nom) selectJournal(b.dataset.nom);
  if (a === 'detecterBlender') blenderKey = null;
  await act(a, extra);
});

/** Ouvrir un livre ; formulaire non enregistré : confirmation ; dossier sans book.json : « Créer un livre ici ». */
async function openBook(chemin) {
  if (formDirty() && !window.confirm('Le formulaire de book.json a des modifications non enregistrées. Ouvrir un autre livre quand même ?')) return;
  const r = await act('ouvrir', { chemin });
  if (r.creer) offerCreateHere(r.creer);
}

$('ouvrir').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const chemin = $('chemin').value.trim();
  if (chemin) openBook(chemin);
});

$('ports').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  act('ports', { ports: { atelier: Number(f.elements.atelier.value), dev: Number(f.elements.dev.value), test: Number(f.elements.test.value) } }).then(() => {
    portsFilled = false;
  });
});

// Durées en direct.
setInterval(() => {
  for (const el of document.querySelectorAll('.t-dur')) {
    if (el.dataset.end) continue;
    el.textContent = dur(Date.now() - Number(el.dataset.start));
  }
}, 1000);

// Flux d'événements. Le navigateur abandonne parfois la reconnexion quand le studio est arrêté (connexion refusée) :
// la page la relance elle-même toutes les secondes, y compris après « Tout arrêter et quitter ». Un studio relancé retrouve
// donc cet onglet (il n'en ouvre pas un autre).
let es = null;
let retryTimer = null;

function reconnectSoon() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, 1000);
}

function connect() {
  if (es) es.close();
  es = new EventSource('/__studio/events');
  es.addEventListener('etat', (e) => {
    const next = JSON.parse(e.data);
    if (next.marker !== STUDIO_MARKER) return;
    const restarted = S && S.studio.pid !== next.studio.pid;
    S = next;
    if (stopped || restarted) {
      stopped = false;
      $('fin').hidden = true;
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
    $('fin').hidden = false;
    es.close();
    reconnectSoon();
  });
  es.addEventListener('open', () => {
    $('top-pid').classList.remove('err-t');
    selectJournal(journalName);
  });
  es.onerror = () => {
    if (!stopped && S) {
      $('top-pid').textContent = 'studio injoignable : reconnexion…';
      $('top-pid').classList.add('err-t');
    }
    if (es.readyState === EventSource.CLOSED) reconnectSoon();
  };
}

connect();
