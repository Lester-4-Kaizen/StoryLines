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
    ? await Promise.all([
      supabase.rpc('get_moderation_warning_appeals'),
      supabase.rpc('get_moderation_suspension_appeals'),
    ]).then(([warningResult, suspensionResult]) => {
      if (warningResult.error) throw warningResult.error
      if (suspensionResult.error) throw suspensionResult.error
      return {
        warningAppeals: warningResult.data,
        suspensionAppeals: suspensionResult.data,
      }
    })
    : await getModerationPageData(section, '', section === 'users' ? 'all' : 'open')
  return <AdminConsole section={section as AdminSection} data={data} />
}
