import { describe, expect, it } from 'vitest'
import {
  microsoftImportAccount,
  microsoftMessageLimit,
} from './microsoft-fields'

describe('Microsoft account input validation', () => {
  it('accepts and retains a confirmed OAuth2 combination password', () => {
    expect(microsoftImportAccount({
      email: ' User@Outlook.com ',
      authMode: 'oauth2',
      password: 'must-not-be-stored',
      persistPasswordConfirmed: true,
      refreshToken: 'refresh-token',
      clientId: '00000000-0000-4000-8000-000000000000',
      authority: 'common',
      name: 'Personal Outlook',
    })).toEqual({
      email: 'user@outlook.com',
      authMode: 'oauth2',
      password: 'must-not-be-stored',
      refreshToken: 'refresh-token',
      clientId: '00000000-0000-4000-8000-000000000000',
      authority: 'common',
      name: 'Personal Outlook',
    })
  })

  it('rejects password-only mode and requires confirmation for combination storage', () => {
    expect(() => microsoftImportAccount({
      email: 'user@outlook.com',
      authMode: 'password',
      password: 'app-password',
      persistPasswordConfirmed: true,
    })).toThrow('仅支持 OAuth2')
    expect(() => microsoftImportAccount({
      email: 'user@outlook.com',
      authMode: 'oauth2',
      password: 'combination-password',
      persistPasswordConfirmed: false,
      refreshToken: 'refresh-token',
      clientId: '00000000-0000-4000-8000-000000000000',
    })).toThrow('确认')
  })

  it('rejects incomplete OAuth pairs, invalid UUIDs, and message limits outside 1..200', () => {
    expect(() => microsoftImportAccount({
      email: 'user@outlook.com',
      authMode: 'oauth2',
      refreshToken: 'refresh-token',
      clientId: 'not-a-uuid',
    })).toThrow('Client ID')
    expect(microsoftMessageLimit(null)).toBe(50)
    expect(microsoftMessageLimit('1')).toBe(1)
    expect(microsoftMessageLimit('200')).toBe(200)
    expect(() => microsoftMessageLimit('0')).toThrow('1–200')
    expect(() => microsoftMessageLimit('201')).toThrow('1–200')
  })
})
