import { type Dispatch, type SetStateAction, useCallback, useEffect } from 'react'
import { AUTH_REQUIRED_EVENT, type User } from '../../../shared/api'

export function useSessionExpiry(
  user: User | null,
  loading: boolean,
  preservePublicPath: boolean,
  setUser: Dispatch<SetStateAction<User | null>>,
) {
  const clearSession = useCallback(() => {
    setUser(null)
    if (!preservePublicPath) window.history.replaceState(null, '', '/')
  }, [preservePublicPath, setUser])

  useEffect(() => {
    window.addEventListener(AUTH_REQUIRED_EVENT, clearSession)
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, clearSession)
  }, [clearSession])

  useEffect(() => {
    if (!loading && !user && !preservePublicPath && window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/')
    }
  }, [loading, preservePublicPath, user])

  return clearSession
}
