import { openDB, IDBPDatabase } from 'idb';

interface DownloadTask {
  id: string;
  url: string;
  type: 'glb' | 'video' | 'audio' | 'image';
  size: number;
  downloaded: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  chunks: Uint8Array[];
  checksum?: string;
}

interface DownloadProgress {
  taskId: string;
  progress: number;
  speed: number;
  eta: number;
}

interface IndexEntry {
  path: string;
  token: string;
}

interface BookIndex {
  [key: string]: IndexEntry;
}

interface BookAsset {
  url: string;
  type: 'glb' | 'video' | 'audio' | 'image';
  taskId: string;
  size: number;
}

class DownloadManager {
  private db!: IDBPDatabase;
  private activeTasks = new Map<string, AbortController>();
  private progressCallbacks = new Map<string, (progress: DownloadProgress) => void>();

  async init() {
    this.db = await openDB('webdiorama-downloads', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('chunks')) {
          db.createObjectStore('chunks', { keyPath: 'taskId' });
        }
      },
    });
  }

  /**
   * Vérifier le quota de stockage disponible
   */
  async checkStorageQuota(): Promise<{ quota: number; usage: number; available: number } | null> {
    if (!('storage' in navigator && 'estimate' in navigator.storage)) {
      console.warn("⚠️ Storage API non supportée");
      return null;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota || 0;
      const usage = estimate.usage || 0;
      const available = quota - usage;

      console.log(`💾 Stockage: ${(available / 1024 / 1024).toFixed(0)} MB disponibles sur ${(quota / 1024 / 1024).toFixed(0)} MB`);

      return { quota, usage, available };
    } catch (err) {
      console.error("❌ Erreur vérification stockage:", err);
      return null;
    }
  }

  async downloadAsset(
    taskId: string,
    url: string,
    type: DownloadTask['type'],
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<Blob> {
    const abortController = new AbortController();
    this.activeTasks.set(taskId, abortController);

    if (onProgress) {
      this.progressCallbacks.set(taskId, onProgress);
    }

    const existingTask = await this.db.get('tasks', taskId);
    if (existingTask?.status === 'completed') {
      console.log(`✅ Asset ${taskId} déjà téléchargé`);
      const chunks = await this.db.get('chunks', taskId);
      return new Blob(chunks.data as BlobPart[]);
    }

    const task: DownloadTask = existingTask || {
      id: taskId,
      url,
      type,
      size: 0,
      downloaded: 0,
      status: 'pending',
      chunks: [],
    };

    try {
      task.status = 'downloading';
      await this.db.put('tasks', task);

      let attempt = 0;
      const maxRetries = 3;

      while (attempt < maxRetries) {
        try {
          const response = await fetch(url, {
            signal: abortController.signal,
            headers: task.downloaded > 0 ? { Range: `bytes=${task.downloaded}-` } : {},
          });

          if (!response.ok && response.status !== 206) {
            throw new Error(`HTTP ${response.status}`);
          }

          const contentLength = parseInt(response.headers.get('content-length') || '0');
          task.size = contentLength || task.size;

          const reader = response.body!.getReader();
          const chunks: Uint8Array[] = [...task.chunks];
          let receivedLength = task.downloaded;
          const startTime = Date.now();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            receivedLength += value.length;
            task.downloaded = receivedLength;

            const elapsedTime = (Date.now() - startTime) / 1000;
            const speed = receivedLength / elapsedTime;
            const remaining = task.size - receivedLength;
            const eta = remaining / speed;

            if (onProgress) {
              onProgress({
                taskId,
                progress: task.size > 0 ? (receivedLength / task.size) * 100 : 0,
                speed,
                eta,
              });
            }

            if (receivedLength % (1024 * 1024) < value.length) {
              await this.db.put('chunks', { taskId, data: chunks });
              await this.db.put('tasks', task);
            }
          }

          task.status = 'completed';
          task.chunks = chunks;
          await this.db.put('chunks', { taskId, data: chunks });
          await this.db.put('tasks', task);

          console.log(`✅ ${taskId} téléchargé (${(task.size / 1024 / 1024).toFixed(2)} MB)`);

          return new Blob(chunks as BlobPart[]);
        } catch (err: any) {
          if (err.name === 'AbortError') {
            task.status = 'cancelled';
            await this.db.put('tasks', task);
            // throw new Error('Téléchargement annulé');
          }

          attempt++;
          console.warn(`⚠️ Tentative ${attempt}/${maxRetries} échouée:`, err);

          if (attempt >= maxRetries) {
            task.status = 'failed';
            await this.db.put('tasks', task);
            throw err;
          }

          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 8000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      throw new Error('Max retries reached');
    } finally {
      this.activeTasks.delete(taskId);
      this.progressCallbacks.delete(taskId);
    }
  }

  async cancelDownload(taskId: string) {
    const controller = this.activeTasks.get(taskId);
    if (controller) {
      controller.abort();
    }

    const task = await this.db.get('tasks', taskId);
    if (task) {
      task.status = 'cancelled';
      await this.db.put('tasks', task);
    }
  }

  async cleanup(taskId: string) {
    await this.db.delete('tasks', taskId);
    await this.db.delete('chunks', taskId);
  }

  async isAssetCached(taskId: string): Promise<boolean> {
    const task = await this.db.get('tasks', taskId);
    return task?.status === 'completed';
  }

  async getAssetFromCache(taskId: string): Promise<Blob | null> {
    const task = await this.db.get('tasks', taskId);
    if (task?.status !== 'completed') return null;

    const chunks = await this.db.get('chunks', taskId);
    return new Blob(chunks.data as BlobPart[]);
  }
}

/**
 * Récupérer TOUS les assets du livre (toutes scènes)
 */
export async function getBookManifest(bookId: string): Promise<BookAsset[]> {
  const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL;
  const allAssets: BookAsset[] = [];

  try {
    const indexRes = await fetch(`${baseUrl}/assets/${bookId}/index.json`);
    if (!indexRes.ok) throw new Error(`Index HTTP ${indexRes.status}`);
    
    const index = await indexRes.json() as BookIndex; // ✅ Cast explicite

    for (const [sceneId, entry] of Object.entries(index)) {
      const configRes = await fetch(`${baseUrl}/assets/${bookId}/${entry.path}`);
      if (!configRes.ok) {
        console.warn(`⚠️ Impossible de charger ${sceneId}`);
        continue;
      }
      
      const config = await configRes.json();

      if (config.glb) {
        allAssets.push({
          url: config.glb,
          type: 'glb',
          taskId: `${bookId}-${sceneId}-glb`,
          size: 50 * 1024 * 1024, // ✅ Estimer (15 MB par exemple)
        });
      }

      if (config.loaderImage) {
        allAssets.push({
          url: config.loaderImage,
          type: 'image',
          taskId: `${bookId}-${sceneId}-loader`,
          size: 200 * 1024, // ✅ 200 KB
        });
      }

      const extractFromPOI = (poi: any, poiPath: string) => {
        if (poi.icon) {
          allAssets.push({
            url: poi.icon,
            type: 'image',
            taskId: `${bookId}-${sceneId}-${poiPath}-icon`,
            size: 50 * 1024, // ✅ 50 KB
          });
        }

        if (poi.ambientSound) {
          allAssets.push({
            url: poi.ambientSound,
            type: 'audio',
            taskId: `${bookId}-${sceneId}-${poiPath}-ambient`,
            size: 2 * 1024 * 1024, // ✅ 2 MB
          });
        }

        if (poi.sceneSound) {
          allAssets.push({
            url: poi.sceneSound,
            type: 'audio',
            taskId: `${bookId}-${sceneId}-${poiPath}-scene`,
            size: 3 * 1024 * 1024, // ✅ 3 MB
          });
        }

        poi.dialogue?.characters?.forEach((char: any, i: number) => {
          if (char.image) {
            allAssets.push({
              url: char.image,
              type: 'image',
              taskId: `${bookId}-${sceneId}-${poiPath}-char-${i}`,
              size: 100 * 1024, // ✅ 100 KB
            });
          }
        });

        if (poi.effects?.particles?.texture) {
          allAssets.push({
            url: poi.effects.particles.texture,
            type: 'image',
            taskId: `${bookId}-${sceneId}-${poiPath}-particle`,
            size: 500 * 1024, // ✅ 500 KB
          });
        }

        if (poi.effects?.skybox?.texture) {
          allAssets.push({
            url: poi.effects.skybox.texture,
            type: 'image',
            taskId: `${bookId}-${sceneId}-${poiPath}-skybox`,
            size: 2 * 1024 * 1024, // ✅ 2 MB
          });
        }

        if (poi.children) {
          poi.children.forEach((child: any, i: number) => {
            extractFromPOI(child, `${poiPath}-child${i}`);
          });
        }
      };

      config.pois?.forEach((poi: any, i: number) => {
        extractFromPOI(poi, `poi${i}`);
      });

      config.videos?.forEach((video: any, i: number) => {
        if (video.src) {
          allAssets.push({
            url: video.src,
            type: 'video',
            taskId: `${bookId}-${sceneId}-video-${i}`,
            size: 20 * 1024 * 1024, // ✅ 20 MB
          });
        }
      });
    }

    console.log(`📦 Manifest du livre ${bookId}: ${allAssets.length} assets`);
    return allAssets;

  } catch (err) {
    console.error(`❌ Erreur récupération manifest livre ${bookId}:`, err);
    return [];
  }
}

/**
 * Vérifier si TOUT le livre est en cache
 */
export async function isBookFullyCached(bookId: string): Promise<boolean> {
  await downloadManager.init();
  
  const manifest = await getBookManifest(bookId);
  if (manifest.length === 0) return false;

  for (const asset of manifest) {
    const cached = await downloadManager.isAssetCached(asset.taskId);
    if (!cached) return false;
  }

  return true;
}

export const downloadManager = new DownloadManager();