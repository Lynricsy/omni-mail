import { describe, expect, it } from 'vitest'
import {
  iCloudImapMessageIsRead,
  iCloudImapReadUpdate,
  iCloudImapSearchCriteria,
} from './icloud-imap-flags'
import { parseICloudMessage } from './icloud-message-parser'

const encoder = new TextEncoder()
const multipartMessage = encoder.encode([
  'From: GitHub <noreply@github.com>',
  'To: alias@icloud.com',
  'Subject: Your GitHub launch code!',
  'Date: Mon, 17 Aug 2026 12:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="omnimail-test"',
  '',
  '--omnimail-test',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Enter code 20076446 at https://github.com/account_verifications',
  '--omnimail-test',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><h1>Your GitHub launch code!</h1><p>Enter <strong>20076446</strong>.</p><a href="https://github.com/account_verifications">Open GitHub</a></body></html>',
  '--omnimail-test--',
  '',
].join('\r\n'))

describe('iCloud IMAP message parsing', () => {
  it('keeps the HTML alternative for a full message detail', async () => {
    const message = await parseICloudMessage(multipartMessage, '42', true)

    expect(message.body).toContain('Enter code 20076446')
    expect(message.html).toContain('<strong>20076446</strong>')
    expect(message.html).toContain('https://github.com/account_verifications')
  })

  it('omits HTML from inbox summaries', async () => {
    const message = await parseICloudMessage(multipartMessage, '42')

    expect(message.preview).toContain('Enter code 20076446')
    expect(message.html).toBe('')
  })

  it('reads the Seen flag without matching similarly named flags', () => {
    expect(iCloudImapMessageIsRead('* 1 FETCH (UID 42 FLAGS (\\Seen \\Answered))')).toBe(true)
    expect(iCloudImapMessageIsRead('* 1 FETCH (UID 42 FLAGS (\\Unseen))')).toBe(false)
    expect(iCloudImapMessageIsRead('* 1 FETCH (UID 42 FLAGS ())')).toBe(false)
  })

  it('builds a silent Seen update only for an unread message', () => {
    expect(iCloudImapReadUpdate('* 1 FETCH (UID 42 FLAGS ())', '42')).toEqual({
      isRead: false,
      markSeenCommand: 'UID STORE 42 +FLAGS.SILENT (\\Seen)',
    })
  })

  it('does not build a Seen update for an already-read message', () => {
    expect(iCloudImapReadUpdate('* 1 FETCH (UID 42 FLAGS (\\Seen))', '42'))
      .toEqual({ isRead: true })
  })

  it('builds an IMAP text search with an optional recipient scope', () => {
    expect(iCloudImapSearchCriteria('release 0.3.6')).toBe('TEXT "release 0.3.6"')
    expect(iCloudImapSearchCriteria('receipt', 'alias@icloud.com')).toBe(
      'HEADER To "alias@icloud.com" TEXT "receipt"',
    )
  })
})
