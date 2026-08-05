import packageMetadata from '../../package.json'
import { writeAudit } from './audit'
import type { Env, SessionUser } from './types'

const CURRENT_VERSION = packageMetadata.version
const DEFAULT_REPOSITORY = 'mibgb65-cloud/OmniMail'
const GITHUB_API_VERSION = '2026-03-10'
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const BUILD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COMMIT_PATTERN = /^[0-9a-f]{40}$/i

type AutomaticUpdateReason = 'not_configured' | 'super_admin_required' | null
type BuildState = 'queued' | 'running' | 'succeeded' | 'failed'

interface StableVersion {
  value: string
  parts: [number, number, number]
}

interface LatestRelease {
  tag: string
  version: StableVersion
}

interface BuildConfig {
  accountId: string
  triggerId: string
  token: string
  branch: string
}

interface CloudflareBuild {
  build_uuid?: unknown
  status?: unknown
  build_outcome?: unknown
}

interface CloudflareResponse {
  success?: unknown
  result?: CloudflareBuild
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

function buildConfig(env: Env): BuildConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() || ''
  const triggerId = env.CLOUDFLARE_BUILDS_TRIGGER_ID?.trim() || ''
  const token = env.CLOUDFLARE_BUILDS_API_TOKEN?.trim() || ''
  const branch = env.CLOUDFLARE_BUILDS_BRANCH?.trim() || 'main'
  if (!accountId || !triggerId || !token || !branch || /[\s\0]/.test(branch)) return null
  return { accountId, triggerId, token, branch }
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
  cached: boolean,
): Promise<LatestRelease | null> {
  const init: RequestInit & { cf?: Record<string, unknown> } = {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(5_000),
  }
  if (cached) {
    init.cf = {
      cacheEverything: true,
      cacheTtlByStatus: { '200-299': 3600, 404: 300, '500-599': 0 },
    }
  } else {
    init.cache = 'no-store'
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
  return { tag: release.tag_name.trim(), version }
}

function automaticUpdateReason(env: Env, actor: SessionUser): AutomaticUpdateReason {
  if (actor.role !== 'super_admin') return 'super_admin_required'
  return buildConfig(env) ? null : 'not_configured'
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
  const reason = automaticUpdateReason(env, actor)
  const base = {
    currentVersion: CURRENT_VERSION,
    releaseUrl: releaseUrl(repository || DEFAULT_REPOSITORY),
    releaseRepository: repository || DEFAULT_REPOSITORY,
    automaticUpdate: Boolean(repository) && reason === null,
    automaticUpdateReason: repository ? reason : 'not_configured' as const,
    checkedAt: Date.now(),
  }
  if (!repository) {
    return json({
      ...base, latestVersion: null, updateAvailable: false, checkFailed: true,
    })
  }
  try {
    const release = await latestRelease(repository, releaseFetch, true)
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

async function resolveTagCommit(
  repository: string,
  tag: string,
  releaseFetch: typeof fetch,
): Promise<string> {
  let response = await releaseFetch(
    `https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
    { headers: githubHeaders(), cache: 'no-store', signal: AbortSignal.timeout(5_000) },
  )
  if (!response.ok) throw new Error(`GitHub tag request failed: ${response.status}`)
  let object = (await response.json() as {
    object?: { type?: unknown; sha?: unknown }
  }).object
  for (let depth = 0; depth < 3; depth += 1) {
    if (object?.type === 'commit' && typeof object.sha === 'string'
      && COMMIT_PATTERN.test(object.sha)) return object.sha
    if (object?.type !== 'tag' || typeof object.sha !== 'string'
      || !COMMIT_PATTERN.test(object.sha)) break
    response = await releaseFetch(
      `https://api.github.com/repos/${repository}/git/tags/${object.sha}`,
      { headers: githubHeaders(), cache: 'no-store', signal: AbortSignal.timeout(5_000) },
    )
    if (!response.ok) throw new Error(`GitHub annotated tag request failed: ${response.status}`)
    object = (await response.json() as {
      object?: { type?: unknown; sha?: unknown }
    }).object
  }
  throw new Error('GitHub release tag does not resolve to a commit')
}

function stateOf(build: CloudflareBuild): BuildState {
  if (build.status !== 'stopped') return build.status === 'running' ? 'running' : 'queued'
  return build.build_outcome === 'success' ? 'succeeded' : 'failed'
}

export async function startSystemUpdate(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
  releaseFetch: typeof fetch = fetch,
): Promise<Response> {
  if (actor.role !== 'super_admin') {
    return json({ error: '只有主管理员可以安装系统更新。' }, 403)
  }
  const config = buildConfig(env)
  const repository = releaseRepository(env)
  if (!config || !repository) {
    return json({ error: '当前部署未配置自动更新，请查看发布说明并手动更新。' }, 409)
  }
  const body = await request.json<{ targetVersion?: unknown }>()
    .catch(() => ({} as { targetVersion?: unknown }))
  const target = stableVersion(body.targetVersion)
  if (!target) return json({ error: '目标版本号无效。' }, 400)

  let release: LatestRelease | null
  try {
    release = await latestRelease(repository, releaseFetch, false)
  } catch {
    return json({ error: '无法重新确认最新发布版本，请稍后重试。' }, 502)
  }
  if (!release || release.version.value !== target.value) {
    return json({ error: '最新发布版本已经变化，请重新检查更新。' }, 409)
  }
  if (!isNewerVersion(release.version.value, CURRENT_VERSION)) {
    return json({ error: '当前版本已经是最新版。' }, 409)
  }

  let commitHash: string
  try {
    commitHash = await resolveTagCommit(repository, release.tag, releaseFetch)
  } catch {
    return json({ error: '无法解析发布 Tag 对应的提交，请检查发布配置。' }, 502)
  }

  let response: Response
  try {
    response = await releaseFetch(
      `${CLOUDFLARE_API}/accounts/${encodeURIComponent(config.accountId)}`
        + `/builds/triggers/${encodeURIComponent(config.triggerId)}/builds`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ branch: config.branch, commit_hash: commitHash }),
        signal: AbortSignal.timeout(10_000),
      },
    )
  } catch {
    return json({ error: 'Cloudflare 暂时无法启动更新构建，请稍后重试。' }, 502)
  }
  const result = await response.json().catch(() => ({})) as CloudflareResponse
  const build = result.result || {}
  if (!response.ok || result.success === false
    || typeof build.build_uuid !== 'string' || !BUILD_ID_PATTERN.test(build.build_uuid)) {
    return json({
      error: 'Cloudflare 无法构建这个 Release Tag，请确认连接仓库已同步该版本。',
    }, 502)
  }
  await writeAudit(env, actor.id, 'system.update.start', release.tag, ip, {
    targetVersion: release.version.value,
    commitHash,
    buildId: build.build_uuid,
    repository,
  })
  return json({
    build: {
      id: build.build_uuid,
      targetVersion: release.version.value,
      state: stateOf(build),
    },
  }, 202)
}

export async function systemUpdateStatus(
  env: Env,
  actor: SessionUser,
  buildId: string,
  releaseFetch: typeof fetch = fetch,
): Promise<Response> {
  if (actor.role !== 'super_admin') {
    return json({ error: '只有主管理员可以查看系统更新进度。' }, 403)
  }
  const config = buildConfig(env)
  if (!config) return json({ error: '当前部署未配置自动更新。' }, 409)
  if (!BUILD_ID_PATTERN.test(buildId)) return json({ error: '更新任务编号无效。' }, 400)
  let response: Response
  try {
    response = await releaseFetch(
      `${CLOUDFLARE_API}/accounts/${encodeURIComponent(config.accountId)}`
        + `/builds/builds/${encodeURIComponent(buildId)}`,
      {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(10_000),
      },
    )
  } catch {
    return json({ error: '暂时无法读取 Cloudflare 构建状态。' }, 502)
  }
  const result = await response.json().catch(() => ({})) as CloudflareResponse
  if (!response.ok || result.success === false || !result.result) {
    return json({ error: 'Cloudflare 更新任务不存在或暂时不可用。' }, 502)
  }
  return json({ build: { id: buildId, state: stateOf(result.result) } })
}
