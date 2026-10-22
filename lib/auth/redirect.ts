const LOCAL_ORIGIN = 'https://storylines.invalid'

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'

  try {
    const destination = new URL(value, LOCAL_ORIGIN)
    if (destination.origin !== LOCAL_ORIGIN) return '/'
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return '/'
  }
}
