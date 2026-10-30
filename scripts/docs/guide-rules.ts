// scripts/docs/guide-rules.ts — guides de l'atelier et du studio (lot GD) : en-tête d'un guide et règles d'écriture.
// Fonctions pures, sans navigateur : lues par build-guide.ts (npm run docs:pdf) et testées par test-docs.ts (npm run test:docs).
//
// En-tête (front matter) d'un guide, entre deux lignes « --- » en tête du fichier, une clé par ligne :
//   titre: Studio GLBI                                   titre de la couverture
//   surtitre: Studio de fabrication · GLBInterpreter     petite ligne au-dessus du titre
//   sous-titre: Guide d'utilisation : …                  ligne sous le titre
//   pastilles: Studio | GLBInterpreter 3fbc2f1 | 30/10/2026   pastilles du bas de la couverture, séparées par « | »
//   pied: Studio GLBI · Guide d'utilisation              texte du pied de page (le numéro de page est ajouté)
//   parties:                                             une partie par ligne « - Nom | #couleur | sections »
//     - Prendre en main | #2563eb | 1-3                  sections : « 4 » ou « 1-3 » ; toutes les sections couvertes, dans l'ordre
// Rien de propre à un guide ne vit dans le code : tout passe par cet en-tête.
//
// Règles d'écriture (contrôlées avant tout rendu ; une erreur arrête le générateur avec le numéro de ligne) :
//   1. sections « ## N. Titre », numérotées 1, 2, 3… ; sous-sections « ### N.n Titre », n = 1, 2… dans la section N ;
//      aucun titre de niveau 4 ou plus ;
//   2. sous-listes indentées de 4 espaces (0, 4, 8…), jamais de tabulation ;
//   3. aucun tableau dans une liste (ni indenté, ni collé sous un élément de liste) ;
//   4. une ligne vide avant chaque liste.
// Les blocs de code (```) ne sont pas contrôlés.

export interface GuidePart {
  name: string;
  color: string;
  from: number;
  to: number;
}

export interface GuideMeta {
  titre: string;
  surtitre: string;
  sousTitre: string;
  pastilles: string[];
  pied: string;
  parties: GuidePart[];
}

export interface GuideIssue {
  /** Numéro de ligne dans le fichier .md (1 = première ligne). */
  line: number;
  message: string;
}

export interface ParsedGuide {
  meta: GuideMeta | null;
  /** Corps du guide (après l'en-tête), et numéro de sa première ligne dans le fichier. */
  body: string;
  bodyLine: number;
  issues: GuideIssue[];
}

