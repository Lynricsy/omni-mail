import { describe, expect, it } from 'vitest'
import type { MessageSummary } from './api'
import { newUnreadMessages, rememberMessageIds } from './useNewMailNotifications'

function message(
  id: string,
  direction: MessageSummary['direction'] = 'incoming',
  isRead = false,
): MessageSummary {
  return {
    id,
    direction,
    isRead,
    folder: direction === 'incoming' ? 'inbox' : 'sent',
  } as MessageSummary
}

describe('new mail notifications', () => {
  it('returns only unseen unread inbox messages', () => {
    expect(newUnreadMessages(
      new Set(['old']),
      [
        message('old'),
        message('new'),
        message('read', 'incoming', true),
        message('sent', 'outgoing'),
      ],
    ).map(({ id }) => id)).toEqual(['new'])
  })

  it('keeps previously seen inbox ids when another folder is loaded', () => {
    const remembered = rememberMessageIds(new Set(['old']), [message('sent', 'outgoing')])
    expect(newUnreadMessages(remembered, [message('old')])).toEqual([])
  })
})
