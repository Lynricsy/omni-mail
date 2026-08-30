import { Hono } from 'hono'
import type { AppContext } from '../../app/context'
import { clientIp } from '../../shared/http/api-helpers'
import {
  deleteMicrosoftAccount,
  importMicrosoftAccounts,
  listMicrosoftAccounts,
  listMicrosoftFolders,
  renameMicrosoftAccount,
  requestMicrosoftSync,
  updateMicrosoftCredential,
  verifyMicrosoftAccount,
} from './microsoft-account-api'
import {
  getMicrosoftAttachment,
  getMicrosoftMessage,
  listMicrosoftMessages,
} from './microsoft-message-api'

export const microsoftRoutes = new Hono<AppContext>()

microsoftRoutes.get('/microsoft/accounts', (context) => (
  listMicrosoftAccounts(context.env, context.get('user'))
))
microsoftRoutes.post('/microsoft/accounts/import', (context) => importMicrosoftAccounts(
  context.env,
  context.get('user'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
microsoftRoutes.patch('/microsoft/accounts/:id', (context) => renameMicrosoftAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
microsoftRoutes.put('/microsoft/accounts/:id/credential', (context) => updateMicrosoftCredential(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
microsoftRoutes.delete('/microsoft/accounts/:id', (context) => deleteMicrosoftAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
microsoftRoutes.post('/microsoft/accounts/:id/verify', (context) => verifyMicrosoftAccount(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
microsoftRoutes.post('/microsoft/accounts/:id/sync', (context) => requestMicrosoftSync(
  context.env,
  context.get('user'),
  context.req.param('id'),
  (task) => context.executionCtx.waitUntil(task),
))
microsoftRoutes.get('/microsoft/accounts/:id/folders', (context) => listMicrosoftFolders(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
microsoftRoutes.get('/microsoft/messages', (context) => listMicrosoftMessages(
  context.env,
  context.get('user'),
  context.req.raw,
))
microsoftRoutes.get(
  '/microsoft/accounts/:accountId/messages/:messageId',
  (context) => getMicrosoftMessage(
    context.env,
    context.get('user'),
    context.req.param('accountId'),
    context.req.param('messageId'),
  ),
)
microsoftRoutes.get(
  '/microsoft/accounts/:accountId/messages/:messageId/attachments/:partId',
  (context) => getMicrosoftAttachment(
    context.env,
    context.get('user'),
    context.req.param('accountId'),
    context.req.param('messageId'),
    context.req.param('partId'),
  ),
)
