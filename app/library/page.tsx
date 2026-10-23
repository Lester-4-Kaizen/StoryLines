import { LibraryView } from '@/components/views/library-view'
import { getLibraryPageData } from '@/lib/library-data'

export default async function Page() {
  const data = await getLibraryPageData()
  return <LibraryView initialData={data} />
}
