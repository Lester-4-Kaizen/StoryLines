import { isAuthApiError } from '@supabase/supabase-js'

export function isStaleRefreshTokenError(error: unknown): boolean {
  return (
    isAuthApiError(error) &&
    (error.code === 'refresh_token_not_found' ||
      error.code === 'refresh_token_already_used' ||
      error.code === 'session_expired')
  )
}
