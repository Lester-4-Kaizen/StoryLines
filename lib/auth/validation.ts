export type AuthAction = 'signup' | 'login' | 'forgot-password' | 'resend-confirmation' | 'reset-password'
export type AuthField = 'displayName' | 'username' | 'email' | 'password' | 'roles' | 'terms'
export type FieldErrors = Partial<Record<AuthField, string>>

export type SignUpInput = {
  displayName: string
  username: string
  email: string
  password: string
  roles: ('reader' | 'writer' | 'artist')[]
  terms: true
  next: string
}

export type AuthInput =
  | { action: 'signup'; displayName: string; username: string; email: string; password: string; roles: SignUpInput['roles']; terms: true; next: string }
  | { action: 'login'; email: string; password: string }
  | { action: 'forgot-password'; email: string }
  | { action: 'resend-confirmation'; email: string; next: string }
  | { action: 'reset-password'; password: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateEmail(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return 'Ilagay ang email address mo.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Tingnan kung tama ang email address mo.'
  return undefined
}

export function validateUsername(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return 'Pumili ng username.'
  const username = value.trim()
  if (username.length < 3 || username.length > 20) return 'Gumamit ng 3 hanggang 20 character.'
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Letters, numbers, at underscore (_) lang ang puwede.'
  return undefined
}

export function validateAuthInput(value: unknown): { data?: AuthInput; errors: FieldErrors } {
  if (!isRecord(value) || typeof value.action !== 'string') {
    return { errors: { email: 'May problema sa form. Pakisuri at subukan ulit.' } }
  }

  const action = value.action as AuthAction
  if (!['signup', 'login', 'forgot-password', 'resend-confirmation', 'reset-password'].includes(action)) {
    return { errors: { email: 'This request is not supported.' } }
  }

  const errors: FieldErrors = {}
  if (action === 'signup') {
    const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : ''
    if (displayName.length < 2 || displayName.length > 50) errors.displayName = 'Gumamit ng 2 hanggang 50 character para sa display name.'
    const usernameError = validateUsername(value.username)
    if (usernameError) errors.username = usernameError
    const emailError = validateEmail(value.email)
    if (emailError) errors.email = emailError
    if (typeof value.password !== 'string' || value.password.length < 8) errors.password = 'Gumamit ng hindi bababa sa 8 character para sa password.'
    const inputRoles = Array.isArray(value.roles) ? value.roles : []
    const roles = Array.from(new Set(inputRoles.filter((role): role is SignUpInput['roles'][number] => role === 'reader' || role === 'writer' || role === 'artist')))
    if (!roles.length || roles.length !== inputRoles.length) errors.roles = 'Pumili ng kahit isang role.'
    if (value.terms !== true) errors.terms = 'Tanggapin ang Terms at Privacy Policy para magpatuloy.'
    if (Object.keys(errors).length) return { errors }
    return {
      data: {
        action: 'signup',
        displayName,
        username: (value.username as string).trim().toLowerCase(),
        email: (value.email as string).trim().toLowerCase(),
        password: value.password as string,
        roles,
        terms: true,
        next: typeof value.next === 'string' ? value.next : '/',
      },
      errors,
    }
  }

  if (action === 'reset-password') {
    if (typeof value.password !== 'string' || value.password.length < 8) errors.password = 'Gumamit ng hindi bababa sa 8 character para sa password.'
  } else {
    const emailError = validateEmail(value.email)
    if (emailError) errors.email = emailError
    if (action === 'login' && (typeof value.password !== 'string' || !value.password)) errors.password = 'Ilagay ang password mo.'
  }

  if (Object.keys(errors).length) return { errors }
  if (action === 'login') {
    return {
      data: { action, email: (value.email as string).trim().toLowerCase(), password: value.password as string },
      errors,
    }
  }
  if (action === 'reset-password') return { data: { action, password: value.password as string }, errors }
  if (action === 'resend-confirmation') {
    return {
      data: {
        action,
        email: (value.email as string).trim().toLowerCase(),
        next: typeof value.next === 'string' ? value.next : '/',
      },
      errors,
    }
  }
  return { data: { action: 'forgot-password', email: (value.email as string).trim().toLowerCase() }, errors }
}
