import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  apiEndpointCurl,
  apiEndpointKey,
  apiEndpoints,
} from './apiCatalog'

const routeFiles = [
  'email-worker/src/app/routes/public-routes.ts',
  'email-worker/src/app/routes/account-routes.ts',
  'email-worker/src/app/routes/admin-routes.ts',
  'email-worker/src/app/routes/mail-routes.ts',
  'email-worker/src/features/extension-authorization/extension-authorization-routes.ts',
  'email-worker/src/features/icloud/icloud-routes.ts',
  'email-worker/src/features/gmail/gmail-routes.ts',
  'email-worker/src/features/microsoft/microsoft-routes.ts',
  'email-worker/src/features/qq-mail/qq-mail-routes.ts',
  'email-worker/src/features/naver-mail/naver-mail-routes.ts',
  'email-worker/src/features/yandex-mail/yandex-mail-routes.ts',
  'email-worker/src/features/linux-do-mail/linux-do-mail-routes.ts',
  'email-worker/src/app/routes/mail-feature-routes.ts',
  'email-worker/src/features/outbound/outbound-rate-limit-routes.ts',
  'email-worker/src/features/system/system-version-routes.ts',
]

const routePattern = /(?:app|iCloudRoutes|gmailRoutes|microsoftRoutes|qqMailRoutes|naverMailRoutes|yandexMailRoutes|linuxDoMailRoutes|mailFeatureRoutes|outboundRateLimitRoutes|systemVersionRoutes)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g

function sourceRouteKeys(): string[] {
  return routeFiles.flatMap((filename) => {
    const source = readFileSync(filename, 'utf8')
    return [...source.matchAll(routePattern)].map((match) => {
      const path = match[2].startsWith('/api/') ? match[2] : `/api${match[2]}`
      return `${match[1].toUpperCase()} ${path}`
    })
  }).sort()
}

function endpointFingerprint(endpoint: unknown): string {
  return createHash('sha256').update(JSON.stringify(endpoint)).digest('hex').slice(0, 12)
}

function markdownEndpointRecords(): Array<{ key: string; fingerprint: string }> {
  return readdirSync('docs/api')
    .filter((filename) => filename.endsWith('.md') && filename !== 'README.md')
    .flatMap((filename) => {
      const source = readFileSync(`docs/api/${filename}`, 'utf8')
      return [...source.matchAll(
        /<!-- endpoint:(GET|POST|PUT|PATCH|DELETE) ([^ ]+) catalog:([a-f0-9]{12}) -->/g,
      )].map((match) => ({
        key: `${match[1]} ${match[2]}`,
        fingerprint: match[3],
      }))
    })
    .sort((left, right) => left.key.localeCompare(right.key))
}

describe('API catalog', () => {
  it('documents every Worker HTTP route exactly once', () => {
    const source = sourceRouteKeys()
    const documented = apiEndpoints.map(apiEndpointKey).sort()

    expect(new Set(source).size).toBe(source.length)
    expect(new Set(documented).size).toBe(documented.length)
    expect(documented).toEqual(source)
    expect(documented).toHaveLength(169)
  })

  it('provides usage details and a callable example for every endpoint', () => {
    for (const endpoint of apiEndpoints) {
      expect(endpoint.title.zh).not.toBe('')
      expect(endpoint.title.en).not.toBe('')
      expect(endpoint.description.zh).not.toBe('')
      expect(endpoint.description.en).not.toBe('')
      expect(endpoint.request).not.toBe('')
      expect(endpoint.response).not.toBe('')
      const example = apiEndpointCurl(endpoint, 'https://mail.example.com/api')
      expect(example).toContain(`curl --request ${endpoint.method}`)
      expect(example).toContain('https://mail.example.com/api')
    }
  })

  it('documents every endpoint exactly once in the generated Markdown reference', () => {
    const source = sourceRouteKeys()
    const records = markdownEndpointRecords()
    const documented = records.map((record) => record.key)
    const expected = apiEndpoints.map((endpoint) => ({
      key: apiEndpointKey(endpoint),
      fingerprint: endpointFingerprint(endpoint),
    })).sort((left, right) => left.key.localeCompare(right.key))

    expect(new Set(documented).size).toBe(documented.length)
    expect(documented).toEqual(source)
    expect(records).toEqual(expected)
    expect(readFileSync('docs/api/README.md', 'utf8'))
      .toContain(`当前 Worker 共公开 **${source.length}** 个 HTTP 端点`)
  })
})
