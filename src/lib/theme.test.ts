import { afterEach, describe, expect, it } from 'vitest'
import { THEME_KEY, applyTheme, loadTheme, nextTheme } from './theme'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })

  it('defaults to system and ignores junk in storage', () => {
    expect(loadTheme()).toBe('system')
    localStorage.setItem(THEME_KEY, 'purple')
    expect(loadTheme()).toBe('system')
  })

  it('pins light/dark on <html> and remembers it; system clears both', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(loadTheme()).toBe('dark')

    applyTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })
})
