import { describe, expect, it } from 'vitest'
import { searchContent, searchLikePattern } from './message-search'

describe('message body search', () => {
  it('normalizes searchable metadata and body text', () => {
    expect(searchContent({
      subject: ' Hello ',
      sender: 'Sender@Example.com',
      recipients: ['Owner@Example.com'],
      body: 'First\n\nSECOND',
    })).toBe('hello sender@example.com owner@example.com first second')
  })

  it('escapes LIKE wildcards supplied by the user', () => {
    expect(searchLikePattern('50%_off\\now')).toBe('%50\\%\\_off\\\\now%')
  })

  it('bounds indexed content so a D1 row remains below its size limit', () => {
    const content = searchContent({
      subject: '',
      sender: '',
      recipients: [],
      body: 'x'.repeat(300_000),
    })
    expect(content.length).toBe(200_000)
  })
})
