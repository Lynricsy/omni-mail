import { Hono } from 'hono'
import type { AppContext } from '../../app/context'
import { clientIp } from '../../shared/http/api-helpers'
import {
  createNaverMailAccount,
  deleteNaverMailAccount,
  listNaverMailAccounts,
  renameNaverMailAccount,
  requestNaverMailSync,
  updateNaverMailAppPassword,
  verifyNaverMailAccount,
} from './naver-mail-account-api'
import {
  getNaverMailAttachment,
  getNaverMailMessage,
  listNaverMailMessages,
} from './naver-mail-message-api'

export const naverMailRoutes = new Hono<AppContext>()

naverMailRoutes.get('/naver-mail/accounts', (context) => (
  listNaverMailAccounts(context.env, context.get('user'))
))
naverMailRoutes.post('/naver-mail/accounts', (context) => createNaverMailAccount(
  context.env,
  context.get('user'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
naverMailRoutes.patch('/naver-mail/accounts/:id', (context) => renameNaverMailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
naverMailRoutes.put('/naver-mail/accounts/:id/app-password', (context) => (
  updateNaverMailAppPassword(
    context.env,
    context.get('user'),
    context.req.param('id'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
naverMailRoutes.delete('/naver-mail/accounts/:id', (context) => deleteNaverMailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
naverMailRoutes.post('/naver-mail/accounts/:id/verify', (context) => verifyNaverMailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
naverMailRoutes.post('/naver-mail/accounts/:id/sync', (context) => requestNaverMailSync(
  context.env,
  context.get('user'),
  context.req.param('id'),
  (task) => context.executionCtx.waitUntil(task),
))
naverMailRoutes.get('/naver-mail/messages', (context) => (
  listNaverMailMessages(context.env, context.get('user'), context.req.raw)
))
naverMailRoutes.get('/naver-mail/accounts/:accountId/messages/:messageId', (context) => (
  getNaverMailMessage(
    context.env,
    context.get('user'),
    context.req.param('accountId'),
    context.req.param('messageId'),
  )
))
naverMailRoutes.get(
  '/naver-mail/accounts/:accountId/messages/:messageId/attachments/:partId',
  (context) => getNaverMailAttachment(
    context.env,
    context.get('user'),
    context.req.param('accountId'),
    context.req.param('messageId'),
    context.req.param('partId'),
  ),
)
