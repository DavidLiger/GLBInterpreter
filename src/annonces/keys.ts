// Clés publiques du flux d'annonces (AN1, spec-annonces.md §3, §6, DP-17). ECDSA P-256, clé au format SPKI en base64
// (`crypto.subtle.exportKey("spki", …)`). Deux clés : la courante, puis la clé de secours ; le flux désigne la sienne par
// `keyId`. Écrites par le studio (AN2), qui génère les clés privées hors du repo.
// Liste vide (décision de David du 30/10, question 1 d'AN1) : la fonction est inerte, aucune requête n'est faite et le
// réglage n'apparaît pas dans la fenêtre Informations. Les clés de test ne sont jamais ici : elles ne sont compilées que
// dans le build du livre de test (GLBI_ANNONCES_TEST=1, voir config.ts).

export interface AnnonceKey {
  keyId: string;
  /** Clé publique ECDSA P-256, SPKI en base64. */
  spki: string;
}

export const ANNONCES_KEYS: readonly AnnonceKey[] = [];
