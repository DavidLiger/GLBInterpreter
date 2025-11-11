import React, { useState } from 'react';
import { FileJson, Copy, Download, X, Code2, Settings2, Info } from 'lucide-react';

interface ConfigConverterToolProps {
  defaultProxyUrl?: string;
  defaultSceneId?: string;
}

export default function ConfigConverterTool({
  defaultProxyUrl = "https://webdiorama-proxy.david-liger-pro.workers.dev/assets/1",
  defaultSceneId = "street"
}: ConfigConverterToolProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tsInput, setTsInput] = useState('');
  const [jsonOutput, setJsonOutput] = useState('');
  const [proxyUrl, setProxyUrl] = useState(defaultProxyUrl);
  const [sceneId, setSceneId] = useState(defaultSceneId);
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);

  // Ta fiche d’instructions (mémo humain)
const instructions = [
  "💡 La structure JSON correspond au TS d'origine (exemple : street.ts)",
  "🗂️ POIs : chaque point d'intérêt doit définir id, label, icon, zoom, angles, enableZoom",
  "⚠️ Les noms d'armature et clipName doivent tous utiliser '_' et non '.'",
  "🎬 Elements : type peut être 'armature' ou 'mesh', autoplay et loop définissent l'animation",
  "🔊 Dialogue : characters contient id, name et image ; lines contient time, text, characterId",
  "🎥 cameraPath : permet un déplacement automatique de la caméra avec point, target, duration et zoom",
  "🎨 postProcessing : bloom, ssao, dof, toneMapping avec enabled, strength, radius, threshold, etc.",
  "💡 emissiveObjects : objets émissifs pour la lumière (optionnel)",
  "🎬 videos : textures vidéo appliquées aux objets",
  "💡 lights : types 'ambient' ou 'spot', couleur, intensité, distance, angle, penumbra",
  "💡 bulbs : couleur et intensité émissive pour les ampoules",
  "✏️ toonOutline : ligne de contour, épaisseur, couleur, alpha, keepAlive",
  "📝 credits : description, musique, sons, licences, projet, année",
  "💡 minDistance dans les POIs ne doit jamais être modifié dynamiquement"
];

  const showStatus = (message: string, type: 'success' | 'error') => {
    setStatus({ message, type });
    setTimeout(() => setStatus(null), 3000);
  };

  const convert = () => {
    if (!tsInput.trim()) {
        showStatus('Veuillez coller votre code TypeScript', 'error');
        return;
    }

    try {
        let source = tsInput.trim();

        // 1️⃣ Supprime les imports/exports superflus
        source = source
        .replace(/^import\s.+?;$/gm, '')
        .replace(/^export\s+(const|let|var)\s+\w+\s*=?/gm, '');

        // 2️⃣ Extrait l’objet principal
        if (!source.trim().startsWith('{')) {
        const match = source.match(/=\s*({[\s\S]*});?\s*$/);
        if (match) source = match[1];
        }

        // 3️⃣ Nettoie l’URL proxy (supprime le slash final)
        const PROXY = proxyUrl.replace(/\/$/, '');

        // 4️⃣ Évalue le code TS dans un contexte sécurisé
        const sandboxCode = `
        const BASE_URL = ${JSON.stringify(PROXY)};
        return (${source});
        `;
        const configObj = new Function(sandboxCode)();

        // -----------------------------
        // 🔧 Utilitaires internes
        // -----------------------------

        // ✅ Fonction typée pour normaliser les couleurs
        const normalizeColor = (value: unknown): number | null => {
        if (typeof value === 'string' && value.startsWith('#')) {
            return parseInt(value.slice(1), 16);
        }
        if (typeof value === 'number') {
            return value;
        }
        return null;
        };

        // ✅ Fonction récursive pour traiter les URLs, couleurs, etc.
        const transform = (obj: unknown): unknown => {
        if (typeof obj === 'string') {
            let val = obj;

            // Remplace BASE_URL par le proxy Cloudflare
            if (val.includes('${BASE_URL}')) {
            val = val.replace(/\$\{BASE_URL\}/g, PROXY);
            }

            // Évite les doublons /assets/X/assets/X
            val = val.replace(/(\/assets\/\d+)\/assets\/\d+/g, '$1');

            // Ajoute cache-buster sur les .glb
            if (val.endsWith('.glb')) {
            val += '?v=${Date.now()}';
            }

            return val;
        }

        if (Array.isArray(obj)) {
            return obj.map(transform);
        }

        if (typeof obj === 'object' && obj !== null) {
            const result: Record<string, unknown> = {};

            for (const [key, value] of Object.entries(obj)) {
                // 🎯 minDistance : ne jamais toucher
                if (key === 'minDistance') {
                    result[key] = value;
                    continue;
                }

                let newValue = value;

                // 🎨 Couleurs
                if (['color', 'tint'].includes(key)) {
                    const normalized = normalizeColor(value);
                    if (normalized !== null) {
                        newValue = normalized;
                    }
                }

                result[key] = transform(newValue);
            }

            return result;
        }

        return obj;
        };

        // -----------------------------
        // ⚙️ Transformation principale
        // -----------------------------
        const finalObj = transform(configObj);

        // -----------------------------
        // 📝 Conversion en JSON lisible
        // -----------------------------
        const jsonOutput = JSON.stringify(finalObj, null, 2);
        setJsonOutput(jsonOutput);
        showStatus('✅ Conversion réussie !', 'success');
    } catch (err: any) {
        console.error('Erreur de conversion :', err);
        showStatus('❌ ' + err.message, 'error');
    }
    };

  const copyToClipboard = () => {
    if (!jsonOutput) {
      showStatus('Rien à copier. Convertissez d\'abord !', 'error');
      return;
    }
    navigator.clipboard.writeText(jsonOutput);
    showStatus('📋 Copié dans le presse-papier !', 'success');
  };

  const downloadJSON = () => {
    if (!jsonOutput) {
      showStatus('Rien à télécharger. Convertissez d\'abord !', 'error');
      return;
    }

    const blob = new Blob([jsonOutput], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sceneId || 'config'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus('💾 Fichier téléchargé !', 'success');
  };

  const loadExample = () => {
    const example = `import type { DioramaConfig3DWithPostProcessing } from "@/types/diorama";

const BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL || "";

export const street: DioramaConfig3DWithPostProcessing = {
  glb: \`\${BASE_URL}/models/street.glb\`,
  loaderImage: \`\${BASE_URL}/icons/dioramas/test_street/street-preview.png\`,
  autoplay: true,
  name: "La place du village",
  navigationType: "fps",
  postProcessing: {
    bloom: {
      enabled: false,
      strength: 0.2,
      radius: 0.5,
      threshold: 1.0,
    },
  },
  pois: [
    {
      id: "start",
      label: "Vue initiale",
      emptyName: "start",
      icon: \`\${BASE_URL}/icons/dioramas/test_street/start.png\`,
      zoom: 0.5,
      minPolarAngle: 0,
      maxPolarAngle: Math.PI / 2,
      elements: [
        {
          name: "Armature",
          type: "armature",
          clipName: "walk",
          autoplay: false,
          loop: false
        }
      ]
    }
  ],
  lights: [
    {
      type: "ambient",
      color: 0xffe0cc,
      intensity: 0.6,
    },
    {
      type: "spot",
      emptyName: "spot_01",
      color: 0xfff2cc,
      intensity: 0.8,
      angle: Math.PI / 4,
    }
  ]
};`;

    setTsInput(example);
    showStatus('📋 Exemple chargé !', 'success');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-38 right-4 z-[500] bg-purple-600 text-white p-3 rounded-full shadow-lg hover:bg-purple-700 transition"
        title="Config Converter (Dev Tool)"
      >
        <FileJson size={24} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <FileJson className="text-purple-400" size={24} />
            <h2 className="text-xl font-bold text-white">Config Converter (Dev Tool)</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Settings */}
        <div className="p-4 bg-gray-800 border-b border-gray-700 space-y-3">
          <div className="flex items-center gap-2 text-sm text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded p-2">
            <Settings2 size={16} />
            <span>💡 Collez juste l'objet <code>{`{...}`}</code></span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                🌐 URL du Proxy Cloudflare
              </label>
              <input
                type="text"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded focus:border-purple-500 focus:outline-none text-sm"
                placeholder="https://webdiorama-proxy.david-liger-pro.workers.dev/assets/1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                🎬 ID de la scène
              </label>
              <input
                type="text"
                value={sceneId}
                onChange={(e) => setSceneId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded focus:border-purple-500 focus:outline-none text-sm"
                placeholder="street"
              />
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-hidden min-h-[500px]">
          {/* Input Panel */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                <Code2 size={18} />
                TypeScript Source
              </h3>
              <div className="flex items-center gap-2">
                {/* Bouton info */}
                <button
                  onClick={() => setIsInstructionsOpen(true)}
                  className="flex items-center justify-center w-10 h-10 bg-yellow-500 text-black rounded-full shadow hover:bg-yellow-600 transition"
                  title="Voir les instructions"
                >
                  <Info size={20} />
                </button>
                
                {/* Bouton charger exemple */}
                <button
                  onClick={loadExample}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-700 text-gray-200 rounded shadow hover:bg-gray-600 transition text-sm"
                >
                  📋 Charger exemple
                </button>
              </div>
            </div>
            <textarea
              value={tsInput}
              onChange={(e) => setTsInput(e.target.value)}
              className="flex-1 p-3 bg-gray-800 text-gray-100 border border-gray-600 rounded font-mono text-xs resize-none focus:border-purple-500 focus:outline-none"
              placeholder="Colle ton objet {glb:...} ici..."
            />
          </div>

          {/* Output Panel */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                <FileJson size={18} className="text-green-400" />
                JSON Production
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition flex items-center gap-1"
                >
                  <Copy size={14} />
                  Copier
                </button>
                <button
                  onClick={downloadJSON}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition flex items-center gap-1"
                >
                  <Download size={14} />
                  Télécharger
                </button>
              </div>
            </div>
            <textarea
              value={jsonOutput}
              readOnly
              className="flex-1 p-3 bg-gray-800 text-gray-100 border border-gray-600 rounded font-mono text-xs resize-none"
              placeholder="Le JSON converti apparaîtra ici..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={convert}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition text-lg"
          >
            🚀 CONVERTIR TS → JSON
          </button>
          
          {status && (
            <div
              className={`mt-3 p-3 rounded text-sm text-center ${
                status.type === 'success'
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}
            >
              {status.message}
            </div>
          )}
        </div>
      </div>
      {isInstructionsOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-auto flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">📝 Instructions pour le JSON Diorama</h2>
              <button
                onClick={() => setIsInstructionsOpen(false)}
                className="text-gray-400 hover:text-white transition"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4 space-y-2 text-sm text-gray-200">
              {instructions.map((inst, i) => (
                <p key={i}>{inst}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    
  );
}