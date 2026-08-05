export function forceLightEmailColorScheme(css: string): string {
  return css.replace(
    /\(\s*prefers-color-scheme\s*:\s*dark\s*\)/gi,
    '(prefers-color-scheme: omnimail-disabled)',
  )
}

export function normalizeRemoteImageSource(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:') url.protocol = 'https:'
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (
      url.protocol !== 'https:'
      || url.port !== ''
      || url.username !== ''
      || url.password !== ''
      || !hostname.includes('.')
      || hostname.includes(':')
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
    ) return null
    return url.href
  } catch {
    return null
  }
}

export function forceLightEmailDocument(document: Document): void {
  document.querySelectorAll('meta[name="color-scheme"], meta[name="supported-color-schemes"]')
    .forEach((node) => node.remove())
  document.querySelectorAll('style').forEach((style) => {
    style.textContent = forceLightEmailColorScheme(style.textContent ?? '')
  })
}

export function loadDeferredRemoteImages(
  document: Document,
  onSettled: () => void,
): void {
  document.querySelectorAll<HTMLImageElement>('img[data-omnimail-src]').forEach((image) => {
    const source = image.dataset.omnimailSrc
    if (!source) return
    image.addEventListener('load', onSettled, { once: true })
    image.addEventListener('error', onSettled, { once: true })
    image.removeAttribute('data-omnimail-src')
    image.setAttribute('src', source)
  })
}
