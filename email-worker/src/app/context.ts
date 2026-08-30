import type { Env, SessionUser } from './types'

export type AppContext = {
  Bindings: Env
  Variables: {
    user: SessionUser
    authKind: 'cookie' | 'bearer'
    deviceSessionId?: string
  }
}
