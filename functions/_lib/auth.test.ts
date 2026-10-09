import { describe, expect, it } from 'vitest'
import { PBKDF2_ITERATIONS, newPasswordRecord, validateUsername, verifyPassword } from './auth'

describe('password hashing', () => {
  it('stays within the Cloudflare Workers PBKDF2 limit (100k)', () => {
    // Above this, every signup throws NotSupportedError in production (but not in local dev).
    expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(100_000)
  })

  it('verifies the right password and rejects a wrong one', async () => {
    const { salt, hash } = await newPasswordRecord('correct horse battery')
    expect(await verifyPassword('correct horse battery', salt, hash)).toBe(true)
    expect(await verifyPassword('wrong password', salt, hash)).toBe(false)
  })
})

describe('validateUsername', () => {
  it('normalizes valid names and rejects invalid ones with null', () => {
    expect(validateUsername('  Mia_99 ')).toBe('mia_99')
    expect(validateUsername('a!')).toBeNull()
  })
})
