"use client";

import React, { useState, useRef } from "react";
import { X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface QRModalProps {
  onOpenChange?: (isOpen: boolean) => void; // ✅
}

export default function QRModal({ onOpenChange }: QRModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("https://dino.editions-liger.com/s/");
  const qrRef = useRef<SVGSVGElement>(null);

  // ✅ MODIFIER le setIsOpen
  const handleSetIsOpen = (value: boolean) => {
    setIsOpen(value);
    onOpenChange?.(value); // ✅ Notifier le parent
  };

  const downloadQRCode = () => {
    if (!qrRef.current) return;
    const svg = new XMLSerializer().serializeToString(qrRef.current);
    const href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = "qrcode.svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  };

  if (process.env.NODE_ENV !== "development") return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => handleSetIsOpen(true)}
        className="fixed bottom-60 right-4 z-[500] bg-green-600 text-white p-3 rounded-full shadow-lg hover:bg-purple-700 transition"
        title="QR Code Generator (Dev Tool)"
      >
        QR
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-md flex flex-col p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">QR Code Generator</h2>
          <button onClick={() => handleSetIsOpen(false)} className="text-gray-400 hover:text-white transition">
            <X size={24} />
          </button>
        </div>

        {/* URL Input */}
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-purple-500 focus:outline-none text-sm"
          />
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-4 p-2 bg-white rounded">
            <QRCodeSVG ref={qrRef} value={url} size={200} marginSize={4} level="M" />
        </div>


        {/* Download Button */}
        <button
          onClick={downloadQRCode}
          className="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
        >
          Télécharger QR Code
        </button>
      </div>
    </div>
  );
}
