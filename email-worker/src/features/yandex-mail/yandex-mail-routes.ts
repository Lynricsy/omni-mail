import { Hono } from 'hono'
import type { AppContext } from '../../app/context'
import { clientIp } from '../../shared/http/api-helpers'
import {
  createYandexMailAccount,
  deleteYandexMailAccount,
  listYandexMailAccounts,
  renameYandexMailAccount,
  requestYandexMailSync,
  updateYandexMailAppPassword,
  verifyYandexMailAccount,
} from './yandex-mail-account-api'
import {
  getYandexMailAttachment,
  getYandexMailMessage,
  listYandexMailMessages,
} from './yandex-mail-message-api'

export const yandexMailRoutes = new Hono<AppContext>()

yandexMailRoutes.get('/yandex-mail/accounts', (context) => (
  listYandexMailAccounts(context.env, context.get('user'))
))
yandexMailRoutes.post('/yandex-mail/accounts', (context) => createYandexMailAccount(
  context.env,
  context.get('user'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
yandexMailRoutes.patch('/yandex-mail/accounts/:id', (context) => renameYandexMailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
yandexMailRoutes.put('/yandex-mail/accounts/:id/app-password', (context) => (
  updateYandexMailAppPassword(
    context.env,
    context.get('user'),
    context.req.param('id'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
yandexMailRoutes.delete('/yandex-mail/accounts/:id', (context) => deleteYandexMailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
yandexMailRoutes.post('/yandex-mail/accounts/:id/verify', (context) => verifyYandexMailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
yandexMailRoutes.post('/yandex-mail/accounts/:id/sync', (context) => requestYandexMailSync(
  context.env,
  context.get('user'),
  context.req.param('id'),
  (task) => context.executionCtx.waitUntil(task),
))
yandexMailRoutes.get('/yandex-mail/messages', (context) => (
  listYandexMailMessages(context.env, context.get('user'), context.req.raw)
))
yandexMailRoutes.get('/yandex-mail/accounts/:accountId/messages/:messageId', (context) => (
  getYandexMailMessage(
    context.env,
    context.get('user'),
    context.req.param('accountId'),
    context.req.param('messageId'),
  )
))
yandexMailRoutes.get(
  '/yandex-mail/accounts/:accountId/messages/:messageId/attachments/:partId',
  (context) => getYandexMailAttachment(
    context.env,
    context.get('user'),
    context.req.param('accountId'),
    context.req.param('messageId'),
    context.req.param('partId'),
  ),
)
