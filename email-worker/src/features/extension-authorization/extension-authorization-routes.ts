import type { Hono } from 'hono'
import {
  exchangeExtensionAuthorization,
  issueExtensionAuthorization,
} from './extension-authorization'
import type { AppContext } from '../../app/context'

export function extensionAuthorizationRoutes(app: Hono<AppContext>): void {
  app.post('/api/auth/extension/authorize', async (context) => {
    if (context.get('authKind') !== 'cookie') {
      return context.json({ error: '请在 OmniMail 网站中登录后授权。' }, 403)
    }
    return await issueExtensionAuthorization(
      context.env,
      context.get('user'),
      context.req.raw,
    )
  })
  app.post('/api/auth/extension/exchange', async (context) => (
    await exchangeExtensionAuthorization(context.env, context.req.raw)
  ))
}
