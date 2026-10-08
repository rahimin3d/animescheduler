import { useEffect, useState } from 'react'
import { applyTheme, loadTheme, nextTheme, type ThemePref } from '../lib/theme'

const LABEL: Record<ThemePref, string> = {
  system: '◐ Auto',
  light: '☀ Light',
  dark: '☾ Dark',
}

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(loadTheme)

  useEffect(() => {
    applyTheme(pref)
  }, [pref])

  return (
    <button
      className="btn"
      onClick={() => setPref(nextTheme)}
      title="Switch theme (auto follows your system)"
      aria-label={`Theme: ${pref}. Click to change.`}
    >
      {LABEL[pref]}
    </button>
  )
}
