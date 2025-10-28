// hooks/useSecureAsset.ts
import { useCallback, useRef } from 'react';

interface TokenCache {
  [path: string]: {
    token: string;
    expiresAt: number;
  };
}

export function useSecureAsset() {
  const tokenCache = useRef<TokenCache>({});

  /**
   * ✅ Obtenir un token pour un asset (avec cache)
   */
  const getToken = useCallback(async (assetPath: string): Promise<string> => {
    // Vérifier si on a un token valide en cache
    const cached = tokenCache.current[assetPath];
    if (cached && cached.expiresAt > Date.now() + 30000) { // 30s de marge
      return cached.token;
    }

    // Sinon, demander un nouveau token
    try {
      const response = await fetch('/api/auth/asset-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: assetPath }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.status}`);
      }

      const data = await response.json();
      
      // Mettre en cache
      tokenCache.current[assetPath] = {
        token: data.token,
        expiresAt: data.expiresAt,
      };

      return data.token;
    } catch (error) {
      console.error('Error getting asset token:', error);
      throw error;
    }
  }, []);

  /**
   * ✅ Fetcher un asset sécurisé
   */
  const fetchAsset = useCallback(async (assetPath: string): Promise<Response> => {
    const token = await getToken(assetPath);
    
    const response = await fetch(`/api/assets/${assetPath}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch asset: ${response.status}`);
    }

    return response;
  }, [getToken]);

  /**
   * ✅ Obtenir une URL sécurisée avec token (pour Three.js loaders)
   */
  const getSecureUrl = useCallback(async (assetPath: string): Promise<string> => {
    const token = await getToken(assetPath);
    return `/api/assets/${assetPath}?token=${encodeURIComponent(token)}`;
  }, [getToken]);

  return {
    fetchAsset,
    getSecureUrl,
    getToken,
  };
}