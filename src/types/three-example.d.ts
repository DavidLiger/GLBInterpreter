declare module 'three/examples/jsm/loaders/GLTFLoader' {
  import {
    Loader,
    AnimationClip,
    Object3D,
  } from 'three';

  export interface GLTF {
    scene: Object3D;
    scenes: Object3D[];
    animations: AnimationClip[];
    asset: Record<string, any>;
    parser: any;
    userData: Record<string, any>;
  }

  export class GLTFLoader extends Loader {
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
  }
}


declare module 'three/examples/jsm/controls/OrbitControls' {
  import { Camera, MOUSE, EventDispatcher, Vector3 } from 'three';
  export class OrbitControls extends EventDispatcher {
    constructor(object: Camera, domElement?: HTMLElement);
    enabled: boolean;
    target: Vector3;
    enableZoom: boolean;
    enablePan: boolean;
    enableRotate: boolean;
    enableDamping: boolean;
    dampingFactor: number;
    minDistance: number;
    maxDistance: number;
    minPolarAngle: number;
    maxPolarAngle: number;
    minAzimuthAngle: number;   // Ajouté
    maxAzimuthAngle: number;   // Ajouté
    mouseButtons: { LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE };
    update(): void;
    dispose(): void;
  }
}

