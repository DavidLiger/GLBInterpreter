// src/components/diorama/rendering/SpritesheetAnimator.ts
import * as THREE from "three";

// Ajouter après la ligne ~12 dans SpritesheetAnimator.ts
interface SpritesheetData {
  texture: THREE.Texture;
  config: {
    columns: number;
    rows: number;
    totalFrames: number;
    fps: number;
    mode?: 'loop' | 'controlled'; // ✅ AJOUTER
  };
  currentTime: number;
  isPlaying: boolean;
  mixerName?: string; // ✅ AJOUTER : pour lier au mixer spécifique
}

export class SpritesheetAnimator {
  private spritesheets: Map<string, SpritesheetData> = new Map();

  // Modifier la méthode register (ligne ~18) :
  register(
    name: string,
    texture: THREE.Texture,
    config: { columns: number; rows: number; totalFrames: number; fps: number; mode?: 'loop' | 'controlled' },
    mixerName?: string // ✅ AJOUTER
  ) {
    this.spritesheets.set(name, {
      texture,
      config: {
        ...config,
        mode: config.mode || 'loop' // ✅ Défaut à 'loop'
      },
      currentTime: 0,
      isPlaying: true,
      mixerName, // ✅ Stocker le nom du mixer
    });
    
    console.log(`📹 Spritesheet enregistrée: ${name}`, { ...config, mixerName });
  }

  // Modifier la méthode update (ligne ~30) :
  update(deltaTime: number, mixers?: Record<string, THREE.AnimationMixer>) {
    this.spritesheets.forEach((data, name) => {
      if (!data.isPlaying) return;

      // ✅ Mode 'controlled' : sync avec mixer
      if (data.config.mode === 'controlled' && data.mixerName && mixers) {
        const mixer = mixers[data.mixerName];
        if (mixer && mixer.time > 0) {
          // Utiliser le temps du mixer au lieu du delta
          const frame = Math.floor(mixer.time * data.config.fps) % data.config.totalFrames;
          this.updateTextureUV(data.texture, frame, data.config);
        }
        return;
      }

      // Mode 'loop' : comportement actuel
      data.currentTime += deltaTime;
      const frame = Math.floor(data.currentTime * data.config.fps) % data.config.totalFrames;
      this.updateTextureUV(data.texture, frame, data.config);
    });
  }

  private updateTextureUV(
    texture: THREE.Texture,
    frame: number,
    config: { columns: number; rows: number; totalFrames: number }
  ) {
    const { columns, rows, totalFrames } = config;
    const clampedFrame = Math.min(Math.max(0, Math.floor(frame)), totalFrames - 1);

    const col = clampedFrame % columns;
    const row = Math.floor(clampedFrame / columns);

    const offsetX = col / columns;
    const offsetY = 1 - (row + 1) / rows;

    texture.offset.set(offsetX, offsetY);
    texture.needsUpdate = true;
  }

  play(name: string) {
    const data = this.spritesheets.get(name);
    if (data) data.isPlaying = true;
  }

  pause(name: string) {
    const data = this.spritesheets.get(name);
    if (data) data.isPlaying = false;
  }

  dispose() {
    this.spritesheets.clear();
  }
}