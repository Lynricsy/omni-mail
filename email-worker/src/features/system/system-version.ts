import packageMetadata from '../../../../package.json'
import type { Env, SessionUser } from '../../app/types'

const CURRENT_VERSION = packageMetadata.version
const DEFAULT_REPOSITORY = 'mibgb65-cloud/OmniMail'
const GITHUB_API_VERSION = '2026-03-10'
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

interface StableVersion {
  value: string
  parts: [number, number, number]
}

interface LatestRelease {
  version: StableVersion
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function stableVersion(value: unknown): StableVersion | null {
  if (typeof value !== 'string') return null
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())
  if (!match) return null
  return {
    value: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  }
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = stableVersion(candidate)
  const installed = stableVersion(current)
  if (!next || !installed) return false
  for (let index = 0; index < next.parts.length; index += 1) {
    if (next.parts[index] > installed.parts[index]) return true
    if (next.parts[index] < installed.parts[index]) return false
  }
  return false
}

function releaseRepository(env: Env): string | null {
  const repository = env.UPDATE_REPOSITORY?.trim() || DEFAULT_REPOSITORY
  return REPOSITORY_PATTERN.test(repository) ? repository : null
}

function releaseUrl(repository: string): string {
  return `https://github.com/${repository}/releases/latest`
}

function githubHeaders(): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': `OmniMail/${CURRENT_VERSION}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  }
}

async function latestRelease(
  repository: string,
  releaseFetch: typeof fetch,
): Promise<LatestRelease | null> {
  const init: RequestInit & { cf?: Record<string, unknown> } = {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(5_000),
    cf: {
      cacheEverything: true,
      cacheTtlByStatus: { '200-299': 3600, 404: 300, '500-599': 0 },
    },
  }
  const response = await releaseFetch(
    `https://api.github.com/repos/${repository}/releases/latest`,
    init,
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub release request failed: ${response.status}`)
  const release = await response.json() as { tag_name?: unknown }
  const version = stableVersion(release.tag_name)
  if (!version || typeof release.tag_name !== 'string') {
    throw new Error('GitHub release tag is not a stable version')
  }
  return { version }
}

export async function systemVersion(
  env: Env,
  actor: SessionUser,
  releaseFetch: typeof fetch = fetch,
): Promise<Response> {
  if (actor.role !== 'super_admin' && actor.role !== 'admin') {
    return json({ error: '只有管理员可以检查系统版本。' }, 403)
  }
  const repository = releaseRepository(env)
  const base = {
    currentVersion: CURRENT_VERSION,
    releaseUrl: releaseUrl(repository || DEFAULT_REPOSITORY),
    releaseRepository: repository || DEFAULT_REPOSITORY,
    checkedAt: Date.now(),
  }
  if (!repository) {
    return json({
      ...base, latestVersion: null, updateAvailable: false, checkFailed: true,
    })
  }
  try {
    const release = await latestRelease(repository, releaseFetch)
    return json({
      ...base,
      latestVersion: release?.version.value || null,
      updateAvailable: release
        ? isNewerVersion(release.version.value, CURRENT_VERSION)
        : false,
      checkFailed: false,
    })
  } catch {
    return json({
      ...base, latestVersion: null, updateAvailable: false, checkFailed: true,
    })
  }
}
