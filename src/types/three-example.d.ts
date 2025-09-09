declare module 'three/examples/jsm/loaders/GLTFLoader' {
  import { Loader } from 'three';
  import { Object3D } from 'three';
  export class GLTFLoader extends Loader {
    load(
      url: string,
      onLoad: (gltf: { scene: Object3D }) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
  }
}

declare module 'three/examples/jsm/controls/OrbitControls' {
  import { Camera, MOUSE, EventDispatcher, Vector3, Renderer } from 'three';
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
    mouseButtons: { LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE };
    update(): void;
    dispose(): void;
  }
}
