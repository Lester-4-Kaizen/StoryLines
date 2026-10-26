import { notFound } from 'next/navigation'
import { AdminConsole, type AdminSection } from '@/components/admin/admin-console'
import { getModerationAccess, getModerationPageData } from '@/lib/admin/access'

const sections = ['reports', 'appeals', 'users', 'content', 'audit', 'staff'] as const

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params
  if (!sections.includes(section as (typeof sections)[number])) notFound()
  const { supabase, staffRole } = await getModerationAccess()
  if (section === 'staff' && staffRole !== 'admin') notFound()
  const data = section === 'appeals'
    ? await supabase.rpc('get_moderation_warning_appeals').then(({ data: appeals, error }) => {
      if (error) throw error
      return appeals
    })
    : await getModerationPageData(section, '', section === 'users' ? 'all' : 'open')
  return <AdminConsole section={section as AdminSection} data={data} />
}
