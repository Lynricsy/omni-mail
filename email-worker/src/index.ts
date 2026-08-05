import { fetchApi } from './api'
import { cleanup } from './cleanup'
import { consumeEmailQueue, receiveEmail } from './mail'
import type { Env, MailQueueJob } from './types'

export { OmniMailBackupWorkflow } from './backup'
export { OmniMailCleanupWorkflow } from './cleanup-workflow'

async function fetchRequest(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
  const path = new URL(request.url).pathname
  return path === '/api' || path.startsWith('/api/')
    ? fetchApi(request, env, context)
    : env.ASSETS.fetch(request)
}

export default {
  fetch: fetchRequest,
  email: receiveEmail,
  queue: consumeEmailQueue,
  scheduled: (_controller, env) => cleanup(env),
} satisfies ExportedHandler<Env, MailQueueJob>
