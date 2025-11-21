// src/components/diorama/ui/SceneAnalyzer.tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";

interface SceneAnalyzerProps {
  scene: THREE.Scene | null;
  glbUrl?: string;
  onOpenChange?: (isOpen: boolean) => void;
}

interface MeshInfo {
  name: string;
  vertices: number;
  triangles: number;
  materials: number;
  hasArmature: boolean;
  boundingBoxSize: THREE.Vector3;
  volume: number; // ✅ Ajouter le volume
}

interface ArmatureInfo {
  name: string;
  bones: number;
  animations: string[];
}

interface TextureInfo {
  name: string;
  width: number;
  height: number;
  size: string;
  resolution: number; // ✅ Pour le tri
}

export default function SceneAnalyzer({ scene, glbUrl, onOpenChange }: SceneAnalyzerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'meshes' | 'armatures' | 'textures'>('overview');
  const [stats, setStats] = useState({
    totalVertices: 0,
    totalTriangles: 0,
    totalMeshes: 0,
    totalMaterials: 0,
    totalTextures: 0,
    totalBones: 0,
    totalAnimations: 0,
  });
  const [meshes, setMeshes] = useState<MeshInfo[]>([]);
  const [armatures, setArmatures] = useState<ArmatureInfo[]>([]);
  const [textures, setTextures] = useState<TextureInfo[]>([]);
  
  // ✅ États pour les filtres
  const [meshSortBy, setMeshSortBy] = useState<'vertices' | 'triangles' | 'name' | 'size'>('vertices');
  const [textureSortBy, setTextureSortBy] = useState<'name' | 'resolution' | 'size'>('resolution');
  const [showOnlyHeavy, setShowOnlyHeavy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBestPractices, setShowBestPractices] = useState(false);

  useEffect(() => {
    if (!scene) return;

    let totalVertices = 0;
    let totalTriangles = 0;
    let totalMeshes = 0;
    const materials = new Set<THREE.Material>();
    const textureMap = new Map<string, TextureInfo>();
    const meshInfos: MeshInfo[] = [];
    const armatureInfos: ArmatureInfo[] = [];

    scene.traverse((obj) => {
      // Analyser les meshes
      if (obj instanceof THREE.Mesh || obj instanceof THREE.SkinnedMesh) {
        totalMeshes++;
        const geometry = obj.geometry;
        
        if (geometry) {
          const positions = geometry.attributes.position;
          const vertices = positions ? positions.count : 0;
          const triangles = geometry.index ? geometry.index.count / 3 : vertices / 3;
          
          totalVertices += vertices;
          totalTriangles += triangles;

          // Bounding box
          geometry.computeBoundingBox();
          const boundingBox = geometry.boundingBox;
          const size = new THREE.Vector3();
          let volume = 0;
          if (boundingBox) {
            boundingBox.getSize(size);
            volume = size.x * size.y * size.z; // ✅ Calculer le volume
          }

          meshInfos.push({
            name: obj.name || 'Unnamed',
            vertices,
            triangles: Math.round(triangles),
            materials: Array.isArray(obj.material) ? obj.material.length : 1,
            hasArmature: obj instanceof THREE.SkinnedMesh,
            boundingBoxSize: size,
            volume, // ✅ Ajouter
          });

          // Collecter les matériaux
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => materials.add(m));
          } else if (obj.material) {
            materials.add(obj.material);
          }
        }
      }

      // Analyser les armatures
      if (obj instanceof THREE.Bone && obj.parent instanceof THREE.Bone === false) {
        let boneCount = 0;
        obj.traverse((bone) => {
          if (bone instanceof THREE.Bone) boneCount++;
        });

        const animations: string[] = [];
        if (scene.animations) {
          scene.animations.forEach((clip) => {
            const affectsArmature = clip.tracks.some(track => 
              track.name.includes(obj.name) || track.name.includes('.bones[')
            );
            if (affectsArmature) {
              animations.push(clip.name);
            }
          });
        }

        armatureInfos.push({
          name: obj.parent?.name || 'Root Armature',
          bones: boneCount,
          animations: [...new Set(animations)],
        });
      }
    });

    // Analyser les textures
    materials.forEach((material) => {
      const mat = material as any;
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'].forEach((mapType) => {
        const texture = mat[mapType];
        if (texture?.image) {
          const img = texture.image;
          const key = texture.uuid;
          if (!textureMap.has(key)) {
            const size = (img.width * img.height * 4) / (1024 * 1024);
            textureMap.set(key, {
              name: texture.name || mapType,
              width: img.width,
              height: img.height,
              size: size.toFixed(2) + ' MB',
              resolution: img.width * img.height, // ✅ Pour le tri
            });
          }
        }
      });
    });

    setStats({
      totalVertices,
      totalTriangles: Math.round(totalTriangles),
      totalMeshes,
      totalMaterials: materials.size,
      totalTextures: textureMap.size,
      totalBones: armatureInfos.reduce((sum, a) => sum + a.bones, 0),
      totalAnimations: scene.animations?.length || 0,
    });

    setMeshes(meshInfos);
    setArmatures(armatureInfos);
    setTextures(Array.from(textureMap.values()));
  }, [scene, refreshKey]);

  // ✅ Tri et filtrage des meshes
  const filteredAndSortedMeshes = meshes
    .filter(mesh => !showOnlyHeavy || mesh.vertices > 50000)
    .sort((a, b) => {
      if (meshSortBy === 'vertices') return b.vertices - a.vertices;
      if (meshSortBy === 'triangles') return b.triangles - a.triangles;
      if (meshSortBy === 'size') return b.volume - a.volume;
      return a.name.localeCompare(b.name);
    });

  // ✅ Tri des textures
  const sortedTextures = [...textures].sort((a, b) => {
    if (textureSortBy === 'resolution') return b.resolution - a.resolution;
    if (textureSortBy === 'size') return parseFloat(b.size) - parseFloat(a.size);
    return a.name.localeCompare(b.name);
  });

  // Recommendations
  const getRecommendations = () => {
    const recs: string[] = [];
    
    if (stats.totalVertices > 500000) {
      recs.push("⚠️ Scène très lourde (>500K vertices). Considérez simplifier les meshes.");
    }
    
    const heavyMeshes = meshes.filter(m => m.vertices > 50000);
    if (heavyMeshes.length > 0) {
      recs.push(`⚠️ ${heavyMeshes.length} mesh(es) avec >50K vertices détecté(s).`);
    }

    const largeTextures = textures.filter(t => t.width > 2048 || t.height > 2048);
    if (largeTextures.length > 0) {
      recs.push(`⚠️ ${largeTextures.length} texture(s) >2K détectée(s). Réduisez leur taille.`);
    }

    if (stats.totalMaterials > 20) {
      recs.push("💡 Beaucoup de matériaux. Fusionnez-les si possible pour réduire les draw calls.");
    }

    if (recs.length === 0) {
      recs.push("✅ Scène bien optimisée !");
    }

    return recs;
  };

    // ✅ MODIFIER le setIsOpen
  const handleSetIsOpen = (value: boolean) => {
    setIsOpen(value);
    onOpenChange?.(value); // ✅ Notifier le parent
  };

  if (!scene) return null;

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={() => handleSetIsOpen(true)}
        className="fixed bottom-82 right-4 z-[9998] bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-4 py-3 rounded-full shadow-lg font-bold flex items-center gap-2 transition-all hover:scale-105"
        title="Analyser la scène 3D"
      >
        <span className="text-xl">📊</span>
        <span className="hidden sm:inline">Analyser</span>
      </button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => handleSetIsOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed right-0 top-0 bottom-0 w-full sm:w-[600px] bg-gray-900 z-[9999] overflow-y-auto shadow-2xl border-l border-gray-700 flex flex-col"
            >
              {/* ✅ Header STICKY */}
            <div className="sticky top-0 bg-gradient-to-r from-cyan-600 to-blue-700 p-4 flex items-center justify-between z-20 shadow-lg">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">📊</span>
                    <h2 className="text-white font-bold text-xl">Scene Analyzer</h2>
                    {/* ✅ AJOUTER ce bouton */}
                    <button
                    onClick={() => setShowBestPractices(true)}
                    className="text-white/80 hover:text-white hover:bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-sm transition"
                    title="Bonnes pratiques"
                    >
                    ℹ️
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <button
                    onClick={() => setRefreshKey(k => k + 1)}
                    className="text-white hover:bg-white/20 rounded-lg p-2 transition"
                    title="Rafraîchir l'analyse"
                    >
                    🔄
                    </button>
                    <button
                    onClick={() => handleSetIsOpen(false)}
                    className="text-white hover:bg-white/20 rounded-lg p-2 transition"
                    >
                    ✕
                    </button>
                </div>
            </div>

              {/* GLB Info */}
              {glbUrl && (
                <div className="p-4 bg-gray-800 border-b border-gray-700">
                  <p className="text-gray-400 text-xs mb-1">Fichier GLB</p>
                  <p className="text-white text-sm truncate">{glbUrl.split('/').pop()}</p>
                </div>
              )}

              {/* ✅ Tabs STICKY */}
              <div className="sticky top-[72px] flex border-b border-gray-700 bg-gray-800 z-10">
                {[
                  { id: 'overview', label: 'Vue d\'ensemble', icon: '📈' },
                  { id: 'meshes', label: 'Meshes', icon: '🔷', badge: meshes.length },
                  { id: 'armatures', label: 'Armatures', icon: '🦴', badge: armatures.length },
                  { id: 'textures', label: 'Textures', icon: '🖼️', badge: textures.length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition relative ${
                      activeTab === tab.id
                        ? 'bg-gray-900 text-white border-b-2 border-cyan-500'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    <span className="mr-2">{tab.icon}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span className="ml-1 px-1.5 py-0.5 bg-cyan-500 text-white text-xs rounded-full">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Content scrollable */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4">
                  {/* Overview Tab */}
                  {activeTab === 'overview' && (
                    <>
                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gradient-to-br from-blue-900/50 to-cyan-900/50 rounded-lg p-4 border border-blue-500/30">
                          <p className="text-gray-400 text-xs mb-1">Vertices</p>
                          <p className="text-white text-2xl font-bold">{stats.totalVertices.toLocaleString()}</p>
                        </div>
                        <div className="bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-lg p-4 border border-purple-500/30">
                          <p className="text-gray-400 text-xs mb-1">Triangles</p>
                          <p className="text-white text-2xl font-bold">{stats.totalTriangles.toLocaleString()}</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-900/50 to-emerald-900/50 rounded-lg p-4 border border-green-500/30">
                          <p className="text-gray-400 text-xs mb-1">Meshes</p>
                          <p className="text-white text-2xl font-bold">{stats.totalMeshes}</p>
                        </div>
                        <div className="bg-gradient-to-br from-orange-900/50 to-red-900/50 rounded-lg p-4 border border-orange-500/30">
                          <p className="text-gray-400 text-xs mb-1">Matériaux</p>
                          <p className="text-white text-2xl font-bold">{stats.totalMaterials}</p>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-900/50 to-blue-900/50 rounded-lg p-4 border border-indigo-500/30">
                          <p className="text-gray-400 text-xs mb-1">Textures</p>
                          <p className="text-white text-2xl font-bold">{stats.totalTextures}</p>
                        </div>
                        <div className="bg-gradient-to-br from-yellow-900/50 to-orange-900/50 rounded-lg p-4 border border-yellow-500/30">
                          <p className="text-gray-400 text-xs mb-1">Animations</p>
                          <p className="text-white text-2xl font-bold">{stats.totalAnimations}</p>
                        </div>
                      </div>

                      {/* Recommendations */}
                      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                          <span>💡</span>
                          Recommandations
                        </h3>
                        <div className="space-y-2">
                          {getRecommendations().map((rec, i) => (
                            <p key={i} className="text-gray-300 text-sm">{rec}</p>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Meshes Tab */}
                  {activeTab === 'meshes' && (
                    <>
                      {/* ✅ Filtres améliorés */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setMeshSortBy('vertices')}
                            className={`px-3 py-2 rounded text-sm font-medium transition ${
                              meshSortBy === 'vertices'
                                ? 'bg-cyan-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                          >
                            Par vertices
                          </button>
                          <button
                            onClick={() => setMeshSortBy('triangles')}
                            className={`px-3 py-2 rounded text-sm font-medium transition ${
                              meshSortBy === 'triangles'
                                ? 'bg-cyan-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                          >
                            Par triangles
                          </button>
                          <button
                            onClick={() => setMeshSortBy('size')}
                            className={`px-3 py-2 rounded text-sm font-medium transition ${
                              meshSortBy === 'size'
                                ? 'bg-cyan-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                          >
                            Par taille
                          </button>
                          <button
                            onClick={() => setMeshSortBy('name')}
                            className={`px-3 py-2 rounded text-sm font-medium transition ${
                              meshSortBy === 'name'
                                ? 'bg-cyan-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                          >
                            Par nom
                          </button>
                        </div>

                        {/* Toggle heavy only */}
                        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showOnlyHeavy}
                            onChange={(e) => setShowOnlyHeavy(e.target.checked)}
                            className="rounded"
                          />
                          Afficher uniquement les meshes lourds (&gt;50K vertices)
                        </label>
                      </div>

                      {/* Count */}
                      <p className="text-gray-400 text-sm">
                        {filteredAndSortedMeshes.length} mesh(es) affiché(s)
                      </p>

                      {/* Meshes List */}
                      <div className="space-y-2">
                        {filteredAndSortedMeshes.map((mesh, i) => (
                          <div
                            key={i}
                            className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-cyan-500/50 transition"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-medium truncate flex items-center gap-2">
                                  {mesh.hasArmature && <span className="text-orange-400">🦴</span>}
                                  {mesh.name}
                                </p>
                              </div>
                              {mesh.vertices > 50000 && (
                                <span className="text-red-400 text-xs ml-2 flex-shrink-0">⚠️ Lourd</span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-gray-400">Vertices: </span>
                                <span className="text-cyan-400 font-mono">{mesh.vertices.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Triangles: </span>
                                <span className="text-purple-400 font-mono">{mesh.triangles.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Matériaux: </span>
                                <span className="text-white font-mono">{mesh.materials}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Volume: </span>
                                <span className="text-white font-mono">{mesh.volume.toFixed(2)}</span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-gray-400">Dimensions: </span>
                                <span className="text-white font-mono text-xs">
                                  {mesh.boundingBoxSize.x.toFixed(1)} × {mesh.boundingBoxSize.y.toFixed(1)} × {mesh.boundingBoxSize.z.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Armatures Tab */}
                  {activeTab === 'armatures' && (
                    <div className="space-y-3">
                      {armatures.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">Aucune armature détectée</p>
                      ) : (
                        armatures.map((armature, i) => (
                          <div
                            key={i}
                            className="bg-gray-800 rounded-lg p-4 border border-gray-700"
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-2xl">🦴</span>
                              <h4 className="text-white font-bold">{armature.name}</h4>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <span className="text-gray-400 text-sm">Bones: </span>
                                <span className="text-white font-mono">{armature.bones}</span>
                              </div>
                              {armature.animations.length > 0 && (
                                <div>
                                  <p className="text-gray-400 text-sm mb-1">Animations ({armature.animations.length}):</p>
                                  <div className="flex flex-wrap gap-1">
                                    {armature.animations.map((anim, j) => (
                                      <span
                                        key={j}
                                        className="px-2 py-1 bg-cyan-900/50 border border-cyan-500/30 rounded text-cyan-300 text-xs"
                                      >
                                        {anim}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Textures Tab */}
                  {activeTab === 'textures' && (
                    <>
                      {/* ✅ Filtres textures */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setTextureSortBy('resolution')}
                          className={`px-3 py-2 rounded text-sm font-medium transition ${
                            textureSortBy === 'resolution'
                              ? 'bg-cyan-600 text-white'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          Par résolution
                        </button>
                        <button
                          onClick={() => setTextureSortBy('size')}
                          className={`px-3 py-2 rounded text-sm font-medium transition ${
                            textureSortBy === 'size'
                              ? 'bg-cyan-600 text-white'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          Par taille
                        </button>
                        <button
                          onClick={() => setTextureSortBy('name')}
                          className={`px-3 py-2 rounded text-sm font-medium transition ${
                            textureSortBy === 'name'
                              ? 'bg-cyan-600 text-white'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          Par nom
                        </button>
                      </div>

                      <div className="space-y-2">
                        {sortedTextures.length === 0 ? (
                          <p className="text-gray-400 text-center py-8">Aucune texture détectée</p>
                        ) : (
                          sortedTextures.map((texture, i) => (
                            <div
                              key={i}
                              className="bg-gray-800 rounded-lg p-3 border border-gray-700"
                            >
                              <p className="text-white font-medium mb-2 truncate">{texture.name}</p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-400">Largeur: </span>
                                  <span className="text-white font-mono">{texture.width}px</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Hauteur: </span>
                                  <span className="text-white font-mono">{texture.height}px</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">~Taille: </span>
                                  <span className="text-white font-mono">{texture.size}</span>
                                </div>
                              </div>
                              {(texture.width > 2048 || texture.height > 2048) && (
                                <p className="text-red-400 text-xs mt-2">⚠️ Texture très grande - considérez la réduire</p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Modale Best Practices */}
    <AnimatePresence>
    {showBestPractices && (
        <>
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowBestPractices(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000]"
        />
        
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[600px] sm:max-h-[80vh] bg-gray-900 rounded-2xl z-[10001] overflow-hidden flex flex-col shadow-2xl border border-cyan-500/30"
        >
            {/* Header */}
            <div className="bg-gradient-to-r from-cyan-600 to-blue-700 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className="text-2xl">💡</span>
                <h3 className="text-white font-bold text-xl">Bonnes pratiques d'optimisation</h3>
            </div>
            <button
                onClick={() => setShowBestPractices(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition"
            >
                ✕
            </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Modèles 3D */}
            <div>
                <h4 className="text-cyan-400 font-bold text-lg mb-3 flex items-center gap-2">
                <span>🔷</span>
                Modèles 3D
                </h4>
                <ul className="space-y-2 text-gray-300 text-sm">
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span><strong>Visez &lt;200K vertices</strong> pour toute la scène</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span><strong>Meshes individuels &lt;50K vertices</strong> chacun</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Fusionnez les meshes statiques (Blender: <code className="text-cyan-300">Ctrl+J</code>)</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Utilisez le modificateur <strong>Decimate</strong> pour réduire les polys</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Supprimez les faces cachées (intérieurs, sous-sols...)</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Appliquez tous les modificateurs avant export</span>
                </li>
                </ul>
            </div>

            {/* Textures */}
            <div>
                <h4 className="text-purple-400 font-bold text-lg mb-3 flex items-center gap-2">
                <span>🖼️</span>
                Textures
                </h4>
                <ul className="space-y-2 text-gray-300 text-sm">
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span><strong>Convertissez PNG → WebP</strong> (gain 30-80% de taille)</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span><strong>Résolutions max recommandées :</strong></span>
                </li>
                <li className="ml-6 text-gray-400 text-xs space-y-1">
                    <p>• Objets principaux : 2048×2048px</p>
                    <p>• Objets secondaires : 1024×1024px</p>
                    <p>• Petits détails : 512×512px</p>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Utilisez des <strong>atlas de textures</strong> quand possible</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Compressez avec <strong>Basis Universal</strong> ou <strong>KTX2</strong></span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Dimensions en puissances de 2 (512, 1024, 2048...)</span>
                </li>
                </ul>
            </div>

            {/* Sons */}
            <div>
                <h4 className="text-orange-400 font-bold text-lg mb-3 flex items-center gap-2">
                <span>🔊</span>
                Sons & Musiques
                </h4>
                <ul className="space-y-2 text-gray-300 text-sm">
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span><strong>MP3 128kbps maximum</strong> pour les sons d'ambiance</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span><strong>MP3 64-96kbps</strong> pour les effets sonores courts</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Format : <strong>MP3</strong> (meilleur support navigateurs)</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Mono au lieu de stéréo quand c'est possible (-50% taille)</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Sample rate : 44.1kHz (pas 48kHz)</span>
                </li>
                </ul>
            </div>

            {/* Animations */}
            <div>
                <h4 className="text-yellow-400 font-bold text-lg mb-3 flex items-center gap-2">
                <span>🎬</span>
                Animations
                </h4>
                <ul className="space-y-2 text-gray-300 text-sm">
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Limitez le nombre d'os (bones) : <strong>&lt;50 par armature</strong></span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Supprimez les animations inutilisées</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Réduisez le nombre de keyframes (sampling)</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Utilisez des animations procédurales quand possible</span>
                </li>
                </ul>
            </div>

            {/* Matériaux */}
            <div>
                <h4 className="text-pink-400 font-bold text-lg mb-3 flex items-center gap-2">
                <span>✨</span>
                Matériaux & Draw Calls
                </h4>
                <ul className="space-y-2 text-gray-300 text-sm">
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span><strong>Fusionnez les matériaux similaires</strong> pour réduire les draw calls</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Limitez à <strong>&lt;20 matériaux</strong> par scène</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Désactivez les maps inutiles (AO, roughness si uniforme...)</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span>Utilisez le <strong>frustum culling</strong> (activé par défaut)</span>
                </li>
                </ul>
            </div>

            {/* Outils recommandés */}
            <div>
                <h4 className="text-blue-400 font-bold text-lg mb-3 flex items-center gap-2">
                <span>🛠️</span>
                Outils recommandés
                </h4>
                <ul className="space-y-2 text-gray-300 text-sm">
                <li className="flex gap-2">
                    <span className="text-cyan-400 flex-shrink-0">→</span>
                    <span><strong>gltf-transform</strong> : Optimisation GLB/GLTF</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-cyan-400 flex-shrink-0">→</span>
                    <span><strong>Squoosh</strong> : Compression images WebP</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-cyan-400 flex-shrink-0">→</span>
                    <span><strong>Audacity</strong> : Compression audio MP3</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-cyan-400 flex-shrink-0">→</span>
                    <span><strong>Blender</strong> : Decimate, merge, cleanup</span>
                </li>
                </ul>
            </div>

            <div>
              <h4 className="text-red-400 font-bold text-lg mb-3 flex items-center gap-2">
                <span>⚠️</span>
                Optimisation GLB - Important !
              </h4>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li className="flex gap-2">
                  <span className="text-red-400 flex-shrink-0">⚠️</span>
                  <span><strong>Ne jamais activer "Nettoyer" (prune)</strong> sur vos GLB de production</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-red-400 flex-shrink-0">⚠️</span>
                  <span>Prune supprime les Empty utilisés pour les POIs et camera paths</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-400 flex-shrink-0">✓</span>
                  <span>Utilisez uniquement : Dédupliquer et Souder les vertices</span>
                </li>
              </ul>
            </div>

            {/* Note finale */}
            <div className="bg-cyan-900/30 border border-cyan-500/30 rounded-lg p-4">
                <p className="text-cyan-300 text-sm">
                💡 <strong>Règle d'or :</strong> Testez toujours sur mobile ! Un bon framerate sur PC ne garantit pas un bon framerate sur smartphone.
                </p>
            </div>
            </div>
        </motion.div>
        </>
    )}
    </AnimatePresence>
    </>
  );
}