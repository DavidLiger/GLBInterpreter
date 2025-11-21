// src/components/diorama/rendering/SpritesheetAnimator.ts
import * as THREE from "three";

interface SpritesheetData {
  texture: THREE.Texture;
  config: {
    columns: number;
    rows: number;
    totalFrames: number;
    fps: number;
  };
  currentTime: number;
  isPlaying: boolean;
}

export class SpritesheetAnimator {
  private spritesheets: Map<string, SpritesheetData> = new Map();

  register(
    name: string,
    texture: THREE.Texture,
    config: { columns: number; rows: number; totalFrames: number; fps: number }
  ) {
    this.spritesheets.set(name, {
      texture,
      config,
      currentTime: 0,
      isPlaying: true,
    });
    
    console.log(`📹 Spritesheet enregistrée: ${name}`, config);
  }

  update(deltaTime: number) {
    this.spritesheets.forEach((data, name) => {
      if (!data.isPlaying) return;

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