const KEYS = ['titre', 'surtitre', 'sous-titre', 'pastilles', 'pied', 'parties'] as const;
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Lit l'en-tête et contrôle le corps. `issues` vide : guide conforme. */
export function parseGuide(text: string): ParsedGuide {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const issues: GuideIssue[] = [];
  if (lines[0] !== '---') {
    return { meta: null, body: lines.join('\n'), bodyLine: 1, issues: [{ line: 1, message: 'en-tête absent : le guide doit commencer par une ligne « --- » (titre, pastilles, pied, parties)' }] };
  }
  const end = lines.indexOf('---', 1);
  if (end < 0) return { meta: null, body: '', bodyLine: 1, issues: [{ line: 1, message: 'en-tête non fermé : ligne « --- » de fin introuvable' }] };

  const raw: Record<string, string> = {};
  const parts: { text: string; line: number }[] = [];
  let inParts = false;
  for (let i = 1; i < end; i++) {
    const l = lines[i];
    const n = i + 1;
    if (!l.trim()) continue;
    const item = l.match(/^ {2}- (.+)$/);
    if (inParts && item) {
      parts.push({ text: item[1], line: n });
      continue;
    }
    const kv = l.match(/^([a-z-]+):(?: (.*))?$/);
    if (!kv) {
      issues.push({ line: n, message: `en-tête : ligne non reconnue « ${l.trim()} » (forme attendue « clé: valeur »)` });
      continue;
    }
    const [, key, value = ''] = kv;
    if (!(KEYS as readonly string[]).includes(key)) {
      issues.push({ line: n, message: `en-tête : clé « ${key} » inconnue (clés : ${KEYS.join(', ')})` });
      continue;
    }
    if (key in raw) issues.push({ line: n, message: `en-tête : clé « ${key} » en double` });
    raw[key] = value.trim();
    inParts = key === 'parties';
  }
  for (const key of KEYS) {
    if (key === 'parties' ? !parts.length : !raw[key]) issues.push({ line: 1, message: `en-tête : « ${key} » manquant ou vide` });
  }
  const parties: GuidePart[] = [];
  for (const p of parts) {
    const f = p.text.split('|').map((s) => s.trim());
    const range = f[2]?.match(/^(\d+)(?:-(\d+))?$/);
    if (f.length !== 3 || !f[0] || !COLOR.test(f[1] ?? '') || !range) {
      issues.push({ line: p.line, message: `en-tête : partie « ${p.text} » : forme attendue « Nom | #rrggbb | 1-3 »` });
      continue;
    }
    const from = Number(range[1]);
    const to = Number(range[2] ?? range[1]);
    if (to < from) issues.push({ line: p.line, message: `en-tête : partie « ${f[0]} » : sections ${from}-${to} à l'envers` });
    parties.push({ name: f[0], color: f[1].toLowerCase(), from, to });
  }
  const meta: GuideMeta = {
    titre: raw.titre ?? '',
    surtitre: raw.surtitre ?? '',
    sousTitre: raw['sous-titre'] ?? '',
    pastilles: (raw.pastilles ?? '').split('|').map((s) => s.trim()).filter(Boolean),
    pied: raw.pied ?? '',
    parties,
  };
  const body = lines.slice(end + 1).join('\n');
  const bodyLine = end + 2;
  const sections = checkBody(body, bodyLine, issues);
  checkParts(parties, sections, parts.map((p) => p.line), issues);
  issues.sort((a, b) => a.line - b.line);
  return { meta, body, bodyLine, issues };
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])(\s+|$)/;
const isTableRow = (l: string) => /^\s*\|/.test(l);

