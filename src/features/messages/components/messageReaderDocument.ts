import { api } from '../../../shared/api'
import { forceLightEmailDocument, normalizeRemoteImageSource } from '../../../shared/mail/emailContent'

export function emailImageSources(
  remoteImagesEnabled: boolean,
  proxySource = '',
): string {
  return remoteImagesEnabled && proxySource ? `data: blob: ${proxySource}` : 'data: blob:'
}

export function normalizeContentId(value: string): string {
  let normalized = value.trim().replace(/^cid:/i, '')
  try {
    normalized = decodeURIComponent(normalized)
  } catch {
    // Keep malformed values unchanged so they simply fail to match.
  }
  if (normalized.startsWith('<') && normalized.endsWith('>')) {
    normalized = normalized.slice(1, -1)
  }
  return normalized
}

export function safeEmailHref(value: string): string | null {
  const candidate = value.trim()
  if (!/^https?:\/\//i.test(candidate)) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function emailLinkHref(target: EventTarget | null): string | null {
  if (!target || typeof (target as Element).closest !== 'function') return null
  const link = (target as Element).closest<HTMLAnchorElement>('a[data-omnimail-href]')
  return link ? safeEmailHref(link.dataset.omnimailHref ?? '') : null
}

export function shouldProxyRemoteImage(value: string): boolean {
  return normalizeRemoteImageSource(value) !== null
}

export function buildEmailDocument(
  html: string,
  remoteImagesEnabled: boolean,
  inlineImageSources: ReadonlyMap<string, string>,
): string {
  const proxyUrl = new URL(api.remoteImageUrl('https://example.invalid/image'), window.location.href)
  const proxySource = `${proxyUrl.origin}${proxyUrl.pathname}`
  const policy = `default-src 'none'; img-src ${emailImageSources(remoteImagesEnabled, proxySource)}; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'`
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script, iframe, object, embed, form, base, meta[http-equiv]').forEach((node) => node.remove())
  forceLightEmailDocument(document)
  document.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on') || attribute.name.toLowerCase() === 'srcdoc') {
        node.removeAttribute(attribute.name)
      }
    }
  })
  document.querySelectorAll('img[src]').forEach((image) => {
    const source = image.getAttribute('src') ?? ''
    image.removeAttribute('srcset')
    image.removeAttribute('data-omnimail-src')
    if (/^cid:/i.test(source)) {
      const replacement = inlineImageSources.get(normalizeContentId(source))
      if (replacement) image.setAttribute('src', replacement)
      return
    }
    const remoteSource = remoteImagesEnabled ? normalizeRemoteImageSource(source) : null
    if (remoteSource) {
      image.removeAttribute('src')
      image.setAttribute('data-omnimail-src', api.remoteImageUrl(remoteSource))
    }
  })
  document.querySelectorAll('source[srcset]').forEach((source) => source.removeAttribute('srcset'))
  document.querySelectorAll('a[href]').forEach((link) => {
    const href = safeEmailHref(link.getAttribute('href') ?? '')
    if (!href) {
      link.removeAttribute('href')
      return
    }
    link.removeAttribute('href')
    link.setAttribute('data-omnimail-href', href)
    link.setAttribute('role', 'link')
    link.setAttribute('tabindex', '0')
    link.removeAttribute('target')
    link.removeAttribute('rel')
  })
  const securityHead = `
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${policy}">
    <meta name="referrer" content="no-referrer">
    <meta name="viewport" content="width=device-width, initial-scale=1">`
  const layoutStyles = `
    <style>
      :root { color-scheme: light; }
      html { width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }
      body { width: var(--omnimail-body-width, 100%) !important; max-width: var(--omnimail-body-max-width, 100%) !important; overflow-x: hidden !important; }
      body { min-width: 0 !important; margin: 0 !important; padding: 2px !important; color: #222; background: #fff; font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow-wrap: anywhere; }
      body *, body *::before, body *::after { box-sizing: border-box; }
      body > *, table, tbody, tr, td { min-width: 0 !important; max-width: 100% !important; }
      img, video { max-width: 100% !important; height: auto !important; }
      pre, code { max-width: 100% !important; white-space: pre-wrap !important; overflow-wrap: anywhere; }
      a { color: #1d1d1f; text-decoration: underline; }
      a[data-omnimail-href] { cursor: pointer; }
    </style>`
  return `<!doctype html><html><head>${securityHead}${document.head.innerHTML}${layoutStyles}</head><body>${document.body.innerHTML}</body></html>`
}
