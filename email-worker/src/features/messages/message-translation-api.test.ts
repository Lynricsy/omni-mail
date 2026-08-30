import { describe, expect, it, vi } from 'vitest'
import {
  detectTranslationLanguage,
  prepareTranslationHtml,
  splitTranslationText,
  translateMessage,
  translationSourceHash,
  type StoredTranslation,
} from './message-translation-api'
import type { Env, SessionUser, StoredBody } from '../../app/types'

const user = { id: 'user-1', canTranslate: true } as SessionUser
const message = {
  id: 'message-1',
  subject: 'Tvoj novi A1 eSIM',
  body_key: 'bodies/message-1.json',
  status: 'ready',
}
const body: StoredBody = {
  text: 'Tvoj A1 eSIM je spreman za korištenje. Šaljemo upute za jednostavnu aktivaciju.',
  html: '<html lang="hr"><body><p>Tvoj A1 eSIM je spreman.</p></body></html>',
}

type MockOptions = {
  cacheRow?: Record<string, string> | null
  cachedValue?: StoredTranslation
  rateChanges?: number
  ownedMessage?: typeof message | null
  storedBody?: StoredBody
  runAi?: (_model: string, input: { text: string }) => Promise<{ translated_text: string }>
}

function translationEnv(options: MockOptions = {}) {
  const calls: Array<{ sql: string; bindings: unknown[] }> = []
  const aiRun = vi.fn(options.runAi ?? (async (_model: string, input: { text: string }) => ({
    translated_text: `译：${input.text}`,
  })))
  const put = vi.fn(async () => undefined)
  const remove = vi.fn(async () => undefined)
  const get = vi.fn(async (key: string) => {
    if (key === message.body_key) {
      return new Response(JSON.stringify(options.storedBody ?? body))
    }
    if (options.cachedValue && key === options.cacheRow?.r2_key) {
      return new Response(JSON.stringify(options.cachedValue))
    }
    return null
  })
  const db = {
    prepare(sql: string) {
      const call = { sql, bindings: [] as unknown[] }
      calls.push(call)
      const statement = {
        bind(...bindings: unknown[]) {
          call.bindings = bindings
          return statement
        },
        first: async () => {
          if (sql.includes('FROM messages m')) {
            return 'ownedMessage' in options ? options.ownedMessage : message
          }
          if (sql.includes('FROM message_translations')) return options.cacheRow ?? null
          return null
        },
        run: async () => ({
          meta: {
            changes: sql.includes('INSERT INTO translation_rate_limits')
              ? options.rateChanges ?? 1
              : 1,
          },
        }),
      }
      return statement
    },
  }
  return {
    env: {
      DB: db,
      MAIL_BUCKET: { get, put, delete: remove },
      AI: { run: aiRun },
    } as unknown as Env,
    aiRun,
    calls,
    get,
    put,
  }
}

function request(targetLanguage = 'zh') {
  return new Request('https://mail.example.com/api/messages/message-1/translation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLanguage }),
  })
}

describe('translation language handling', () => {
  it('prefers declared HTML language and recognizes short CJK text', () => {
    expect(detectTranslationLanguage(body.text, body.html)).toBe('hr')
    expect(detectTranslationLanguage('欢迎使用你的新邮箱。')).toBe('zh')
  })

  it('splits long text without dropping content', () => {
    const chunks = splitTranslationText('First paragraph.\n\nSecond paragraph is longer.', 24)
    expect(chunks.every((chunk) => chunk.length <= 24)).toBe(true)
    expect(chunks.join(' ')).toContain('Second paragraph')
  })

  it('replaces visible text while preserving the original HTML structure', () => {
    const plan = prepareTranslationHtml(`
      <html><head><style>.cta { color: red }</style></head><body>
        <table style="width: 100%"><tr><td>
          <a href="https://example.com"><strong>Open your account</strong> now</a>
          <img src="https://example.com/banner.png" alt="Banner">
        </td></tr></table>
      </body></html>
    `)
    const result = plan.render(new Map([
      ['Open your account', '打开你的账户'],
      ['now', '立即'],
    ]))

    expect(plan.sources).toEqual(['Open your account', 'now'])
    expect(result.html).toContain('<style>.cta { color: red }</style>')
    expect(result.html).toContain('href="https://example.com"')
    expect(result.html).toContain('src="https://example.com/banner.png"')
    expect(result.html).toContain('<strong>打开你的账户</strong> 立即')
  })
})

