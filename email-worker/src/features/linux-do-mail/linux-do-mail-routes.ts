import { Hono } from 'hono'
import type { AppContext } from '../../app/context'
import { clientIp } from '../../shared/http/api-helpers'
import {
  createLinuxDoMailAccount,
  deleteLinuxDoMailAccount,
  getLinuxDoMailAccount,
  getLinuxDoMailMessage,
  getLinuxDoMailSentMessage,
  listLinuxDoMailInbox,
  listLinuxDoMailSent,
  sendLinuxDoMailMessage,
  updateLinuxDoMailCredential,
  verifyLinuxDoMailAccount,
} from './linux-do-mail-api'

export const linuxDoMailRoutes = new Hono<AppContext>()

linuxDoMailRoutes.get('/linux-do-mail/account', (context) => (
  getLinuxDoMailAccount(context.env, context.get('user'))
))
linuxDoMailRoutes.post('/linux-do-mail/account', (context) => (
  createLinuxDoMailAccount(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
linuxDoMailRoutes.delete('/linux-do-mail/account', (context) => (
  deleteLinuxDoMailAccount(
    context.env,
    context.get('user'),
    clientIp(context.req.raw.headers),
  )
))
linuxDoMailRoutes.post('/linux-do-mail/account/verify', (context) => (
  verifyLinuxDoMailAccount(
    context.env,
    context.get('user'),
    clientIp(context.req.raw.headers),
  )
))
linuxDoMailRoutes.put('/linux-do-mail/account/credential', (context) => (
  updateLinuxDoMailCredential(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
linuxDoMailRoutes.get('/linux-do-mail/inbox', (context) => (
  listLinuxDoMailInbox(context.env, context.get('user'), context.req.raw)
))
linuxDoMailRoutes.get('/linux-do-mail/inbox/:uid', (context) => (
  getLinuxDoMailMessage(context.env, context.get('user'), context.req.param('uid'))
))
linuxDoMailRoutes.get('/linux-do-mail/sent', (context) => (
  listLinuxDoMailSent(context.env, context.get('user'), context.req.raw)
))
linuxDoMailRoutes.get('/linux-do-mail/sent/:id', (context) => (
  getLinuxDoMailSentMessage(context.env, context.get('user'), context.req.param('id'))
))
linuxDoMailRoutes.post('/linux-do-mail/messages', (context) => (
  sendLinuxDoMailMessage(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
