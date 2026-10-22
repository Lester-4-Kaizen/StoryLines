import { AuthPage } from '@/components/auth/auth-page'
import { safeNextPath } from '@/lib/auth/redirect'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return <AuthPage mode="login" next={safeNextPath(next)} />
}
