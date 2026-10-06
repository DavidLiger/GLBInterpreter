"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";

interface CVModalProps {
  isOpen: boolean;
  onClose: () => void;
  cvHtmlUrl?: string;
  cvPdfUrl: string;
}

export default function CVModal({
  isOpen,
  onClose,
  cvHtmlUrl,
  cvPdfUrl,
}: CVModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cvHtmlContent, setCvHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !cvHtmlUrl) return;

    const fetchHTML = async () => {
      setLoading(true);
      try {
        console.log("📥 Chargement CV HTML:", cvHtmlUrl);
        const response = await fetch(cvHtmlUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        setCvHtmlContent(html);
      } catch (error) {
        console.error("❌ Erreur chargement CV HTML:", error);
        setCvHtmlContent(null);
      } finally {
        setLoading(false);
      }
    };

    fetchHTML();
  }, [isOpen, cvHtmlUrl]);

  const handleDownload = async () => {
    try {
      console.log("📥 Téléchargement CV PDF:", cvPdfUrl);
      window.open(cvPdfUrl, '_blank');
    } catch (error) {
      console.error("❌ Erreur téléchargement CV:", error);
      alert("Impossible de télécharger le CV. Veuillez réessayer.");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 25 }}
          onClick={(e) => e.stopPropagation()}
          className={`
            bg-white rounded-2xl shadow-2xl
            flex flex-col
            ${isFullscreen 
              ? 'w-full h-full max-w-full max-h-full' 
              : 'w-full max-w-4xl h-[90vh]'
            }
          `}
          style={{ overflow: 'hidden' }}
        >
          {/* ✅ Header - Styles forcés avec !important */}
          <div 
            className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-purple-600 to-blue-600 text-white"
            style={{
              flexShrink: 0,
              minHeight: '80px',
              maxHeight: '80px',
              height: '80px',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                  <path d="M14 2v6h6"/>
                </svg>
              </div>
              <div>
                {/* ✅ Mobile : CV | Desktop : Curriculum Vitae */}
                <h2 className="text-xl font-bold">
                  <span className="md:hidden">CV</span>
                  <span className="hidden md:inline">Curriculum Vitae</span>
                </h2>
                <p className="text-sm text-white/80">David Liger - Tech Lead Full-Stack</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition text-sm font-medium"
              >
                <Download size={18} />
                <span className="hidden md:inline">Télécharger PDF</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition mr-2"
                aria-label="Fermer"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* ✅ Contenu CV - Utiliser iframe avec srcdoc pour isolation TOTALE */}
          <div 
            className="bg-gray-100"
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin text-4xl mb-4">⚙️</div>
                  <p className="text-gray-600">Chargement du CV...</p>
                </div>
              </div>
            ) : cvHtmlContent ? (
              // ✅ Utiliser iframe avec srcdoc pour isolation complète
              <iframe
                srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta charset="UTF-8">
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <style>
                        body {
                          margin: 0;
                          padding: 16px;
                          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                          background: #f3f4f6;
                          overflow-y: auto;
                        }
                        @media (min-width: 768px) {
                          body {
                            padding: 32px;
                          }
                        }
                      </style>
                    </head>
                    <body>
                      ${cvHtmlContent}
                    </body>
                  </html>
                `}
                className="w-full h-full border-0"
                title="CV David Liger"
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
              />
            ) : cvHtmlUrl ? (
              <iframe
                src={cvHtmlUrl}
                className="w-full h-full border-0"
                title="CV David Liger"
              />
            ) : (
              <iframe
                src={cvPdfUrl}
                className="w-full h-full border-0"
                title="CV David Liger PDF"
              />
            )}
          </div>

          {/* ✅ Footer mobile - Styles forcés */}
          <div 
            className="md:hidden bg-white border-t border-gray-200 shadow-lg"
            style={{
              flexShrink: 0,
              minHeight: '120px',
              maxHeight: '120px',
              height: '120px',
            }}
          >
            <div className="px-6 py-8 pb-safe" style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-2xl font-bold shadow-xl hover:shadow-2xl transition-all text-lg"
              >
                <Download size={24} />
                Télécharger le CV
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}