// Studio GLBI (ST1) : page locale servie par scripts/studio/server.ts. JS sans framework.
// État reçu par le flux /__studio/events (événements `etat`, `journal`, `bye`) ; toute action par POST /__studio/action
// (JSON, en-tête x-glbi-studio). Marqueur du studio (contrôle de fin de build) : glbi-studio-st1.
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

async function act(action, extra = {}) {
  let r;
  try {
    const res = await fetch('/__studio/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-glbi-studio': '1' },
      body: JSON.stringify({ action, ...extra }),
    });
    r = await res.json().catch(() => ({ ok: false, error: `réponse ${res.status}` }));
  } catch {
    r = { ok: false, error: 'studio injoignable' };
  }
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
    ${b.errors.length ? `<ul class="checklines">${b.errors.map((e) => `<li class="err-t">${h(e)}</li>`).join('')}</ul>` : ''}`;
  const rows = b.scenes.map((s) => {
    let check = '<span class="muted">—</span>';
    if (s.check) {
      const parts = [];
      if (s.check.errors) parts.push(`<span class="err-t">${s.check.errors} erreur(s)</span>`);
      if (s.check.warnings) parts.push(`<span class="warn-t">${s.check.warnings} avert.</span>`);
      check = parts.length ? parts.join(' ') : '<span class="ok-t">aucun message</span>';
    }
    return `<tr><td class="mono">${h(s.id)}</td><td>${cell(s.glb, 'GLB')}</td><td>${cell(s.edit, 'edit.json')}</td>
      <td>${s.blend.present ? `<span class="ok-t">${h(s.id)}.blend</span>` : '<span class="absent">absent</span>'}</td><td>${check}</td></tr>`;
  });
  $('scenes').innerHTML = b.scenes.length
    ? `<table><thead><tr><th>Scène</th><th>scenes/&lt;id&gt;.glb</th><th>scenes/&lt;id&gt;.edit.json</th><th>blender/&lt;id&gt;.blend</th><th>Dernier book:check</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
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
}

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
  const ask = a === 'demarrer' ? CONFIRMS[b.dataset.nom] : CONFIRMS[a];
  const q = ask?.();
  if (q && !window.confirm(q)) return;
  if (a === 'parcourir') {
    toast('boîte de dialogue ouverte (elle peut apparaître derrière le navigateur)');
    const r = await act('parcourir');
    if (r.chemin) {
      $('chemin').value = r.chemin;
      await act('ouvrir', { chemin: r.chemin });
    }
    return;
  }
  const extra = {};
  if (b.dataset.nom) extra.nom = b.dataset.nom;
  if (b.dataset.chemin) extra.chemin = b.dataset.chemin;
  if (b.dataset.pid) extra.pid = Number(b.dataset.pid);
  if (a === 'demarrer' && b.dataset.nom) selectJournal(b.dataset.nom);
  await act(a, extra);
});

$('ouvrir').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const chemin = $('chemin').value.trim();
  if (chemin) act('ouvrir', { chemin });
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
