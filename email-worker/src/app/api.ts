import { Hono } from 'hono'
import type { AppContext } from './context'
import { registerMiddleware } from './middleware/register-middleware'
import { registerAccountRoutes } from './routes/account-routes'
import { registerAdminRoutes } from './routes/admin-routes'
import { registerMailRoutes } from './routes/mail-routes'
import { registerPublicRoutes } from './routes/public-routes'
import { logWorkerError } from '../shared/observability/structured-log'

const app = new Hono<AppContext>()

registerMiddleware(app)
registerPublicRoutes(app)
registerAccountRoutes(app)
registerAdminRoutes(app)
registerMailRoutes(app)

app.onError((error, context) => {
  logWorkerError('api_unhandled_error', {
    method: context.req.method,
    path: new URL(context.req.url).pathname,
    cf_ray: context.req.header('CF-Ray') || '',
  }, error)
  return context.json({ error: '服务器暂时无法处理这个请求。' }, 500)
})

app.notFound((context) => context.json({ error: '接口不存在。' }, 404))

export const fetchApi = app.fetch
