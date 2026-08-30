import { franc } from 'franc'
import { parse, serialize, type DefaultTreeAdapterTypes } from 'parse5'
import type { Env, SessionUser, StoredBody } from '../../app/types'

const TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b'
const TRANSLATION_MODEL_VERSION = 'm2m100-1.2b-html-v2'
const MAX_TRANSLATION_CHARACTERS = 20_000
const TRANSLATION_CHUNK_CHARACTERS = 2_500
const TRANSLATION_REQUESTS_PER_MINUTE = 10
const TRANSLATION_CONCURRENCY = 4
const ignoredHtmlElements = new Set(['head', 'script', 'style', 'noscript', 'template'])

const targetLanguages = new Set(['en', 'zh'])
const modelLanguages = new Set([
  'af', 'am', 'ar', 'ast', 'az', 'ba', 'be', 'bg', 'bn', 'br', 'bs', 'ca', 'ceb',
  'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'fa', 'ff', 'fi', 'fr', 'fy',
  'ga', 'gd', 'gl', 'gu', 'ha', 'he', 'hi', 'hr', 'ht', 'hu', 'hy', 'id', 'ig',
  'ilo', 'is', 'it', 'ja', 'jv', 'ka', 'kk', 'km', 'kn', 'ko', 'lb', 'lg', 'ln',
  'lo', 'lt', 'lv', 'mg', 'mk', 'ml', 'mn', 'mr', 'ms', 'my', 'ne', 'nl', 'no',
  'ns', 'oc', 'or', 'pa', 'pl', 'ps', 'pt', 'ro', 'ru', 'sd', 'si', 'sk', 'sl',
  'so', 'sq', 'sr', 'ss', 'su', 'sv', 'sw', 'ta', 'th', 'tl', 'tn', 'tr', 'uk',
  'ur', 'uz', 'vi', 'wo', 'xh', 'yi', 'yo', 'zh', 'zu',
])

const iso3ToModelLanguage: Record<string, string> = {
  afr: 'af', amh: 'am', ara: 'ar', arb: 'ar', ast: 'ast', aze: 'az', azj: 'az',
  bak: 'ba', bel: 'be', ben: 'bn', bos: 'bs', bre: 'br', bul: 'bg', cat: 'ca',
  ceb: 'ceb', ces: 'cs', cmn: 'zh', cym: 'cy', dan: 'da', deu: 'de', ell: 'el',
  eng: 'en', est: 'et', fas: 'fa', fin: 'fi', fra: 'fr', fry: 'fy', ful: 'ff',
  fuv: 'ff', gla: 'gd', gle: 'ga', glg: 'gl', guj: 'gu', hat: 'ht', hau: 'ha',
  heb: 'he', hin: 'hi', hrv: 'hr', hun: 'hu', hye: 'hy', ibo: 'ig', ilo: 'ilo',
  ind: 'id', isl: 'is', ita: 'it', jav: 'jv', jpn: 'ja', kan: 'kn', kat: 'ka',
  kaz: 'kk', khk: 'mn', khm: 'km', kor: 'ko', lao: 'lo', lav: 'lv', lin: 'ln',
  lit: 'lt', ltz: 'lb', lug: 'lg', mal: 'ml', mar: 'mr', mkd: 'mk', mlg: 'mg',
  mon: 'mn', msa: 'ms', mya: 'my', nep: 'ne', nld: 'nl', nno: 'no', nob: 'no',
  nor: 'no', npi: 'ne', nso: 'ns', oci: 'oc', ori: 'or', ory: 'or', pan: 'pa',
  pbt: 'ps', pes: 'fa', plt: 'mg', pol: 'pl', por: 'pt', pus: 'ps', ron: 'ro',
  rus: 'ru', sin: 'si', slk: 'sk', slv: 'sl', snd: 'sd', som: 'so', spa: 'es',
  sqi: 'sq', srp: 'sr', ssw: 'ss', sun: 'su', swa: 'sw', swe: 'sv', swh: 'sw',
  tam: 'ta', tgl: 'tl', tha: 'th', tsn: 'tn', tur: 'tr', ukr: 'uk',
  urd: 'ur', uzb: 'uz', uzn: 'uz', vie: 'vi', wol: 'wo', xho: 'xh', ydd: 'yi',
  yid: 'yi', yor: 'yo', zho: 'zh', zsm: 'ms', zul: 'zu',
}

