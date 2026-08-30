import { Hono } from 'hono'
import type { AppContext } from '../../app/context'
import { clientIp } from '../../shared/http/api-helpers'
import {
  createQqMailAccount,
  deleteQqMailAccount,
  listQqMailAccounts,
  renameQqMailAccount,
  requestQqMailSync,
  updateQqMailAuthorizationCode,
  verifyQqMailAccount,
} from './qq-mail-account-api'
import {
  getQqMailAttachment,
  getQqMailMessage,
  listQqMailMessages,
} from './qq-mail-message-api'
import { sendQqMailMessage } from './qq-mail-send-api'
import { createQqMailIdentity, deleteQqMailIdentity } from './qq-mail-identity-api'

export const qqMailRoutes = new Hono<AppContext>()

qqMailRoutes.get('/qq-mail/accounts', (context) => (
  listQqMailAccounts(context.env, context.get('user'))
))
qqMailRoutes.post('/qq-mail/accounts', (context) => createQqMailAccount(
  context.env,
  context.get('user'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
qqMailRoutes.patch('/qq-mail/accounts/:id', (context) => renameQqMailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
qqMailRoutes.put('/qq-mail/accounts/:id/authorization-code', (context) => (
  updateQqMailAuthorizationCode(
    context.env,
    context.get('user'),
    context.req.param('id'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
qqMailRoutes.delete('/qq-mail/accounts/:id', (context) => deleteQqMailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
qqMailRoutes.post('/qq-mail/accounts/:id/verify', (context) => verifyQqMailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
qqMailRoutes.post('/qq-mail/accounts/:id/sync', (context) => requestQqMailSync(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
  (task) => context.executionCtx.waitUntil(task),
))
qqMailRoutes.post('/qq-mail/accounts/:id/identities', (context) => createQqMailIdentity(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
qqMailRoutes.delete('/qq-mail/accounts/:id/identities/:identityId', (context) => (
  deleteQqMailIdentity(
    context.env,
    context.get('user'),
    context.req.param('id'),
    context.req.param('identityId'),
    clientIp(context.req.raw.headers),
  )
))
qqMailRoutes.get('/qq-mail/messages', (context) => (
  listQqMailMessages(context.env, context.get('user'), context.req.raw)
))
qqMailRoutes.post('/qq-mail/accounts/:id/messages', (context) => sendQqMailMessage(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
qqMailRoutes.get('/qq-mail/accounts/:accountId/messages/:messageId', (context) => (
  getQqMailMessage(
    context.env,
    context.get('user'),
    context.req.param('accountId'),
    context.req.param('messageId'),
  )
))
qqMailRoutes.get(
  '/qq-mail/accounts/:accountId/messages/:messageId/attachments/:partId',
  (context) => getQqMailAttachment(
    context.env,
    context.get('user'),
    context.req.param('accountId'),
    context.req.param('messageId'),
    context.req.param('partId'),
  ),
)
