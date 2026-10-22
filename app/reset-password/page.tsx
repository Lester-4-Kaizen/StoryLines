import { AuthPage } from '@/components/auth/auth-page'

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>
}) {
  const { auth } = await searchParams
  return <AuthPage mode="reset-password" authError={auth === 'error'} />
}
