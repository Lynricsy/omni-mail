import { describe, expect, it } from 'vitest'
import { parseICloudSender } from './sender'

describe('iCloud sender display parsing', () => {
  it('recognizes a Hide My Email relay without guessing the original address', () => {
    expect(parseICloudSender(
      'GitHub <noreply_at_github_com_22h56q5td86002_47bfb5aa@icloud.com>',
    )).toEqual({
      name: 'GitHub',
      address: 'noreply_at_github_com_22h56q5td86002_47bfb5aa@icloud.com',
      isHideMyEmailRelay: true,
    })
  })

  it('splits normal named mailboxes and bare addresses', () => {
    expect(parseICloudSender('"GitHub" <noreply@github.com>')).toEqual({
      name: 'GitHub', address: 'noreply@github.com', isHideMyEmailRelay: false,
    })
    expect(parseICloudSender('person@example.com')).toEqual({
      name: '', address: 'person@example.com', isHideMyEmailRelay: false,
    })
  })

  it('preserves malformed text as a display name', () => {
    expect(parseICloudSender('Unknown sender')).toEqual({
      name: 'Unknown sender', address: '', isHideMyEmailRelay: false,
    })
  })
})
