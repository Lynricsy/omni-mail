import { describe, expect, it } from 'vitest'
import {
  LEGACY_RECOVERY_BOUNDARY,
  needsLegacyBootstrap,
  pendingMigrationNames,
} from './migration-plan.mjs'

describe('remote D1 migration planning', () => {
  it('skips the import-style bootstrap for an up-to-date database', () => {
    expect(needsLegacyBootstrap(new Set([
      LEGACY_RECOVERY_BOUNDARY,
      '0022_consistency_guards.sql',
    ]))).toBe(false)
  })

  it('keeps bootstrap recovery for fresh and legacy databases', () => {
    expect(needsLegacyBootstrap(null)).toBe(true)
    expect(needsLegacyBootstrap(new Set(['0017_multiple_drafts.sql']))).toBe(true)
  })

  it('applies NAVER 0033 when reserved migration 0032 is absent', () => {
    expect(pendingMigrationNames(
      ['0031_qq_mail_identities.sql', '0033_naver_mail_imap.sql'],
      new Set(['0031_qq_mail_identities.sql']),
    )).toEqual(['0033_naver_mail_imap.sql'])
  })

  it('applies NAVER 0033 when a test database already recorded NetEase 0032', () => {
    expect(pendingMigrationNames(
      ['0031_qq_mail_identities.sql', '0033_naver_mail_imap.sql'],
      new Set(['0031_qq_mail_identities.sql', '0032_netease_mail.sql']),
    )).toEqual(['0033_naver_mail_imap.sql'])
  })

  it('keeps repeat NAVER deployments idempotent', () => {
    expect(pendingMigrationNames(
      ['0031_qq_mail_identities.sql', '0033_naver_mail_imap.sql'],
      new Set(['0031_qq_mail_identities.sql', '0033_naver_mail_imap.sql']),
    )).toEqual([])
  })

  it('applies Yandex 0034 after NAVER without reusing the reserved number', () => {
    expect(pendingMigrationNames(
      ['0031_qq_mail_identities.sql', '0033_naver_mail_imap.sql', '0034_yandex_mail_imap.sql'],
      new Set(['0031_qq_mail_identities.sql', '0033_naver_mail_imap.sql']),
    )).toEqual(['0034_yandex_mail_imap.sql'])
  })

  it('keeps repeat Yandex deployments idempotent', () => {
    expect(pendingMigrationNames(
      ['0031_qq_mail_identities.sql', '0033_naver_mail_imap.sql', '0034_yandex_mail_imap.sql'],
      new Set([
        '0031_qq_mail_identities.sql',
        '0033_naver_mail_imap.sql',
        '0034_yandex_mail_imap.sql',
      ]),
    )).toEqual([])
  })
})
