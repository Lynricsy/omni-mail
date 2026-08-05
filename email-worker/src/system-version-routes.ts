import { Hono } from 'hono'
import { clientIp } from './api-helpers'
import type { AppContext } from './api'
import {
  startSystemUpdate,
  systemUpdateStatus,
  systemVersion,
} from './system-version'

export const systemVersionRoutes = new Hono<AppContext>()

systemVersionRoutes.get('/admin/version', (context) => (
  systemVersion(context.env, context.get('user'))
))
systemVersionRoutes.post('/admin/version/update', (context) => (
  startSystemUpdate(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
systemVersionRoutes.get('/admin/version/update/:id', (context) => (
  systemUpdateStatus(context.env, context.get('user'), context.req.param('id'))
))
