import { notFound } from 'next/navigation'
import { ReaderView } from '@/components/views/reader-view'
import { getReaderPageData } from '@/lib/reader-data'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workId: string }>
  searchParams: Promise<{ chapter?: string }>
}) {
  const [{ workId }, query] = await Promise.all([params, searchParams])
  const chapterNumber = Number.parseInt(query.chapter ?? '1', 10)
  const data = await getReaderPageData(workId, Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : 1)

  if (!data.work && !data.error) notFound()
  return <ReaderView data={data} initialChapterSelected={Boolean(query.chapter)} />
}
