export const WORK_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Contemporary',
  'Crime',
  'Drama',
  'Fantasy',
  'Historical',
  'Horror',
  'Mystery',
  'Paranormal',
  'Poetry',
  'Romance',
  'Sci-fi',
  'Slice of life',
  'Thriller',
  'Young adult',
  'Other',
] as const

export const WORK_MOODS = [
  'Kilig',
  'Cozy',
  'Heartbreak',
  'Madilim at magulo',
  'Nakakakaba',
  'Comfort read',
] as const

export const WORK_LANGUAGES = ['Filipino', 'English', 'Other'] as const

export function normalizeWorkLanguage(language?: string | null) {
  if (!language) return 'English'
  return language.trim().toLowerCase() === 'tagalog' ? 'Filipino' : language
}

export function normalizeWritingLanguages(languages: string[]) {
  return [...new Set(languages.map((language) => (
    language.trim().toLowerCase() === 'tagalog' ? 'Filipino' : language.trim()
  )).filter(Boolean))]
}
