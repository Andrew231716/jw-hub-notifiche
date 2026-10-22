export type LocaleOption = {
  code: string
  label: string
  whatsNewPath: string
}

/** Public “What’s New” pages on jw.org */
export const LOCALES: LocaleOption[] = [
  { code: 'it', label: 'Italiano', whatsNewPath: '/it/cosa-nuovo/' },
  { code: 'en', label: 'English', whatsNewPath: '/en/whats-new/' },
  { code: 'fr', label: 'Français', whatsNewPath: '/fr/nouveautes/' },
  { code: 'de', label: 'Deutsch', whatsNewPath: '/de/neu-auf-unserer-website/' },
  { code: 'es', label: 'Español', whatsNewPath: '/es/novedades/' },
  { code: 'pt', label: 'Português', whatsNewPath: '/pt/Novidades/' },
]

export function localeByCode(code: string): LocaleOption {
  return LOCALES.find((l) => l.code === code) || LOCALES[0]
}
