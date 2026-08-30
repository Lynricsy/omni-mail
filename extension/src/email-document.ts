export function safeEmailDocument(html: string, text: string): string {
  if (!html.trim()) {
    const escaped = text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
    return documentShell(`<pre>${escaped}</pre>`)
  }

  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script, iframe, object, embed, form, base, meta, link')
    .forEach((node) => node.remove())
  document.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || ['srcdoc', 'formaction'].includes(name)) {
        node.removeAttribute(attribute.name)
      }
    }
  })
  document.querySelectorAll('img, source, video, audio').forEach((node) => node.remove())
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    try {
      const url = new URL(link.href)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsafe')
      link.href = url.href
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    } catch {
      link.removeAttribute('href')
    }
  })
  return documentShell(document.body.innerHTML)
}

function documentShell(body: string): string {
  return `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="referrer" content="no-referrer">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; max-width: 100%; }
      body { margin: 0; padding: 18px; color: #222; background: #fff; font: 14px/1.65 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow-wrap: anywhere; }
      img, video { height: auto; }
      table { width: 100% !important; }
      pre { margin: 0; white-space: pre-wrap; font: inherit; }
      a { color: #1d1d1f; text-decoration: underline; }
    </style>
  </head><body>${body}</body></html>`
}
