import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseMicrosoftMessage, parseMicrosoftMetadata } from './microsoft-message-parser'

describe('Microsoft MIME parsing', () => {
  it('parses provider-neutral metadata without Gmail extensions', async () => {
    const headers = new TextEncoder().encode([
      'From: Example Sender <sender@example.com>',
      'To: User <user@outlook.com>',
      'Subject: Outlook message',
      'Date: Tue, 25 Aug 2026 10:00:00 +0800',
      'Message-ID: <outlook-message@example.com>',
      'Content-Type: multipart/mixed; boundary="test"',
      '',
      '',
    ].join('\r\n'))
    await expect(parseMicrosoftMetadata(
      '* 1 FETCH (UID 42 FLAGS (\\Seen) INTERNALDATE "25-Aug-2026 02:00:00 +0000" RFC822.SIZE 321 BODYSTRUCTURE ("TEXT" "PLAIN") {250}',
      headers,
    )).resolves.toMatchObject({
      uid: 42,
      internetMessageId: '<outlook-message@example.com>',
      senderAddress: 'sender@example.com',
      subject: 'Outlook message',
      sizeBytes: 321,
      isRead: true,
      hasAttachments: true,
    })
  })

  it('parses full MIME bodies and attachments on demand', async () => {
    const raw = new Uint8Array(await readFile('email-worker/test-fixtures/outlook-thread.eml'))
    const parsed = await parseMicrosoftMessage(raw, '42')
    expect(parsed.message.subject).toBeTruthy()
    expect(parsed.message.body || parsed.message.html).toBeTruthy()
    expect(Array.isArray(parsed.message.attachments)).toBe(true)
  })
})
