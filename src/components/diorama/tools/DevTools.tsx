"use client";

// Outils de développement regroupés (R-29, T-01). Importé par WebDioramaLoader en `import()` dynamique sous la
// condition `NODE_ENV === "development"` : en production la branche est éliminée au build et ni ce module, ni les
// outils, ni `qrcode.react` n'entrent dans le bundle. L'optimisation des GLB est faite au build (Î7, scripts/glb-pipeline.ts) :
// l'ancien GLBOptimizer du navigateur est supprimé (T-19).
import type * as THREE from "three";
import PostProcessingControls from "../rendering/PostProcessingControls";
import type { setupPostProcessing } from "../rendering/setupPostProcessing";
import SceneAnalyzer from "../ui/SceneAnalyzer";
import ConfigConverterTool from "./ConfigConverterTool";
import QRCodeModal from "./QRCodeModal";
import SpritesheetGenerator from "../ui/SpritesheetGenerator";

type Composer = ReturnType<typeof setupPostProcessing>;

export default function DevTools({
  composer,
  scene,
  glbUrl,
  onOpenChange,
}: {
  composer: Composer | null;
  scene: THREE.Scene | null;
  glbUrl: string;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <>
      {composer && (
        <PostProcessingControls
          composer={composer}
          onUpdate={(type, values) => {
            if (type === "bloom") composer.updateBloom(values.strength, values.radius, values.threshold);
            if (type === "ssao") composer.updateSSAO(values.kernelRadius, values.minDistance);
            if (type === "dof") {
              if ("enabled" in values) composer.enableDOF(values.enabled);
              else composer.updateDOF(values.focus, values.aperture, values.maxblur);
            }
            if (type === "toneMapping") composer.updateToneMapping(values.type, values.exposure);
          }}
          onOpenChange={onOpenChange}
        />
      )}
      <SceneAnalyzer scene={scene} glbUrl={glbUrl} onOpenChange={onOpenChange} />
      <ConfigConverterTool defaultSceneId="street" onOpenChange={onOpenChange} />
      <QRCodeModal onOpenChange={onOpenChange} />
      <SpritesheetGenerator onOpenChange={onOpenChange} />
    </>
  );
}
