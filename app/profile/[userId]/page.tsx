import { ProfileView } from '@/components/views/profile-view'
import { getProfilePageData } from '@/lib/profile-data'

export default async function PublicProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const initialData = await getProfilePageData(userId)
  return <ProfileView initialData={initialData} />
}
