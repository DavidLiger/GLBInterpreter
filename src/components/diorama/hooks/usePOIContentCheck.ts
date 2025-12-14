// src/components/diorama/hooks/usePOIContentCheck.ts

import { useState, useEffect } from 'react';

interface ContentManifest {
  poisWithContent: string[];
}

interface UsePOIContentCheckOptions {
  sceneId?: string; // Pour supporter plusieurs scènes
  enabled?: boolean; // Pour activer/désactiver
}

export function usePOIContentCheck(options: UsePOIContentCheckOptions = {}) {
  const { sceneId = 'folio', enabled = true } = options;
  const isFolioMode = process.env.NEXT_PUBLIC_SITE_TYPE === 'folio';
  
  const [poisWithContent, setPoisWithContent] = useState<Set<string>>(new Set());
  const [contentChecked, setContentChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFolioMode || !enabled) {
      setContentChecked(true);
      return;
    }

    const loadManifest = async () => {
      setLoading(true);
      setError(null);
      
      const baseUrl = "https://webdiorama-proxy.david-liger-pro.workers.dev/assets";
      
      try {
        // ✅ Support pour plusieurs scènes : /assets/{sceneId}/content/manifest.json
        const response = await fetch(`${baseUrl}/${sceneId}/content/manifest.json`);
        
        if (response.ok) {
          const manifest = await response.json() as ContentManifest;
          const available = new Set<string>(manifest.poisWithContent || []);
          console.log(`✅ POIs avec contenu (${sceneId}):`, Array.from(available));
          setPoisWithContent(available);
        } else {
          console.warn(`⚠️ Manifest introuvable pour ${sceneId}`);
          setPoisWithContent(new Set<string>());
        }
      } catch (err) {
        console.error(`❌ Erreur chargement manifest (${sceneId}):`, err);
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setPoisWithContent(new Set<string>());
      } finally {
        setLoading(false);
        setContentChecked(true);
      }
    };

    loadManifest();
  }, [isFolioMode, enabled, sceneId]);

  return {
    poisWithContent,
    contentChecked,
    loading,
    error,
    hasPOIContent: (poiId: string) => poisWithContent.has(poiId),
  };
}