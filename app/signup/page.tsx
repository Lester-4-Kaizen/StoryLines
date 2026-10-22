import { AuthPage } from '@/components/auth/auth-page'
import { safeNextPath } from '@/lib/auth/redirect'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return <AuthPage mode="signup" next={safeNextPath(next)} />
}