type OwnedMessage = {
  id: string
  subject: string
  body_key: string | null
  status: string
}

type TranslationCacheRow = {
  source_language: string
  source_hash: string
  model: string
  r2_key: string
}

export interface StoredTranslation {
  sourceLanguage: string
  targetLanguage: string
  subject: string
  text: string
  html: string
}

type TranslationHtmlPart = {
  node: DefaultTreeAdapterTypes.TextNode
  prefix: string
  source: string
  suffix: string
}

export type TranslationHtmlPlan = {
  sources: string[]
  characters: number
  render: (translations: ReadonlyMap<string, string>) => { html: string; text: string }
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store', ...headers },
  })
}

export function normalizeTranslationLanguage(value: string): string | null {
  const base = value.trim().toLowerCase().replaceAll('_', '-').split('-')[0]
  if (modelLanguages.has(base)) return base
  return iso3ToModelLanguage[base] ?? null
}

function htmlLanguage(html: string): string | null {
  const match = html.match(/\b(?:lang|xml:lang)\s*=\s*["']?([a-z]{2,3}(?:[-_][a-z0-9]+)?)/i)
  return match ? normalizeTranslationLanguage(match[1]) : null
}

export function detectTranslationLanguage(text: string, html = ''): string | null {
  const declared = htmlLanguage(html)
  if (declared) return declared
  const sample = text.replace(/https?:\/\/\S+/g, ' ').slice(0, MAX_TRANSLATION_CHARACTERS)
  if (/[\u3040-\u30ff]/u.test(sample)) return 'ja'
  if (/[\uac00-\ud7af]/u.test(sample)) return 'ko'
  if (/[\u3400-\u9fff]/u.test(sample)) return 'zh'
  const detected = franc(sample, {
    minLength: 20,
    only: Object.keys(iso3ToModelLanguage),
  })
  return detected === 'und' ? null : normalizeTranslationLanguage(detected)
}

export function splitTranslationText(
  value: string,
  maximum = TRANSLATION_CHUNK_CHARACTERS,
): string[] {
  const paragraphs = value.trim().split(/\n{2,}/)
  const pieces: string[] = []
  for (const paragraph of paragraphs) {
    let remaining = paragraph.trim()
    while (remaining.length > maximum) {
      const whitespace = remaining.lastIndexOf(' ', maximum)
      const cut = whitespace >= maximum / 2 ? whitespace : maximum
      pieces.push(remaining.slice(0, cut).trim())
      remaining = remaining.slice(cut).trim()
    }
    if (remaining) pieces.push(remaining)
  }
  const chunks: string[] = []
  for (const piece of pieces) {
    const candidate = chunks.length ? `${chunks[chunks.length - 1]}\n\n${piece}` : piece
    if (chunks.length && candidate.length > maximum) chunks.push(piece)
    else if (chunks.length) chunks[chunks.length - 1] = candidate
    else chunks.push(piece)
  }
  return chunks
}

function textPart(value: string): Omit<TranslationHtmlPart, 'node'> | null {
  const match = /^(\s*)([\s\S]*?\S)(\s*)$/u.exec(value)
  if (!match || !/\p{L}/u.test(match[2])) return null
  if (/^(?:https?:\/\/|mailto:|www\.)\S+$/iu.test(match[2])) return null
  return { prefix: match[1], source: match[2], suffix: match[3] }
}

export function prepareTranslationHtml(html: string): TranslationHtmlPlan {
  const document = parse(html)
  const parts: TranslationHtmlPart[] = []

  function visit(node: DefaultTreeAdapterTypes.Node, ignored = false) {
    const nextIgnored = ignored || (
      'tagName' in node && ignoredHtmlElements.has(node.tagName.toLowerCase())
    )
    if (!nextIgnored && node.nodeName === '#text' && 'value' in node) {
      const part = textPart(node.value)
      if (part) parts.push({ node, ...part })
    }
    if ('childNodes' in node) {
      for (const child of node.childNodes) visit(child, nextIgnored)
    }
  }

  visit(document)
  const sources = [...new Set(parts.map((part) => part.source))]
  return {
    sources,
    characters: sources.reduce((total, source) => total + source.length, 0),
    render(translations) {
      for (const part of parts) {
        part.node.value = `${part.prefix}${translations.get(part.source) ?? part.source}${part.suffix}`
      }
      return {
        html: serialize(document),
        text: parts.map((part) => translations.get(part.source) ?? part.source).join('\n'),
      }
    },
  }
}

export async function translationSourceHash(
  subject: string,
  text: string,
  html = '',
): Promise<string> {
  const source = new TextEncoder().encode(`${subject}\u0000${text}\u0000${html}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', source))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function claimTranslationRequest(db: D1Database, userId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  const windowStartedAt = now - (now % 60)
  const result = await db.prepare(
    `INSERT INTO translation_rate_limits (
       user_id, window_started_at, request_count, updated_at
     ) VALUES (?, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       window_started_at = excluded.window_started_at,
       request_count = CASE
         WHEN translation_rate_limits.window_started_at = excluded.window_started_at
           THEN translation_rate_limits.request_count + 1
         ELSE 1
       END,
       updated_at = excluded.updated_at
     WHERE translation_rate_limits.window_started_at != excluded.window_started_at
        OR translation_rate_limits.request_count < ?`,
  ).bind(userId, windowStartedAt, now, TRANSLATION_REQUESTS_PER_MINUTE).run()
  return Boolean(result.meta.changes)
}

async function translatePart(
  ai: Ai,
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  const result = await ai.run(TRANSLATION_MODEL, {
    text,
    source_lang: sourceLanguage,
    target_lang: targetLanguage,
  })
  const translated = 'translated_text' in result ? result.translated_text?.trim() : ''
  return translated || text
}

async function translateText(
  ai: Ai,
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  const chunks = splitTranslationText(text)
  const translated: string[] = []
  for (const chunk of chunks) {
    translated.push(await translatePart(ai, chunk, sourceLanguage, targetLanguage))
  }
  return translated.join('\n\n')
}

async function translateHtmlSources(
  ai: Ai,
  sources: string[],
  sourceLanguage: string,
  targetLanguage: string,
): Promise<Map<string, string>> {
  const translated = new Map<string, string>()
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(TRANSLATION_CONCURRENCY, sources.length) },
    async () => {
      while (cursor < sources.length) {
        const source = sources[cursor]
        cursor += 1
        translated.set(
          source,
          await translateText(ai, source, sourceLanguage, targetLanguage),
        )
      }
    },
  )
  await Promise.all(workers)
  return translated
}

async function cachedTranslation(
  env: Env,
  row: TranslationCacheRow | null,
  sourceLanguage: string,
  sourceHash: string,
): Promise<StoredTranslation | null> {
  if (!row
    || row.source_language !== sourceLanguage
    || row.source_hash !== sourceHash
    || row.model !== TRANSLATION_MODEL_VERSION) return null
  const object = await env.MAIL_BUCKET.get(row.r2_key)
  if (!object) return null
  const value = await object.json<StoredTranslation>().catch(() => null)
  return value && typeof value.html === 'string' ? value : null
}

async function storeTranslation(
  env: Env,
  messageId: string,
  sourceHash: string,
  value: StoredTranslation,
  previousKey: string | null,
): Promise<void> {
  const key = `translations/${messageId}/${value.targetLanguage}-${sourceHash.slice(0, 20)}.json`
  const encoded = JSON.stringify(value)
  await env.MAIL_BUCKET.put(key, encoded, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  })
  try {
    await env.DB.prepare(
      `INSERT INTO message_translations (
         message_id, target_language, source_language, source_hash, model, r2_key, size
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(message_id, target_language) DO UPDATE SET
         source_language = excluded.source_language,
         source_hash = excluded.source_hash,
         model = excluded.model,
         r2_key = excluded.r2_key,
         size = excluded.size,
         created_at = unixepoch()`,
    ).bind(
      messageId,
      value.targetLanguage,
      value.sourceLanguage,
      sourceHash,
      TRANSLATION_MODEL_VERSION,
      key,
      new TextEncoder().encode(encoded).byteLength,
    ).run()
  } catch (error) {
    await env.MAIL_BUCKET.delete(key).catch(() => undefined)
    throw error
  }
  if (previousKey && previousKey !== key) {
    await env.MAIL_BUCKET.delete(previousKey).catch(() => undefined)
  }
}

export async function translateMessage(
  env: Env,
  user: SessionUser,
  messageId: string,
  request: Request,
): Promise<Response> {
  if (!user.canTranslate) {
    return json({
      error: '管理员未为当前账户启用邮件翻译。',
      code: 'translation_forbidden',
    }, 403)
  }
  const input = await request.json<{
    targetLanguage?: unknown
    sourceLanguage?: unknown
  }>().catch(() => ({} as {
    targetLanguage?: unknown
    sourceLanguage?: unknown
  }))
  const targetLanguage = typeof input.targetLanguage === 'string'
    ? normalizeTranslationLanguage(input.targetLanguage)
    : null
  if (!targetLanguage || !targetLanguages.has(targetLanguage)) {
    return json({ error: '目标语言不受支持。' }, 400)
  }
  const message = await env.DB.prepare(
    `SELECT m.id, m.subject, m.body_key, m.status
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE m.id = ? AND mb.user_id = ?`,
  ).bind(messageId, user.id).first<OwnedMessage>()
  if (!message) return json({ error: '邮件不存在。' }, 404)
  if (!message.body_key || !['ready', 'sent'].includes(message.status)) {
    return json({ error: '邮件尚未准备好，无法翻译。' }, 409)
  }
  const bodyObject = await env.MAIL_BUCKET.get(message.body_key)
  if (!bodyObject) return json({ error: '邮件正文为空，无法翻译。' }, 422)
  const body = await bodyObject.json<StoredBody>()
  const text = body.text.trim()
  if (!text) return json({ error: '邮件正文为空，无法翻译。' }, 422)
  const htmlPlan = body.html ? prepareTranslationHtml(body.html) : null
  const sourceCharacters = htmlPlan ? htmlPlan.characters : text.length
  if (sourceCharacters > MAX_TRANSLATION_CHARACTERS) {
    return json({ error: '邮件正文过长，暂不支持翻译。' }, 413)
  }
  const requestedSource = typeof input.sourceLanguage === 'string'
    ? normalizeTranslationLanguage(input.sourceLanguage)
    : null
  const sourceLanguage = requestedSource || detectTranslationLanguage(text, body.html)
  if (!sourceLanguage) return json({ error: '无法可靠识别邮件语言。' }, 422)
  const sourceHash = await translationSourceHash(message.subject, text, body.html)
  const cacheRow = await env.DB.prepare(
    `SELECT source_language, source_hash, model, r2_key
       FROM message_translations
      WHERE message_id = ? AND target_language = ?`,
  ).bind(message.id, targetLanguage).first<TranslationCacheRow>()
  const cached = await cachedTranslation(env, cacheRow, sourceLanguage, sourceHash)
  if (cached) return json({ translation: { ...cached, cached: true } })
  if (sourceLanguage === targetLanguage) {
    return json({
      translation: {
        sourceLanguage,
        targetLanguage,
        subject: message.subject,
        text,
        html: body.html,
        cached: false,
      },
    })
  }
  if (!env.AI) return json({ error: '翻译服务暂时不可用，请稍后重试。' }, 503)
  if (!await claimTranslationRequest(env.DB, user.id)) {
    return json(
      { error: '翻译请求过于频繁，请稍后重试。' },
      429,
      { 'Retry-After': '60' },
    )
  }
  try {
    const [subject, htmlTranslations, plainText] = await Promise.all([
      message.subject
        ? translateText(env.AI, message.subject, sourceLanguage, targetLanguage)
        : Promise.resolve(''),
      htmlPlan
        ? translateHtmlSources(
            env.AI,
            htmlPlan.sources,
            sourceLanguage,
            targetLanguage,
          )
        : Promise.resolve(new Map<string, string>()),
      htmlPlan
        ? Promise.resolve('')
        : translateText(env.AI, text, sourceLanguage, targetLanguage),
    ])
    const rendered = htmlPlan?.render(htmlTranslations)
    const value: StoredTranslation = {
      sourceLanguage,
      targetLanguage,
      subject,
      text: rendered?.text || plainText,
      html: rendered?.html || '',
    }
    await storeTranslation(env, message.id, sourceHash, value, cacheRow?.r2_key ?? null)
    return json({ translation: { ...value, cached: false } })
  } catch (error) {
    console.error('Unable to translate message', { messageId, targetLanguage, error })
    return json({ error: '翻译服务暂时不可用，请稍后重试。' }, 502)
  }
}
