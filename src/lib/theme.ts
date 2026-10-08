/** Theme preference: 'system' follows the OS; light/dark pin it via <html data-theme>. */
export type ThemePref = 'system' | 'light' | 'dark'

export const THEME_KEY = 'animeScheduler.theme'

const ORDER: ThemePref[] = ['system', 'light', 'dark']

export function nextTheme(pref: ThemePref): ThemePref {
  return ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]
}

export function loadTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Apply to the document and remember it (storage is best-effort). */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, pref)
  } catch {
    /* private mode / blocked storage — theme still applies for this visit */
  }
}
