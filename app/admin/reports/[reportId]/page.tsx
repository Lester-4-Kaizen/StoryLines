import { notFound } from 'next/navigation'
import { AdminConsole, type AdminReport } from '@/components/admin/admin-console'
import { getModerationPageData } from '@/lib/admin/access'

export default async function AdminReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>
}) {
  const { reportId } = await params
  const data = await getModerationPageData('reports')
  const reports = Array.isArray(data) ? data as AdminReport[] : []
  if (!reports.some((report) => report.id === reportId)) notFound()
  return <AdminConsole section="reports" data={reports} selectedReportId={reportId} />
}