/** Règles 1 à 4 sur le corps ; renvoie les numéros de section trouvés (avec leur ligne). */
function checkBody(body: string, first: number, issues: GuideIssue[]): { num: number; line: number }[] {
  const lines = body.split('\n');
  const sections: { num: number; line: number }[] = [];
  let fence = false;
  let section = 0;
  let sub = 0;
  /** Une liste est en cours : élément de liste, ou ligne de suite indentée sans ligne vide depuis. */
  let inList = false;
  let lastIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const n = first + i;
    const prev = i > 0 ? lines[i - 1] : '';
    if (/^\s*(```|~~~)/.test(l)) {
      fence = !fence;
      inList = inList && /^\s/.test(l);
      continue;
    }
    if (fence) continue;
    if (!l.trim()) {
      // Une ligne vide ne termine la liste que si la ligne suivante n'est ni un élément ni une suite indentée.
      const next = lines.slice(i + 1).find((x) => x.trim()) ?? '';
      if (!LIST_ITEM.test(next) && !/^ {2,}\S/.test(next)) {
        inList = false;
        lastIndent = -1;
      }
      continue;
    }

    // Règle 1 : titres.
    const head = l.match(/^(#{1,6})\s+(.*)$/);
    if (head) {
      const level = head[1].length;
      const text = head[2];
      inList = false;
      lastIndent = -1;
      if (level === 2) {
        const m = text.match(/^(\d+)\. \S/);
        if (!m) {
          issues.push({ line: n, message: `titre de section « ## ${text} » : forme attendue « ## N. Titre »` });
        } else {
          const num = Number(m[1]);
          if (num !== section + 1) issues.push({ line: n, message: `section n° ${num} : n° ${section + 1} attendu (sections numérotées 1, 2, 3… dans l'ordre)` });
          section = num;
          sub = 0;
          sections.push({ num, line: n });
        }
      } else if (level === 3) {
        const m = text.match(/^(\d+)\.(\d+) \S/);
        if (!m) {
          issues.push({ line: n, message: `titre de sous-section « ### ${text} » : forme attendue « ### N.n Titre »` });
        } else {
          const [s, k] = [Number(m[1]), Number(m[2])];
          if (s !== section) issues.push({ line: n, message: `sous-section ${s}.${k} dans la section ${section} : « ### ${section}.${sub + 1} … » attendu` });
          else if (k !== sub + 1) issues.push({ line: n, message: `sous-section ${s}.${k} : ${section}.${sub + 1} attendue (numérotées dans l'ordre)` });
          sub = k;
        }
      } else if (level >= 4) {
        issues.push({ line: n, message: `titre de niveau ${level} : non admis (sections ## et sous-sections ### seulement)` });
      } else if (section > 0) {
        issues.push({ line: n, message: 'titre de niveau 1 après le début des sections : un seul « # Titre », en tête du guide' });
      }
      continue;
    }

    // Règle 2 : tabulation en début de ligne.
    if (/^ *\t/.test(l)) issues.push({ line: n, message: 'tabulation en début de ligne : indenter avec des espaces (sous-listes à 4 espaces)' });

    // Règle 3 : tableau dans une liste.
    if (isTableRow(l)) {
      if (/^\s+\|/.test(l)) {
        if (!isTableRow(prev)) issues.push({ line: n, message: 'tableau dans une liste (ligne indentée) : le sortir de la liste, sans indentation, après une ligne vide' });
      } else if (inList && !isTableRow(prev)) {
        issues.push({ line: n, message: 'tableau collé sous une liste : laisser une ligne vide entre la liste et le tableau' });
      }
      continue;
    }

    const item = l.match(LIST_ITEM);
    if (item) {
      const indent = item[1].replace(/\t/g, '    ').length;
      // Règle 2 : indentation des sous-listes.
      if (indent % 4 !== 0) {
        issues.push({ line: n, message: `élément de liste indenté de ${indent} espace(s) : sous-listes indentées de 4 espaces (0, 4, 8…)` });
      } else if (indent > lastIndent + 4) {
        issues.push({ line: n, message: `élément de liste indenté de ${indent} espaces sous un élément à ${Math.max(lastIndent, 0)} : un seul niveau de plus à la fois (4 espaces)` });
      }
      // Règle 4 : une ligne vide avant chaque liste.
      if (!inList && prev.trim()) {
        issues.push({ line: n, message: `liste sans ligne vide avant (ligne précédente : « ${prev.trim().slice(0, 50)} »)` });
      }
      inList = true;
      lastIndent = indent;
      continue;
    }
    // Suite indentée d'un élément : la liste continue. Paragraphe à la colonne 0 après une ligne vide : la liste est finie.
    if (!/^\s/.test(l) && !prev.trim()) {
      inList = false;
      lastIndent = -1;
    }
  }
  if (fence) issues.push({ line: first + lines.length - 1, message: 'bloc de code (```) non fermé' });
  return sections;
}

/** Parties de l'en-tête : couvrent toutes les sections du guide, dans l'ordre, sans trou ni recouvrement. */
function checkParts(parties: GuidePart[], sections: { num: number; line: number }[], lines: number[], issues: GuideIssue[]): void {
  if (!parties.length || !sections.length) return;
  let expected = 1;
  parties.forEach((p, i) => {
    if (p.from !== expected) issues.push({ line: lines[i], message: `en-tête : partie « ${p.name} » commence à la section ${p.from} : section ${expected} attendue (sans trou ni recouvrement)` });
    expected = p.to + 1;
  });
  const last = sections[sections.length - 1].num;
  const covered = parties[parties.length - 1].to;
  if (covered !== last) {
    issues.push({ line: lines[lines.length - 1], message: `en-tête : les parties s'arrêtent à la section ${covered}, le guide en a ${last}` });
  }
}

/** Partie d'une section (null : hors des parties, déjà signalé par checkParts). */
export function partOf(parties: GuidePart[], num: number): { index: number; part: GuidePart } | null {
  const index = parties.findIndex((p) => num >= p.from && num <= p.to);
  return index < 0 ? null : { index, part: parties[index] };
}

/** Couleur claire d'une partie : la couleur mêlée de blanc (pastilles, sommaire). */
export function lighten(color: string, keep = 0.16): string {
  const c = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return `#${c.map((v) => Math.round(255 - (255 - v) * keep).toString(16).padStart(2, '0')).join('')}`;
}

/** Message d'erreur en français, une ligne par règle enfreinte. */
export function formatIssues(file: string, issues: GuideIssue[]): string {
  return issues.map((i) => `${file}:${i.line} : ${i.message}`).join('\n');
}