describe('message translation endpoint', () => {
  it('rejects disabled users before reading message bodies or cached translations', async () => {
    const mocked = translationEnv()
    const response = await translateMessage(
      mocked.env,
      { ...user, canTranslate: false },
      message.id,
      request(),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'translation_forbidden' })
    expect(mocked.calls).toHaveLength(0)
    expect(mocked.get).not.toHaveBeenCalled()
    expect(mocked.aiRun).not.toHaveBeenCalled()
  })

  it('translates owned stored text and persists a cache entry', async () => {
    const mocked = translationEnv()
    const response = await translateMessage(mocked.env, user, message.id, request())
    const result = await response.json() as { translation: StoredTranslation & { cached: boolean } }

    expect(response.status).toBe(200)
    expect(result.translation).toMatchObject({
      sourceLanguage: 'hr',
      targetLanguage: 'zh',
      subject: `译：${message.subject}`,
      text: '译：Tvoj A1 eSIM je spreman.',
      html: expect.stringContaining('<p>译：Tvoj A1 eSIM je spreman.</p>'),
      cached: false,
    })
    expect(mocked.aiRun).toHaveBeenCalledTimes(2)
    expect(mocked.put).toHaveBeenCalledTimes(1)
    expect(mocked.calls.some(({ sql }) => sql.includes('ON CONFLICT(message_id, target_language)'))).toBe(true)
  })

  it('returns a matching R2 cache without invoking AI', async () => {
    const cachedValue: StoredTranslation = {
      sourceLanguage: 'hr',
      targetLanguage: 'zh',
      subject: '你的新 A1 eSIM',
      text: '你的 A1 eSIM 已准备就绪。',
      html: '<html><body><p>你的 A1 eSIM 已准备就绪。</p></body></html>',
    }
    const sourceHash = await translationSourceHash(message.subject, body.text, body.html)
    const mocked = translationEnv({
      cachedValue,
      cacheRow: {
        source_language: 'hr',
        source_hash: sourceHash,
        model: 'm2m100-1.2b-html-v2',
        r2_key: 'translations/message-1/zh.json',
      },
    })
    const response = await translateMessage(mocked.env, user, message.id, request())
    const result = await response.json() as { translation: StoredTranslation & { cached: boolean } }

    expect(result.translation).toEqual({ ...cachedValue, cached: true })
    expect(mocked.aiRun).not.toHaveBeenCalled()
    expect(mocked.put).not.toHaveBeenCalled()
  })

  it('rate limits uncached inference before calling AI', async () => {
    const mocked = translationEnv({ rateChanges: 0 })
    const response = await translateMessage(mocked.env, user, message.id, request())

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(mocked.aiRun).not.toHaveBeenCalled()
  })

  it('limits concurrent HTML inference below the Worker connection ceiling', async () => {
    let activeRuns = 0
    let maximumRuns = 0
    const paragraphs = Array.from(
      { length: 22 },
      (_, index) => `<p>Squarespace message section ${index}</p>`,
    ).join('')
    const mocked = translationEnv({
      storedBody: {
        text: 'Welcome to Squarespace',
        html: `<html lang="en"><body>${paragraphs}</body></html>`,
      },
      runAi: async (_model, input) => {
        activeRuns += 1
        maximumRuns = Math.max(maximumRuns, activeRuns)
        await new Promise((resolve) => setTimeout(resolve, 1))
        activeRuns -= 1
        return { translated_text: `译：${input.text}` }
      },
    })

    const response = await translateMessage(mocked.env, user, message.id, request())

    expect(response.status).toBe(200)
    expect(maximumRuns).toBeLessThanOrEqual(5)
  })

  it('measures visible HTML instead of markup duplicated in plain text', async () => {
    const html = `<html lang="en"><body><p>Your upgraded SIM plan is ready.</p><!--${'x'.repeat(25_000)}--></body></html>`
    const mocked = translationEnv({ storedBody: { text: html, html } })

    const response = await translateMessage(mocked.env, user, message.id, request())

    expect(response.status).toBe(200)
    expect(mocked.aiRun).toHaveBeenCalledTimes(2)
  })

  it('keeps a source fragment when Workers AI returns an empty translation', async () => {
    const mocked = translationEnv({
      storedBody: {
        text: 'Welcome to Squarespace. TRIAL',
        html: '<html lang="en"><body><p>Welcome to Squarespace.</p><p>TRIAL</p></body></html>',
      },
      runAi: async (_model, input) => ({
        translated_text: input.text === 'TRIAL' ? '' : `译：${input.text}`,
      }),
    })

    const response = await translateMessage(mocked.env, user, message.id, request())
    const result = await response.json() as { translation: StoredTranslation }

    expect(response.status).toBe(200)
    expect(result.translation.html).toContain('<p>译：Welcome to Squarespace.</p>')
    expect(result.translation.html).toContain('<p>TRIAL</p>')
  })

  it('does not expose messages owned by another user', async () => {
    const mocked = translationEnv({ ownedMessage: null })
    const response = await translateMessage(mocked.env, user, message.id, request())

    expect(response.status).toBe(404)
    expect(mocked.get).not.toHaveBeenCalled()
    expect(mocked.aiRun).not.toHaveBeenCalled()
  })
})
