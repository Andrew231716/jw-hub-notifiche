import {
  BookOpen,
  HelpCircle,
  type LucideIcon,
  Music,
  Newspaper,
  Video,
} from 'lucide-react'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  NEWS: Newspaper,
  NOTIZIE: Newspaper,
  'LA TORRE DI GUARDIA': BookOpen,
  'LA TORRE DI GUARDIA (EDIZIONE PER LO STUDIO)': BookOpen,
  SVEGLIATEVI: BookOpen,
  'VIGILATE!': BookOpen,
  CANZONI: Music,
  VIDEO: Video,
  VIDEOS: Video,
  VIDÉOS: Video,
  VÍDEOS: Video,
  'DOMANDE FREQUENTI': HelpCircle,
  'DOMANDE DAI LETTORI': HelpCircle,
  BIOGRAFIE: BookOpen,
  'ALTRI ARGOMENTI': BookOpen,
  'SCHEDA INFORMATIVA': BookOpen,
}

export function categoryIcon(category: string | null | undefined): LucideIcon {
  if (!category) return BookOpen
  const upper = category.toUpperCase()
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (upper.includes(key)) return icon
  }
  return BookOpen
}
