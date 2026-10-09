// Chemins d'assets relatifs à la racine du livre (D-8.1, Î5). Le livre est une page unique à la racine de son
// dossier (D-8.4) : un chemin relatif se résout donc toujours depuis cette racine, sous `/` comme sous `/<dépôt>/`.
// Aucune URL distante : les assets font partie du dossier du livre (exigence 0).
export function getAssetUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) {
    throw new Error(`getAssetUrl : URL absolue refusée (« ${path} ») ; les assets sont dans le dossier du livre`);
  }
  return path.replace(/^(\.\/|\/)+/, '');
}
