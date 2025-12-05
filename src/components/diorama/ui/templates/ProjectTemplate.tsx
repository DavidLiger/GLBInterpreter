"use client";

import React from "react";
import { ExternalLink, Calendar, Code, Award, Target, Lightbulb } from "lucide-react";
import type { ExperienceContent } from "@/types/experience";

interface ProjectTemplateProps {
  content: ExperienceContent;
  expanded: boolean;
}

export default function ProjectTemplate({ content, expanded }: ProjectTemplateProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Période */}
      {content.period && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Calendar size={16} />
          <span>
            {content.period.start} - {content.period.end === 'present' ? 'Aujourd\'hui' : content.period.end}
          </span>
        </div>
      )}

      {/* Description courte (toujours visible) */}
      <p className="text-gray-300 leading-relaxed">
        {content.description}
      </p>

      {/* Médias */}
      {content.media && content.media.length > 0 && (
        <div className="space-y-4">
          {content.media.map((media, index) => (
            <div key={index} className="rounded-lg overflow-hidden">
              {media.type === 'video' ? (
                <video
                  src={media.url}
                  controls
                  poster={media.thumbnail}
                  className="w-full rounded-lg"
                />
              ) : media.type === 'gallery' ? (
                <div className="grid grid-cols-2 gap-2">
                  <img
                    src={media.url}
                    alt={media.caption || `Image ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                </div>
              ) : (
                <img
                  src={media.url}
                  alt={media.caption || `Image ${index + 1}`}
                  className="w-full rounded-lg"
                />
              )}
              {media.caption && (
                <p className="text-xs text-gray-400 mt-2">{media.caption}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Contenu étendu */}
      {expanded && (
        <>
          {/* Description longue */}
          {content.longDescription && (
            <div className="space-y-2">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <Target size={18} />
                Contexte
              </h4>
              <p className="text-gray-300 leading-relaxed text-sm">
                {content.longDescription}
              </p>
            </div>
          )}

          {/* Défis */}
          {content.challenges && content.challenges.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <Award size={18} />
                Défis
              </h4>
              <ul className="space-y-1 text-sm">
                {content.challenges.map((challenge, i) => (
                  <li key={i} className="text-gray-300 flex items-start gap-2">
                    <span className="text-yellow-400 mt-1">▸</span>
                    <span>{challenge}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Solutions */}
          {content.solutions && content.solutions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <Lightbulb size={18} />
                Solutions
              </h4>
              <ul className="space-y-1 text-sm">
                {content.solutions.map((solution, i) => (
                  <li key={i} className="text-gray-300 flex items-start gap-2">
                    <span className="text-green-400 mt-1">✓</span>
                    <span>{solution}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Métriques */}
          {content.metrics && content.metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {content.metrics.map((metric, i) => (
                <div
                  key={i}
                  className="p-4 bg-white/5 rounded-lg border border-white/10"
                >
                  <div className="text-2xl font-bold text-blue-400">
                    {metric.value}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {metric.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Technologies */}
          {content.technologies && content.technologies.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-white font-semibold flex items-center gap-2">
                <Code size={18} />
                Stack Technique
              </h4>
              <div className="flex flex-wrap gap-2">
                {content.technologies.map((tech, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30"
                  >
                    {tech.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Liens */}
          {content.links && content.links.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-4">
              {content.links.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition text-white text-sm"
                >
                  <span>{link.label}</span>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}