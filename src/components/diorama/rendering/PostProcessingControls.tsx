import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { AlertTriangle } from "lucide-react";

interface PostProcessingControlsProps {
  composer: any;
  onUpdate: (type: string, values: any) => void;
}

export default function PostProcessingControls({ composer, onUpdate }: PostProcessingControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [bloom, setBloom] = useState({ strength: 1.2, radius: 0.6, threshold: 0.8 });
  const [ssao, setSSAO] = useState({ kernelRadius: 10, minDistance: 0.005, maxDistance: 0.15 });
  const [dof, setDOF] = useState({ focus: 5.0, aperture: 0.02, maxblur: 0.015, enabled: false });
  const [toneMapping, setToneMapping] = useState({ exposure: 1.2, type: "ACESFilmicToneMapping" });

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-500 bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition"
        title="Post-Processing Controls"
      >
        <Settings size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-500 bg-gray-900 text-white p-4 rounded-lg shadow-2xl max-w-sm w-full max-h-96 overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">Post-Processing</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2 mb-4 p-2 bg-yellow-500/20 border border-yellow-400/40 text-yellow-200 rounded-lg text-sm">
        <AlertTriangle size={18} /> <span>Réglages à reporter dans le JSON</span>
      </div>
      {/* Bloom Controls */}
      <div className="mb-6">
        <h4 className="font-semibold mb-2 text-yellow-400">Bloom</h4>
        <div className="space-y-2">
          <label className="block text-sm">
            Strength: {bloom.strength.toFixed(2)}
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={bloom.strength}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setBloom({ ...bloom, strength: val });
                onUpdate('bloom', { strength: val });
              }}
              className="w-full"
            />
          </label>
          <label className="block text-sm">
            Radius: {bloom.radius.toFixed(2)}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bloom.radius}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setBloom({ ...bloom, radius: val });
                onUpdate('bloom', { radius: val });
              }}
              className="w-full"
            />
          </label>
          <label className="block text-sm">
            Threshold: {bloom.threshold.toFixed(2)}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bloom.threshold}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setBloom({ ...bloom, threshold: val });
                onUpdate('bloom', { threshold: val });
              }}
              className="w-full"
            />
          </label>
        </div>
      </div>

      {/* SSAO Controls */}
      <div className="mb-6">
        <h4 className="font-semibold mb-2 text-blue-400">SSAO</h4>
        <div className="space-y-2">
          <label className="block text-sm">
            Kernel Radius: {ssao.kernelRadius.toFixed(0)}
            <input
              type="range"
              min="1"
              max="32"
              step="1"
              value={ssao.kernelRadius}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setSSAO({ ...ssao, kernelRadius: val });
                onUpdate('ssao', { kernelRadius: val });
              }}
              className="w-full"
            />
          </label>
          <label className="block text-sm">
            Min Distance: {ssao.minDistance.toFixed(4)}
            <input
              type="range"
              min="0.001"
              max="0.02"
              step="0.001"
              value={ssao.minDistance}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setSSAO({ ...ssao, minDistance: val });
                onUpdate('ssao', { minDistance: val });
              }}
              className="w-full"
            />
          </label>
        </div>
      </div>

      {/* Tone Mapping Controls */}
      <div className="mb-6">
        <h4 className="font-semibold mb-2 text-green-400">Tone Mapping</h4>
        <div className="space-y-2">
          <label className="block text-sm">
            Exposure: {toneMapping.exposure.toFixed(2)}
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={toneMapping.exposure}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setToneMapping({ ...toneMapping, exposure: val });
                onUpdate("toneMapping", { exposure: val });
              }}
              className="w-full"
            />
          </label>

          <label className="block text-sm">
            Type:
            <select
              value={toneMapping.type}
              onChange={(e) => {
                const val = e.target.value;
                setToneMapping({ ...toneMapping, type: val });
                onUpdate("toneMapping", { type: val });
              }}
              className="w-full bg-gray-800 text-white p-1 rounded"
            >
              <option value="ACESFilmicToneMapping">ACES Filmic</option>
              <option value="ReinhardToneMapping">Reinhard</option>
              <option value="LinearToneMapping">Linear</option>
              <option value="CineonToneMapping">Cineon</option>
            </select>
          </label>
        </div>
      </div>

      {/* DOF Controls */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-purple-400">Depth of Field</h4>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={dof.enabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setDOF({ ...dof, enabled });
                onUpdate('dof', { enabled });
              }}
              className="mr-2"
            />
            <span className="text-sm">Enable</span>
          </label>
        </div>
        {dof.enabled && (
          <div className="space-y-2">
            <label className="block text-sm">
              Focus: {dof.focus.toFixed(2)}
              <input
                type="range"
                min="0.1"
                max="20"
                step="0.1"
                value={dof.focus}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDOF({ ...dof, focus: val });
                  onUpdate('dof', { focus: val });
                }}
                className="w-full"
              />
            </label>
            <label className="block text-sm">
              Aperture: {dof.aperture.toFixed(3)}
              <input
                type="range"
                min="0.001"
                max="0.1"
                step="0.001"
                value={dof.aperture}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDOF({ ...dof, aperture: val });
                  onUpdate('dof', { aperture: val });
                }}
                className="w-full"
              />
            </label>
            <label className="block text-sm">
              Max Blur: {dof.maxblur.toFixed(3)}
              <input
                type="range"
                min="0"
                max="0.05"
                step="0.001"
                value={dof.maxblur}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDOF({ ...dof, maxblur: val });
                  onUpdate('dof', { maxblur: val });
                }}
                className="w-full"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}