import { describe, expect, it } from 'vitest'
import {
  mergeLoadedDraftFields,
  type ComposeDraftFields,
} from './ComposeDialog'
import type { MailboxAddress } from '../../../shared/api'
import { attachmentSelectionError, formatAttachmentSize } from '../../../shared/mail/attachmentPolicy'

const mailboxes: MailboxAddress[] = [
  { address: 'owner@example.com', domain: 'example.com', isPrimary: true, isActive: true },
  { address: 'owner@other.example', domain: 'other.example', isPrimary: false, isActive: true },
]

describe('compose draft loading', () => {
  it('does not overwrite a subject entered while the saved draft is loading', () => {
    const current: ComposeDraftFields = {
      mailboxAddress: 'owner@example.com',
      to: '',
      subject: 'New eSIM Acasă 80 cannot register on roaming network in China',
      text: '',
    }
    const loaded: ComposeDraftFields = {
      mailboxAddress: 'owner@other.example',
      to: 'support@example.net',
      subject: 'Older saved subject',
      text: 'Older saved body',
    }

    expect(mergeLoadedDraftFields(current, loaded, new Set(['subject']), mailboxes)).toEqual({
      mailboxAddress: 'owner@other.example',
      to: 'support@example.net',
      subject: current.subject,
      text: 'Older saved body',
    })
  })

  it('keeps the current mailbox when a saved mailbox is no longer available', () => {
    const current: ComposeDraftFields = {
      mailboxAddress: 'owner@example.com',
      to: '',
      subject: '',
      text: '',
    }

    expect(mergeLoadedDraftFields(current, {
      ...current,
      mailboxAddress: 'disabled@example.net',
    }, new Set(), mailboxes).mailboxAddress).toBe('owner@example.com')
  })
})

describe('compose attachments', () => {
  it('rejects selections that exceed the count or size limits', () => {
    expect(attachmentSelectionError(
      [{ size: 1024 }, { size: 1024 }],
      Array.from({ length: 4 }, () => ({ size: 1024 })),
    )).toBe('一封邮件最多添加 5 个附件。')
    expect(attachmentSelectionError([{ size: 5 * 1024 * 1024 + 1 }], []))
      .toBe('单个附件不能超过 5 MiB。')
    expect(attachmentSelectionError([{ size: 0 }], []))
      .toBe('请选择要上传的附件。')
    expect(attachmentSelectionError(
      [{ size: 2 * 1024 * 1024 }],
      [{ size: 9 * 1024 * 1024 }],
    )).toBe('附件总大小不能超过 10 MiB。')
  })

  it('formats attachment sizes for the compose list', () => {
    expect(formatAttachmentSize(760)).toBe('760 B')
    expect(formatAttachmentSize(1536)).toBe('1.5 KiB')
    expect(formatAttachmentSize(2 * 1024 * 1024)).toBe('2.0 MiB')
  })
})
