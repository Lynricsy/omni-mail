const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 3

function isPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  if (!normalized.includes('.') || normalized.includes(':')) return false
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return false
  return !['.example', '.internal', '.invalid', '.lan', '.local', '.localhost', '.test']
    .some((suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix))
}

export function safeRemoteImageUrl(value: string | null): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:'
      || url.port !== ''
      || url.username !== ''
      || url.password !== ''
      || !isPublicHostname(url.hostname)
    ) return null
    return url
  } catch {
    return null
  }
}

async function fetchRemoteImage(source: URL): Promise<Response | null> {
  let current = source
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(current, {
      headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
      redirect: 'manual',
    })
    if (response.status < 300 || response.status >= 400) return response

    const location = response.headers.get('Location')
    const redirected = location
      ? safeRemoteImageUrl(new URL(location, current).href)
      : null
    if (!redirected) return null
    current = redirected
  }
  return null
}

async function readRemoteImage(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_REMOTE_IMAGE_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export async function proxyRemoteImage(request: Request): Promise<Response> {
  const source = safeRemoteImageUrl(new URL(request.url).searchParams.get('url'))
  if (!source) return Response.json({ error: '图片地址不允许代理。' }, { status: 400 })

  let upstream: Response
  try {
    const response = await fetchRemoteImage(source)
    if (!response) return Response.json({ error: '图片加载失败。' }, { status: 502 })
    upstream = response
  } catch {
    return Response.json({ error: '图片加载失败。' }, { status: 502 })
  }
  if (!upstream.ok) return Response.json({ error: '图片加载失败。' }, { status: 502 })

  const contentType = upstream.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase()
  const contentLength = Number(upstream.headers.get('Content-Length'))
  if (!contentType?.startsWith('image/')) {
    return Response.json({ error: '返回内容不是图片。' }, { status: 415 })
  }
  if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_IMAGE_BYTES) {
    return Response.json({ error: '图片过大。' }, { status: 413 })
  }
  const body = await readRemoteImage(upstream.body)
  if (!body) return Response.json({ error: '图片过大。' }, { status: 413 })

  return new Response(body, {
    headers: {
      'Cache-Control': 'private, max-age=86400',
      'Content-Length': String(body.byteLength),
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
