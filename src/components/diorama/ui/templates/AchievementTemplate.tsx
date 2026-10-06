"use client";

import React from "react";
import { Star, Trophy } from "lucide-react";
import type { ExperienceContent } from "@/types/experience";

interface AchievementTemplateProps {
  content: ExperienceContent;
  expanded: boolean;
}

export default function AchievementTemplate({ content, expanded }: AchievementTemplateProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Badge/Icon principal */}
      <div className="flex items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-2 border-yellow-500/50 flex items-center justify-center">
          <Trophy className="text-yellow-400" size={40} />
        </div>
      </div>

      {/* Titre et période */}
      <div className="text-center">
        <h3 className="text-2xl font-bold text-white mb-2">
          {content.title}
        </h3>
        {content.period && (
          <div className="text-sm text-gray-400">
            {content.period.start}
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-gray-300 text-center leading-relaxed">
        {content.description}
      </p>

      {/* Contenu étendu */}
      {expanded && (
        <>
          {/* Contexte détaillé */}
          {content.longDescription && (
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-gray-300 text-sm leading-relaxed">
                {content.longDescription}
              </p>
            </div>
          )}

          {/* Points clés */}
          {content.achievements && content.achievements.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <Star size={18} className="text-yellow-400" />
                Points remarquables
              </h4>
              <ul className="space-y-2">
                {content.achievements.map((achievement, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-gray-300 text-sm"
                  >
                    <span className="text-yellow-400 mt-1">★</span>
                    <span>{achievement}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Métriques */}
          {content.metrics && content.metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {content.metrics.map((metric, i) => (
                <div
                  key={i}
                  className="p-4 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-lg border border-yellow-500/30 text-center"
                >
                  <div className="text-3xl font-bold text-yellow-300">
                    {metric.value}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {metric.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Médias */}
          {content.media && content.media.length > 0 && (
            <div className="space-y-3">
              {content.media.map((media, index) => (
                <div key={index} className="rounded-lg overflow-hidden">
                  <img
                    src={media.url}
                    alt={media.caption || ''}
                    className="w-full rounded-lg"
                  />
                  {media.caption && (
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      {media.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reconnaissance */}
          {content.company && (
            <div className="p-4 bg-white/5 rounded-lg border border-white/10 text-center">
              <p className="text-sm text-gray-400 mb-2">Décerné par</p>
              <p className="text-white font-semibold">{content.company.name}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}