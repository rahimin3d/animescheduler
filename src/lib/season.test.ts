import { describe, expect, it } from 'vitest'
import { GENRE_CHIPS, currentSeason, nextSeason, seasonLabel, splitChips } from './season'

describe('currentSeason — anime seasons start Jan/Apr/Jul/Oct', () => {
  it('January → WINTER of the same year', () => {
    // Jan 10 2026 → winter anime premiered Jan 2026 → WINTER 2026
    expect(currentSeason(new Date(2026, 0, 10))).toEqual({ season: 'WINTER', year: 2026 })
  })
  it('March still WINTER, April flips to SPRING', () => {
    expect(currentSeason(new Date(2026, 2, 15))).toEqual({ season: 'WINTER', year: 2026 })
    expect(currentSeason(new Date(2026, 3, 1))).toEqual({ season: 'SPRING', year: 2026 })
  })
  it('December belongs to FALL (fall premieres run Oct–Dec)', () => {
    expect(currentSeason(new Date(2026, 11, 25))).toEqual({ season: 'FALL', year: 2026 })
  })
  it('September → SUMMER, October → FALL', () => {
    expect(currentSeason(new Date(2026, 8, 20))).toEqual({ season: 'SUMMER', year: 2026 })
    expect(currentSeason(new Date(2026, 9, 1))).toEqual({ season: 'FALL', year: 2026 })
  })
})

describe('nextSeason', () => {
  it('FALL 2026 → WINTER 2027', () => {
    expect(nextSeason({ season: 'FALL', year: 2026 })).toEqual({
      season: 'WINTER',
      year: 2027,
    })
  })
  it('WINTER 2026 → SPRING 2026 (same year)', () => {
    expect(nextSeason({ season: 'WINTER', year: 2026 })).toEqual({
      season: 'SPRING',
      year: 2026,
    })
  })
  it('rolls through SUMMER → FALL same year', () => {
    expect(nextSeason({ season: 'SUMMER', year: 2026 })).toEqual({
      season: 'FALL',
      year: 2026,
    })
  })
})

describe('seasonLabel', () => {
  it('title-cases for display', () => {
    expect(seasonLabel({ season: 'FALL', year: 2026 })).toBe('Fall 2026')
    expect(seasonLabel({ season: 'WINTER', year: 2027 })).toBe('Winter 2027')
  })
})
describe('splitChips', () => {
  it('routes AniList genres to genres and everything else to tags', () => {
    expect(splitChips(['Isekai', 'Romance', 'Magic', 'Action', 'School'])).toEqual({
      genres: ['Romance', 'Action'],
      tags: ['Isekai', 'Magic', 'School'],
    })
  })

  it('every curated chip lands somewhere', () => {
    const { genres, tags } = splitChips(GENRE_CHIPS)
    expect(genres.length + tags.length).toBe(GENRE_CHIPS.length)
    expect(tags).toEqual(['Isekai', 'Magic', 'School'])
  })
})
