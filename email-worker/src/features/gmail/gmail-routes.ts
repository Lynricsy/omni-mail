import { Hono } from 'hono'
import type { AppContext } from '../../app/context'
import { clientIp } from '../../shared/http/api-helpers'
import {
  createGmailAccount,
  deleteGmailAccount,
  getGmailAttachment,
  getGmailMessage,
  listGmailAccounts,
  listGmailMessages,
  renameGmailAccount,
  requestGmailSync,
  updateGmailAppPassword,
  verifyGmailAccount,
} from './gmail-api'

export const gmailRoutes = new Hono<AppContext>()

gmailRoutes.get('/gmail/accounts', (context) => (
  listGmailAccounts(context.env, context.get('user'))
))
gmailRoutes.post('/gmail/accounts', (context) => createGmailAccount(
  context.env,
  context.get('user'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
gmailRoutes.patch('/gmail/accounts/:id', (context) => renameGmailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
gmailRoutes.put('/gmail/accounts/:id/app-password', (context) => updateGmailAppPassword(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
gmailRoutes.delete('/gmail/accounts/:id', (context) => deleteGmailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
gmailRoutes.post('/gmail/accounts/:id/verify', (context) => verifyGmailAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
gmailRoutes.post('/gmail/accounts/:id/sync', (context) => requestGmailSync(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  (task) => context.executionCtx.waitUntil(task),
))
gmailRoutes.get('/gmail/messages', (context) => (
  listGmailMessages(context.env, context.get('user'), context.req.raw)
))
gmailRoutes.get('/gmail/accounts/:accountId/messages/:messageId', (context) => getGmailMessage(
  context.env,
  context.get('user'),
  context.req.param('accountId'),
  context.req.param('messageId'),
))
gmailRoutes.get(
  '/gmail/accounts/:accountId/messages/:messageId/attachments/:partId',
  (context) => getGmailAttachment(
    context.env,
    context.get('user'),
    context.req.param('accountId'),
    context.req.param('messageId'),
    context.req.param('partId'),
  ),
)
