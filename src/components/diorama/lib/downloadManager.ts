import { openDB, IDBPDatabase } from 'idb';

interface DownloadTask {
  id: string;
  url: string;
  type: 'glb' | 'video' | 'audio' | 'image';
  size: number;
  downloaded: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  chunks: Uint8Array[]; // ✅ Fix type
  checksum?: string;
}

interface DownloadProgress {
  taskId: string;
  progress: number; // 0-100
  speed: number; // bytes/sec
  eta: number; // seconds
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
   * Vérifier l'espace disque disponible
   */
  async checkStorageQuota(): Promise<{ available: number; used: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        available: (estimate.quota || 0) - (estimate.usage || 0),
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }
    // Fallback : assumer 50MB disponibles
    return { available: 50 * 1024 * 1024, used: 0, quota: 100 * 1024 * 1024 };
  }

  /**
   * Télécharger un asset avec reprise et chunks
   */
  async downloadAsset(
    taskId: string,
    url: string,
    type: DownloadTask['type'],
    onProgress?: (progress: DownloadProgress) => void // ✅ Fix type
  ): Promise<Blob> {
    const abortController = new AbortController();
    this.activeTasks.set(taskId, abortController);

    if (onProgress) {
      this.progressCallbacks.set(taskId, onProgress);
    }

    // 1. Vérifier si déjà en cours ou terminé
    const existingTask = await this.db.get('tasks', taskId);
    if (existingTask?.status === 'completed') {
      console.log(`✅ Asset ${taskId} déjà téléchargé`);
      const chunks = await this.db.get('chunks', taskId);
      return new Blob(chunks.data as BlobPart[]); // ✅ Fix cast
    }

    // 2. Créer ou reprendre la tâche
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

      // 3. Télécharger avec retry (max 3 tentatives)
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
          const chunks: Uint8Array[] = [...task.chunks]; // ✅ Fix type
          let receivedLength = task.downloaded;
          const startTime = Date.now();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            receivedLength += value.length;
            task.downloaded = receivedLength;

            // Calculer vitesse et ETA
            const elapsedTime = (Date.now() - startTime) / 1000;
            const speed = receivedLength / elapsedTime;
            const remaining = task.size - receivedLength;
            const eta = remaining / speed;

            // Callback progress
            if (onProgress) {
              onProgress({
                taskId,
                progress: task.size > 0 ? (receivedLength / task.size) * 100 : 0,
                speed,
                eta,
              });
            }

            // Sauvegarder tous les 1MB
            if (receivedLength % (1024 * 1024) < value.length) {
              await this.db.put('chunks', { taskId, data: chunks });
              await this.db.put('tasks', task);
            }
          }

          // 4. Terminé avec succès
          task.status = 'completed';
          task.chunks = chunks;
          await this.db.put('chunks', { taskId, data: chunks });
          await this.db.put('tasks', task);

          console.log(`✅ ${taskId} téléchargé (${(task.size / 1024 / 1024).toFixed(2)} MB)`);

          return new Blob(chunks as BlobPart[]); // ✅ Fix cast
        } catch (err: any) {
          if (err.name === 'AbortError') {
            task.status = 'cancelled';
            await this.db.put('tasks', task);
            throw new Error('Téléchargement annulé');
          }

          attempt++;
          console.warn(`⚠️ Tentative ${attempt}/${maxRetries} échouée:`, err);

          if (attempt >= maxRetries) {
            task.status = 'failed';
            await this.db.put('tasks', task);
            throw err;
          }

          // Backoff exponentiel : 2s, 4s, 8s
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

  /**
   * Annuler un téléchargement
   */
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

  /**
   * Nettoyer les téléchargements annulés/échoués
   */
  async cleanup(taskId: string) {
    await this.db.delete('tasks', taskId);
    await this.db.delete('chunks', taskId);
  }

  /**
   * Vérifier si un asset est déjà téléchargé
   */
  async isAssetCached(taskId: string): Promise<boolean> {
    const task = await this.db.get('tasks', taskId);
    return task?.status === 'completed';
  }

  /**
   * Récupérer un asset depuis le cache
   */
  async getAssetFromCache(taskId: string): Promise<Blob | null> {
    const task = await this.db.get('tasks', taskId);
    if (task?.status !== 'completed') return null;

    const chunks = await this.db.get('chunks', taskId);
    return new Blob(chunks.data as BlobPart[]); // ✅ Fix cast
  }
}

export const downloadManager = new DownloadManager();