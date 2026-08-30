import { describe, expect, it } from 'vitest'
import { parseGmailMessage, parseGmailMetadata } from './gmail-message-parser'

const encoder = new TextEncoder()

describe('Gmail message parsing', () => {
  it('parses Gmail IDs, flags, labels and encoded headers without numeric precision loss', async () => {
    const message = await parseGmailMetadata(
      '* 4 FETCH (X-GM-MSGID 1278455344230334865 X-GM-THRID 1278455344230334999 X-GM-LABELS (\\Inbox "Important ) Label") UID 42 FLAGS (\\Seen \\Flagged) INTERNALDATE "23-Aug-2026 12:30:00 +0000" RFC822.SIZE 321 BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID CONTENT-TYPE)] {190}',
      encoder.encode([
        'From: =?UTF-8?B?5byg5LiJ?= <sender@example.com>',
        'To: User <user@gmail.com>',
        'Subject: =?UTF-8?B?5rWL6K+V6YKu5Lu2?=',
        'Message-ID: <message@example.com>',
        'Content-Type: multipart/mixed; boundary="mail"',
        '',
        '',
      ].join('\r\n')),
    )

    expect(message).toMatchObject({
      gmailMessageId: '1278455344230334865',
      gmailThreadId: '1278455344230334999',
      imapUid: 42,
      senderName: '张三',
      senderAddress: 'sender@example.com',
      subject: '测试邮件',
      isRead: true,
      isStarred: true,
      hasAttachments: true,
    })
    expect(message.labels).toEqual(['\\Inbox', 'Important ) Label'])
  })

  it('parses a full MIME body and exposes attachment metadata without content', async () => {
    const raw = encoder.encode([
      'From: Sender <sender@example.com>',
      'To: user@gmail.com',
      'Subject: Attachment test',
      'Content-Type: multipart/mixed; boundary="mail"',
      '',
      '--mail',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Hello Gmail',
      '--mail',
      'Content-Type: text/plain; name="notes.txt"',
      'Content-Disposition: attachment; filename="notes.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      'bm90ZXM=',
      '--mail--',
      '',
    ].join('\r\n'))
    const result = await parseGmailMessage(raw, '42')

    expect(result.message.body).toContain('Hello Gmail')
    expect(result.message.attachments).toEqual([expect.objectContaining({
      partId: '0', filename: 'notes.txt', contentType: 'text/plain', size: 5,
    })])
    expect(JSON.stringify(result.message)).not.toContain('bm90ZXM=')
  })
})
