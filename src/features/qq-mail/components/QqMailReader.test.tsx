import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { QqMailReader } from './QqMailReader'

describe('QqMailReader', () => {
  it('omits the read-state hint from the empty reader', () => {
    const html = renderToStaticMarkup(<QqMailReader
      selected={null} message={null} loading={false} error="" remoteImagesEnabled={false}
      onBack={() => undefined} onRetry={() => undefined} onReply={() => undefined} />)

    expect(html).toContain('选择一封 QQ 邮箱')
    expect(html).not.toContain('打开邮件后会尝试同步')
  })
})
