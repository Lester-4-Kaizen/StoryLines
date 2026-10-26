import { AccountRestrictedView } from '@/components/account-restricted-view'

export default async function AccountRestrictedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  return <AccountRestrictedView banned={status === 'banned'} />
}
