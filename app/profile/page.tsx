import { redirect } from 'next/navigation'
import { ProfileView } from '@/components/views/profile-view'
import { getProfilePageData } from '@/lib/profile-data'

export default async function Page() {
  const initialData = await getProfilePageData()
  if (!initialData.error && !initialData.currentUserId) redirect('/login?next=%2Fprofile')
  return <ProfileView initialData={initialData} />
}
