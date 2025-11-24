// Helper pour construire les URLs des assets depuis R2
const R2_BASE_URL = 'https://webdiorama-proxy.david-liger-pro.workers.dev/assets/home';

export function getAssetUrl(filename: string): string {
  // Si l'URL commence déjà par http, on la retourne telle quelle
  if (filename.startsWith('http')) {
    return filename;
  }
  
  // Enlever le / au début et /images/ si présent
  let cleanPath = filename.replace(/^\//, '');
  cleanPath = cleanPath.replace(/^images\//, '');
  
  // Préfixer avec l'URL R2
  return `${R2_BASE_URL}/${cleanPath}`;
}