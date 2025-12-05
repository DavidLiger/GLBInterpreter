export interface ExperienceContent {
  id: string;
  template: 'project' | 'job' | 'achievement' | 'skills';
  title: string;
  subtitle?: string;
  period?: {
    start: string; // "2023-01"
    end?: string | 'present'; // "2024-12" ou "present"
  };
  company?: {
    name: string;
    logo?: string;
    url?: string;
  };
  description: string;
  longDescription?: string;
  media?: {
    type: 'video' | 'image' | 'gallery';
    url: string;
    thumbnail?: string;
    caption?: string;
  }[];
  technologies?: {
    name: string;
    icon?: string;
    category?: 'frontend' | 'backend' | 'devops' | 'design' | 'other';
  }[];
  achievements?: string[];
  links?: {
    label: string;
    url: string;
    icon?: string;
  }[];
  metrics?: {
    label: string;
    value: string;
    icon?: string;
  }[];
  context?: string;
  challenges?: string[];
  solutions?: string[];
}