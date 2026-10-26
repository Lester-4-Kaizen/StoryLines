import { AdminLayout } from '@/components/admin/admin-layout'
import { getModerationAccess } from '@/lib/admin/access'

export default async function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, staffRole } = await getModerationAccess()
  const displayName = typeof user.user_metadata.display_name === 'string'
    ? user.user_metadata.display_name
    : typeof user.user_metadata.full_name === 'string'
      ? user.user_metadata.full_name
      : 'Admin'

  return (
    <AdminLayout displayName={displayName} staffRole={staffRole}>
      {children}
    </AdminLayout>
  )
}
