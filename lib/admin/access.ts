import 'server-only'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const getModerationAccess = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) redirect('/login?next=%2Fadmin')

  const { data: staffRole, error: roleError } = await supabase.rpc('get_my_moderation_role')
  if (roleError) throw roleError
  if (staffRole !== 'moderator' && staffRole !== 'admin') notFound()

  const { data: accountStatus, error: statusError } = await supabase.rpc('get_my_account_status')
  if (statusError) throw statusError
  if (accountStatus === 'suspended' || accountStatus === 'banned') {
    redirect(`/account-restricted?status=${accountStatus}`)
  }

  return { supabase, user, staffRole }
})

export async function getModerationPageData(section: string, search = '', status = 'open') {
  const { supabase } = await getModerationAccess()
  const { data, error } = await supabase.rpc('admin_moderation_data', {
    p_section: section,
    p_search: search,
    p_status: status,
  })
  if (error) throw error
  return data
}
