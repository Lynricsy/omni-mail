import { safeLogText } from '../../shared/observability/structured-log'
import type { SessionUser } from '../../app/types'

const MAX_CLIENT_ERROR_BYTES = 16 * 1024

type ClientErrorInput = {
  crashId?: unknown
  errorName?: unknown
  message?: unknown
  componentStack?: unknown
  path?: unknown
}

function field(input: unknown, maximum: number): string {
  return safeLogText(typeof input === 'string' ? input : '', maximum)
}

export async function recordClientError(
  request: Request,
  user: SessionUser,
  authKind: 'cookie' | 'bearer',
): Promise<Response> {
  const declaredSize = Number(request.headers.get('Content-Length') || 0)
  if (declaredSize > MAX_CLIENT_ERROR_BYTES) {
    return Response.json({ error: '客户端错误报告过大。' }, { status: 413 })
  }
  const body = await request.json<ClientErrorInput>().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: '客户端错误报告格式无效。' }, { status: 400 })
  }
  const crashId = field(body.crashId, 80)
  if (!/^ui-[a-z0-9-]+$/i.test(crashId)) {
    return Response.json({ error: '客户端诊断编号无效。' }, { status: 400 })
  }
  console.error({
    level: 'error',
    event: 'client_ui_crash',
    crash_id: crashId,
    user_id: user.id,
    auth_kind: authKind,
    path: field(body.path, 200),
    error_type: field(body.errorName, 100),
    error_message: field(body.message, 500),
    component_stack: field(body.componentStack, 1_500),
    user_agent: safeLogText(request.headers.get('User-Agent') || '', 300),
    cf_ray: safeLogText(request.headers.get('CF-Ray') || '', 100),
  })
  return new Response(null, { status: 204 })
}
