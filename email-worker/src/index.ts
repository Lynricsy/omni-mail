import { fetchApi } from './app/api'
import { cleanup } from './platform/scheduling/cleanup'
import { consumeEmailQueue, receiveEmail } from './app/handlers/mail'
import type { Env, MailQueueJob } from './app/types'

export { OmniMailBackupWorkflow } from './features/backups/backup'
export { OmniMailCleanupWorkflow } from './platform/scheduling/cleanup-workflow'

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
