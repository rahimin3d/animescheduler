/** Remembers that this browser has been past the landing page (best-effort). */
export const LANDING_SEEN_KEY = 'animeScheduler.landingSeen'

export function hasSeenLanding(): boolean {
  try {
    return localStorage.getItem(LANDING_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markLandingSeen(): void {
  try {
    localStorage.setItem(LANDING_SEEN_KEY, '1')
  } catch {
    /* private mode — the landing just shows again next visit */
  }
}
