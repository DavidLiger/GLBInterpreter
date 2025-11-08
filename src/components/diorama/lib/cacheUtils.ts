// lib/cacheUtils.ts

import type { DioramaConfig3DWithVideos } from "@/types/diorama";

/**
 * Ajoute un cache buster à une URL
 */
export function addCacheBuster(url: string | undefined): string | undefined {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
}

/**
 * Applique des cache busters aux URLs critiques de la config
 */
export function applyCacheBustersToConfig(
  config: DioramaConfig3DWithVideos
): DioramaConfig3DWithVideos {
  const processedConfig = { ...config };
  
  // Ajouter cache buster au GLB
  if (processedConfig.glb) {
    processedConfig.glb = addCacheBuster(processedConfig.glb)!;
  }
  
  // Ajouter cache buster à l'image de loader
  if (processedConfig.loaderImage) {
    processedConfig.loaderImage = addCacheBuster(processedConfig.loaderImage);
  }
  
  // Ajouter cache buster aux vidéos
  if (processedConfig.videos && Array.isArray(processedConfig.videos)) {
    processedConfig.videos = processedConfig.videos.map((video) => ({
      ...video,
      src: addCacheBuster(video.src)!,
    }));
  }
  
  // Ajouter cache buster aux assets des POIs (sons, icônes, etc.)
  if (processedConfig.pois && Array.isArray(processedConfig.pois)) {
    processedConfig.pois = processPOIs(processedConfig.pois);
  }
  
  return processedConfig;
}

/**
 * Traite récursivement les POIs pour ajouter cache busters
 */
function processPOIs(pois: any[]): any[] {
  return pois.map(poi => {
    const processed = { ...poi };
    
    if (processed.icon) {
      processed.icon = addCacheBuster(processed.icon);
    }
    
    if (processed.ambientSound) {
      processed.ambientSound = addCacheBuster(processed.ambientSound);
    }
    
    if (processed.sceneSound) {
      processed.sceneSound = addCacheBuster(processed.sceneSound);
    }
    
    // Traiter les enfants récursivement
    if (processed.children && Array.isArray(processed.children)) {
      processed.children = processPOIs(processed.children);
    }
    
    return processed;
  });
}