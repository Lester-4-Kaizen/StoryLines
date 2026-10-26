import { AdminConsole } from '@/components/admin/admin-console'
import { getModerationPageData } from '@/lib/admin/access'

export default async function AdminOverviewPage() {
  const data = await getModerationPageData('overview')
  return <AdminConsole section="overview" data={data} />
}
