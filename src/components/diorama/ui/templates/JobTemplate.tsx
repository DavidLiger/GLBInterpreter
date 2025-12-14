"use client";

import React from "react";
import { Briefcase, Calendar, MapPin, TrendingUp, Users, ExternalLink } from "lucide-react";
import type { ExperienceContent } from "@/types/experience";

interface JobTemplateProps {
  content: ExperienceContent;
  expanded: boolean;
}

export default function JobTemplate({ content, expanded }: JobTemplateProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Header entreprise */}
      {content.company && (
        <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
          {content.company.logo && (
            <img
              src={content.company.logo}
              alt={content.company.name}
              className="w-16 h-16 rounded-lg object-contain bg-white/10 p-2"
            />
          )}
          <div className="flex-1">
            {/* ✅ Nom cliquable si URL disponible */}
            {content.company.url ? (
              <a
                href={content.company.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white font-bold text-lg hover:text-blue-400 transition inline-flex items-center gap-2 group"
              >
                {content.company.name}
                <ExternalLink 
                  size={16} 
                  className="opacity-0 group-hover:opacity-100 transition" 
                />
              </a>
            ) : (
              <h4 className="text-white font-bold text-lg">
                {content.company.name}
              </h4>
            )}
            
            {content.period && (
              <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                <Calendar size={14} />
                <span>
                  {content.period.start} - {content.period.end === 'present' ? 'Aujourd\'hui' : content.period.end}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Description courte */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-blue-400 font-semibold">
          <Briefcase size={18} />
          <span>Mission</span>
        </div>
        <p className="text-gray-300 leading-relaxed">
          {content.description}
        </p>
      </div>

      {/* Contenu étendu */}
      {expanded && (
        <>
          {/* Contexte */}
          {content.longDescription && (
            <div className="space-y-2">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <MapPin size={18} />
                Contexte
              </h4>
              <p className="text-gray-300 text-sm leading-relaxed">
                {content.longDescription}
              </p>
            </div>
          )}

          {/* Réalisations */}
          {content.achievements && content.achievements.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <TrendingUp size={18} />
                Réalisations clés
              </h4>
              <ul className="space-y-2">
                {content.achievements.map((achievement, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 p-3 bg-green-500/10 rounded-lg border border-green-500/20"
                  >
                    <span className="text-green-400 text-lg mt-0.5">✓</span>
                    <span className="text-gray-300 text-sm">{achievement}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Métriques d'impact */}
          {content.metrics && content.metrics.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <Users size={18} />
                Impact
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {content.metrics.map((metric, i) => (
                  <div
                    key={i}
                    className="p-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg border border-blue-500/30"
                  >
                    <div className="text-3xl font-bold text-blue-300">
                      {metric.value}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technologies utilisées */}
          {content.technologies && content.technologies.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-white font-semibold">Stack Technique</h4>
              
              {/* Grouper par catégorie */}
              {['frontend', 'backend', 'devops', 'other'].map(category => {
                const techs = content.technologies?.filter(t => (t.category || 'other') === category);
                if (!techs || techs.length === 0) return null;

                const categoryLabels = {
                  frontend: 'Frontend',
                  backend: 'Backend',
                  devops: 'DevOps',
                  other: 'Autres'
                };

                return (
                  <div key={category} className="space-y-2">
                    <h5 className="text-xs text-gray-400 uppercase tracking-wide">
                      {categoryLabels[category as keyof typeof categoryLabels]}
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {techs.map((tech, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-gray-700/50 text-gray-300 text-xs rounded-full border border-gray-600/50"
                        >
                          {tech.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Médias */}
          {content.media && content.media.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-white font-semibold">Aperçus</h4>
              <div className="grid grid-cols-1 gap-3">
                {content.media.map((media, index) => (
                  <div key={index} className="rounded-lg overflow-hidden">
                    {media.type === 'video' ? (
                      <video
                        src={media.url}
                        controls
                        poster={media.thumbnail}
                        className="w-full rounded-lg"
                      />
                    ) : (
                      <img
                        src={media.url}
                        alt={media.caption || ''}
                        className="w-full rounded-lg"
                      />
                    )}
                    {media.caption && (
                      <p className="text-xs text-gray-400 mt-2">{media.caption}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}