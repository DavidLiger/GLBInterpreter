"use client";

import React from "react";
import { Code, Layers, Zap, Wrench } from "lucide-react";
import type { ExperienceContent } from "@/types/experience";

interface SkillsTemplateProps {
  content: ExperienceContent;
  expanded: boolean;
}

export default function SkillsTemplate({ content, expanded }: SkillsTemplateProps) {
  const categoryIcons = {
    frontend: <Code size={18} />,
    backend: <Layers size={18} />,
    devops: <Zap size={18} />,
    design: <Wrench size={18} />,
    other: <Wrench size={18} />
  };

  const categoryColors = {
    frontend: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30',
    backend: 'from-green-500/20 to-emerald-500/20 border-green-500/30',
    devops: 'from-purple-500/20 to-pink-500/20 border-purple-500/30',
    design: 'from-orange-500/20 to-red-500/20 border-orange-500/30',
    other: 'from-gray-500/20 to-slate-500/20 border-gray-500/30'
  };

  // Grouper les technos par catégorie
  const groupedTechs = content.technologies?.reduce((acc, tech) => {
    const category = tech.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(tech);
    return acc;
  }, {} as Record<string, typeof content.technologies>);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-2xl font-bold text-white mb-2">
          {content.title}
        </h3>
        {content.subtitle && (
          <p className="text-gray-400 text-sm">{content.subtitle}</p>
        )}
      </div>

      {/* Description */}
      <p className="text-gray-300 text-center leading-relaxed">
        {content.description}
      </p>

      {/* Vue condensée : grille simple */}
      {!expanded && content.technologies && (
        <div className="flex flex-wrap gap-2 justify-center">
          {content.technologies.slice(0, 8).map((tech, i) => (
            <span
              key={i}
              className="px-3 py-1.5 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30"
            >
              {tech.name}
            </span>
          ))}
          {content.technologies.length > 8 && (
            <span className="px-3 py-1.5 text-gray-400 text-xs">
              +{content.technologies.length - 8} autres
            </span>
          )}
        </div>
      )}

      {/* Vue étendue : par catégories */}
      {expanded && groupedTechs && (
        <div className="space-y-4">
          {Object.entries(groupedTechs).map(([category, techs]) => {
            const categoryKey = category as keyof typeof categoryIcons;
            
            return (
              <div
                key={category}
                className={`p-4 rounded-lg border bg-gradient-to-br ${categoryColors[categoryKey]}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  {categoryIcons[categoryKey]}
                  <h4 className="text-white font-semibold capitalize">
                    {category === 'other' ? 'Autres' : category}
                  </h4>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {techs?.map((tech, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 bg-black/20 rounded-lg"
                    >
                      {tech.icon && (
                        <img
                          src={tech.icon}
                          alt={tech.name}
                          className="w-5 h-5 object-contain"
                        />
                      )}
                      <span className="text-sm text-gray-300">{tech.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Contexte étendu */}
      {expanded && content.longDescription && (
        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
          <p className="text-gray-300 text-sm leading-relaxed">
            {content.longDescription}
          </p>
        </div>
      )}

      {/* Réalisations avec ces skills */}
      {expanded && content.achievements && content.achievements.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-white font-semibold">Projets réalisés</h4>
          <ul className="space-y-2">
            {content.achievements.map((achievement, i) => (
              <li
                key={i}
                className="flex items-start gap-3 p-3 bg-white/5 rounded-lg text-sm text-gray-300"
              >
                <span className="text-blue-400 mt-0.5">→</span>
                <span>{achievement}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}