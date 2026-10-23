'use client'

import { useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Crop, ImagePlus, RotateCw, Split, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { FieldSelect } from '@/components/shared/field-select'
import { Panel } from '@/components/shared/panel'
import { WorkMoodSelector } from '@/components/shared/work-mood-selector'
import { useWorks } from '@/lib/works-store'
import { WORK_GENRES, WORK_LANGUAGES } from '@/lib/work-taxonomy'
import type { ComicPage, Route, Work } from '@/lib/types'

type ReadingDirection = NonNullable<Work['comicReadingDirection']>
type ReaderBackground = NonNullable<Work['comicReaderBackground']>
type PageSpacing = NonNullable<Work['comicPageSpacing']>

const MAX_FILE_SIZE = 20 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function ComicEditorView({ go, work }: { go: (route: Route) => void; work?: Work }) {
  const router = useRouter()
  const { draft, addWork, clearDraft, updateWork } = useWorks()
  const [savedWork, setSavedWork] = useState(work ?? null)
  const [pages, setPages] = useState<ComicPage[]>(work?.comicPages ?? [])
  const [episodeTitle, setEpisodeTitle] = useState(work?.title ?? draft?.title ?? 'Episode 1')
  const [authorNote, setAuthorNote] = useState(work?.authorNote ?? '')
  const [synopsis, setSynopsis] = useState(work?.synopsis ?? draft?.synopsis ?? '')
  const [genre, setGenre] = useState(work?.genre ?? draft?.genre ?? 'Select genre')
  const [moods, setMoods] = useState(work?.moods ?? draft?.moods ?? [])
  const [language, setLanguage] = useState(work?.language ?? draft?.language ?? 'English')
  const [rating, setRating] = useState(work?.rating ?? draft?.rating ?? 'All ages')
  const [warnings, setWarnings] = useState(work?.contentWarnings ?? [])
  const [direction, setDirection] = useState<ReadingDirection>(work?.comicReadingDirection ?? 'vertical')
  const [background, setBackground] = useState<ReaderBackground>(work?.comicReaderBackground ?? 'dark')
  const [spacing, setSpacing] = useState<PageSpacing>(work?.comicPageSpacing ?? 'small')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState(work ? 'Saved just now' : 'Not saved yet')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceIndexRef = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const getFields = (comicPages: ComicPage[], status: Work['status']): Omit<Work, 'id' | 'createdAt'> => ({
    title: episodeTitle.trim(),
    type: 'comic',
    authorId: savedWork?.authorId ?? 'me',
    synopsis,
    genre: genre === 'Select genre' ? undefined : genre,
    moods,
    language,
    rating,
    contentWarnings: warnings,
    authorNote,
    comicReadingDirection: direction,
    comicReaderBackground: background,
    comicPageSpacing: spacing,
    comicPages,
    status,
  })

  const save = async (status: Work['status'], nextPages = pages) => {
    if (!episodeTitle.trim()) {
      setError('Ilagay ang episode title bago mag-save.')
      return null
    }
    if (status !== 'Draft' && nextPages.length === 0) {
      setError('Magdagdag muna ng kahit isang page bago mag-publish.')
      return null
    }
    if (status !== 'Draft' && nextPages.some((page) => !page.altText.trim())) {
      setError('Maglagay ng alt text sa bawat page bago mag-publish.')
      return null
    }

    setBusy(true)
    setError(null)
    try {
      const fields = getFields(nextPages, status)
      let result: Work
      if (savedWork) {
        await updateWork(savedWork.id, fields)
        result = { ...savedWork, ...fields }
      } else {
        result = await addWork(fields)
        setSavedWork(result)
        clearDraft()
      }
      setPages(nextPages)
      setNotice(status === 'Draft' ? 'Draft saved just now' : 'Published just now')
      return result
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Hindi na-save ang comic. Subukan ulit.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const uploadFile = async (file: File): Promise<ComicPage> => {
    if (!ACCEPTED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
      throw new Error('Pumili ng PNG, JPG, o WEBP na hindi lalampas sa 20 MB.')
    }
    const tokenResponse = await fetch('/api/creator/comic-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type, fileSize: file.size }),
    })
    const tokenBody = await tokenResponse.json() as { error?: string; uploadUrl?: string; imageId?: string; imageUrl?: string }
    if (!tokenResponse.ok || !tokenBody.uploadUrl || !tokenBody.imageId || !tokenBody.imageUrl) {
      throw new Error(tokenBody.error ?? 'Hindi makakuha ng secure upload link.')
    }
    const formData = new FormData()
    formData.set('file', file)
    const uploadResponse = await fetch(tokenBody.uploadUrl, { method: 'POST', body: formData })
    if (!uploadResponse.ok) throw new Error('Hindi na-upload ang image. Subukan ulit.')
    return { imageId: tokenBody.imageId, imageUrl: tokenBody.imageUrl, altText: '', transcript: '' }
  }

  const deleteImage = async (imageId: string) => {
    const response = await fetch('/api/creator/comic-upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId }),
    })
    const responseBody = await response.json() as { error?: string }
    if (!response.ok) throw new Error(responseBody.error ?? 'Hindi na-delete ang lumang image.')
  }

  const addFiles = async (fileList: FileList | File[], replaceIndex?: number) => {
    const files = Array.from(fileList)
    if (!files.length || uploading) return
    setUploading(true)
    setError(null)
    try {
      let nextPages = [...pages]
      for (const file of files) {
        const uploaded = await uploadFile(file)
        if (replaceIndex !== undefined && files.length === 1) {
          nextPages[replaceIndex] = uploaded
        } else {
          nextPages.push(uploaded)
        }
      }
      const result = await save(savedWork ? savedWork.status : 'Draft', nextPages)
      if (result) {
        if (replaceIndex !== undefined) {
          try {
            await deleteImage(pages[replaceIndex].imageId)
          } catch (cleanupError) {
            setError(cleanupError instanceof Error ? `Na-save ang bagong page pero hindi natanggal ang lumang image: ${cleanupError.message}` : 'Na-save ang bagong page pero hindi natanggal ang lumang image.')
          }
        }
        setNotice(`${files.length} ${files.length === 1 ? 'page' : 'pages'} uploaded · Saved just now`)
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Hindi na-upload ang pages. Subukan ulit.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (replaceInputRef.current) replaceInputRef.current.value = ''
    }
  }

  const changePage = async (index: number, patch: Partial<ComicPage>) => {
    const nextPages = pages.map((page, pageIndex) => pageIndex === index ? { ...page, ...patch } : page)
    setPages(nextPages)
    setNotice('Unsaved changes')
  }

  const movePage = async (index: number, directionStep: -1 | 1) => {
    const destination = index + directionStep
    if (destination < 0 || destination >= pages.length) return
    const nextPages = [...pages]
    ;[nextPages[index], nextPages[destination]] = [nextPages[destination], nextPages[index]]
    const result = await save(savedWork?.status ?? 'Draft', nextPages)
    if (!result) return
  }

  const removePage = async (index: number) => {
    const nextPages = pages.filter((_, pageIndex) => pageIndex !== index)
    const result = await save(nextPages.length ? (savedWork?.status ?? 'Draft') : 'Draft', nextPages)
    if (!result) return
    try {
      await deleteImage(pages[index].imageId)
    } catch (cleanupError) {
      setError(cleanupError instanceof Error ? `Na-delete ang page record pero hindi ang image: ${cleanupError.message}` : 'Na-delete ang page record pero hindi ang image.')
    }
  }

  const transformedFile = async (file: File, operation: 'rotate' | 'crop' | 'split'): Promise<File[]> => {
    const bitmap = await createImageBitmap(file)
    const crops = operation === 'split' ? 2 : 1
    const sourceWidth = operation === 'crop' ? Math.min(bitmap.width, Math.floor(bitmap.height * 0.75)) : bitmap.width
    const sourceHeight = operation === 'split' ? Math.ceil(bitmap.height / 2) : operation === 'crop' ? Math.min(bitmap.height, Math.floor(bitmap.width / 0.75)) : bitmap.height
    const sourceX = operation === 'crop' ? Math.floor((bitmap.width - sourceWidth) / 2) : 0
    const sourceY = operation === 'crop' ? Math.floor((bitmap.height - sourceHeight) / 2) : 0
    const output: File[] = []
    for (let index = 0; index < crops; index++) {
      const canvas = document.createElement('canvas')
      const cropHeight = operation === 'split' ? Math.min(sourceHeight, bitmap.height - index * sourceHeight) : sourceHeight
      const rotate = operation === 'rotate'
      canvas.width = rotate ? bitmap.height : sourceWidth
      canvas.height = rotate ? bitmap.width : cropHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Hindi maproseso ang image sa browser na ito.')
      if (rotate) {
        context.translate(canvas.width, 0)
        context.rotate(Math.PI / 2)
      }
      context.drawImage(bitmap, sourceX, operation === 'split' ? index * sourceHeight : sourceY, sourceWidth, cropHeight, 0, 0, rotate ? bitmap.width : sourceWidth, rotate ? bitmap.height : cropHeight)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Hindi ma-convert ang image.')), file.type))
      output.push(new File([blob], file.name.replace(/\.[^.]+$/, '') + (operation === 'split' ? `-${index + 1}` : '') + '.webp', { type: blob.type || 'image/webp' }))
    }
    bitmap.close()
    return output
  }

  const transformPage = async (index: number, operation: 'rotate' | 'crop' | 'split') => {
    const response = await fetch(pages[index].imageUrl)
    if (!response.ok) {
      setError('Hindi ma-load ang page image para ma-edit.')
      return
    }
    const file = new File([await response.blob()], `page-${index + 1}.webp`, { type: 'image/webp' })
    setUploading(true)
    setError(null)
    try {
      const transformed = await transformedFile(file, operation)
      const transformedPages: ComicPage[] = []
      for (const item of transformed) transformedPages.push(await uploadFile(item))
      const next = [...pages]
      next.splice(index, 1, ...transformedPages)
      const result = await save(savedWork?.status ?? 'Draft', next)
      if (result) {
        try {
          await deleteImage(pages[index].imageId)
        } catch (cleanupError) {
          setError(cleanupError instanceof Error ? `Na-save ang na-edit na page pero hindi natanggal ang lumang image: ${cleanupError.message}` : 'Na-save ang na-edit na page pero hindi natanggal ang lumang image.')
        }
      }
    } catch (transformError) {
      setError(transformError instanceof Error ? transformError.message : 'Hindi na-edit ang image.')
    } finally {
      setUploading(false)
    }
  }

  const onDropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragIndex(null)
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files)
  }

  const saveDraft = async () => {
    const result = await save('Draft')
    if (result) setSavedWork(result)
  }

  const publish = async () => {
    const result = await save('Ongoing')
    if (!result) return
    router.push(`/works/${result.id}`)
  }

  const selectStyle = (selected: boolean) => `min-h-11 rounded-full border px-4 text-left text-sm ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-accent'}`
  const title = savedWork?.title ?? draft?.title ?? 'Untitled Comic'
  const previewBackground = { dark: 'bg-stone-950', light: 'bg-white', paper: 'bg-[#f1e3cb]' }[background]

  return (
    <CreatorFrame eyebrow="Comic editor" title={`${title} · ${episodeTitle || 'Episode 1'}`} go={go}>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Panel className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">1 · How should readers read it?</h2>
              <p aria-live="polite" className="text-xs text-muted-foreground">{notice}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ['vertical', 'Vertical scroll', 'Long strips, webtoon style'],
                ['page', 'Page by page', 'Left to right, like a book'],
                ['rtl', 'Right to left', 'Manga style'],
              ] as const).map(([value, label, description]) => (
                <button key={value} type="button" aria-pressed={direction === value} onClick={() => setDirection(value)} className={`${selectStyle(direction === value)} rounded-xl p-3`}>
                  <span className="block font-bold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">2 · Add pages</h2>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDropFiles}
              className="mt-3 flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed border-accent/50 bg-muted/20 p-4 text-center"
            >
              <Upload className="size-5 text-accent" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold">Drop files here or choose from your device</p>
              <p className="mt-1 text-xs text-muted-foreground">PNG, JPG or WEBP · up to 20MB each · select many at once · tall strips are fine</p>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">Page images use Cloudflare Images delivery. Unpublished page records stay private, but anyone with an image URL may view that image.</p>
              <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="mt-3 min-h-11 rounded-full">
                <ImagePlus data-icon="inline-start" /> {uploading ? 'Uploading…' : 'Choose pages'}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(event) => event.target.files && void addFiles(event.target.files)} aria-label="Choose comic pages" />
            </div>
            {pages.length > 0 && (
              <>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pages · drag or use arrows to reorder</h3>
                  <span className="text-xs text-muted-foreground">{pages.length} pages</span>
                </div>
                <ol className="mt-2 flex gap-3 overflow-x-auto pb-2">
                  {pages.map((page, index) => (
                    <li
                      key={page.imageId}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (dragIndex === null || dragIndex === index) return
                        const nextPages = [...pages]
                        const [moved] = nextPages.splice(dragIndex, 1)
                        nextPages.splice(index, 0, moved)
                        setDragIndex(null)
                        void save(savedWork?.status ?? 'Draft', nextPages)
                      }}
                      className="w-24 shrink-0 cursor-grab active:cursor-grabbing"
                    >
                      <div className={`relative h-32 overflow-hidden rounded-lg border-2 ${dragIndex === index ? 'border-accent' : 'border-border'}`}>
                        <img src={page.imageUrl} alt={page.altText || `Comic page ${index + 1} thumbnail`} className="size-full object-cover" />
                        <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-bold">{index + 1}</span>
                        <div className="absolute bottom-1 right-1 flex gap-1">
                          <button type="button" disabled={index === 0 || busy || uploading} aria-label={`Move page ${index + 1} up`} onClick={() => void movePage(index, -1)} className="inline-flex size-8 items-center justify-center rounded-full bg-background/90 disabled:opacity-40"><ArrowUp className="size-3.5" /></button>
                          <button type="button" disabled={index === pages.length - 1 || busy || uploading} aria-label={`Move page ${index + 1} down`} onClick={() => void movePage(index, 1)} className="inline-flex size-8 items-center justify-center rounded-full bg-background/90 disabled:opacity-40"><ArrowDown className="size-3.5" /></button>
                        </div>
                      </div>
                      <span className="mt-1 block truncate text-[10px]">{page.altText.trim() ? 'Alt text added' : 'Needs alt text'}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Panel>

          {pages.map((page, index) => (
            <Panel key={page.imageId} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Page {index + 1}</h2>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={uploading} onClick={() => void transformPage(index, 'crop')} className="min-h-10 rounded-full px-3 text-xs"><Crop className="mr-1 size-3.5" /> Crop to 3:4</Button>
                  <Button type="button" variant="outline" disabled={uploading} onClick={() => void transformPage(index, 'rotate')} className="min-h-10 rounded-full px-3 text-xs"><RotateCw className="mr-1 size-3.5" /> Rotate</Button>
                  <Button type="button" variant="outline" disabled={uploading} onClick={() => void transformPage(index, 'split')} className="min-h-10 rounded-full px-3 text-xs"><Split className="mr-1 size-3.5" /> Split long image</Button>
                  <Button type="button" variant="outline" disabled={uploading} onClick={() => { replaceIndexRef.current = index; replaceInputRef.current?.click() }} className="min-h-10 rounded-full px-3 text-xs">Replace</Button>
                  <Button type="button" variant="outline" disabled={busy || uploading} onClick={() => void removePage(index)} aria-label={`Delete page ${index + 1}`} className="min-h-10 rounded-full px-3 text-xs text-destructive"><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
              <input ref={replaceInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Replace page ${index + 1}`} onChange={(event) => {
                const file = event.target.files?.[0]
                const target = replaceIndexRef.current
                if (file && target !== null) void addFiles([file], target)
              }} />
              <label className="mt-4 block text-sm font-bold" htmlFor={`comic-alt-${index}`}>Describe this page for readers using screen readers</label>
              <textarea id={`comic-alt-${index}`} value={page.altText} maxLength={500} onChange={(event) => void changePage(index, { altText: event.target.value })} placeholder="e.g. Mara looks out the jeepney window as rain begins to fall." className="mt-2 min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
              <label className="mt-3 block text-sm font-bold" htmlFor={`comic-transcript-${index}`}>Dialogue transcript <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea id={`comic-transcript-${index}`} value={page.transcript} maxLength={10000} onChange={(event) => void changePage(index, { transcript: event.target.value })} placeholder="Add a text transcript so the dialogue is searchable and readable aloud." className="mt-2 min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
            </Panel>
          ))}

          <Panel className="p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-xl font-bold">Episode details</h2>
              {savedWork && <Button type="button" variant="outline" onClick={() => router.push(`/create/works/${savedWork.id}`)} className="min-h-10 rounded-full px-3 text-xs">Edit work details</Button>}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">Episode title
                <input value={episodeTitle} maxLength={160} onChange={(event) => setEpisodeTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal" />
              </label>
              <FieldSelect label="Rating" value={rating} onChange={setRating} options={['All ages', 'Teen', 'Mature']} />
              <FieldSelect label="Genre" value={genre} onChange={setGenre} options={['Select genre', ...WORK_GENRES]} />
              <FieldSelect label="Language" value={language} onChange={setLanguage} options={[...WORK_LANGUAGES]} />
            </div>
            <WorkMoodSelector selected={moods} onChange={setMoods} />
            <label className="mt-4 block text-sm font-bold">Blurb
              <textarea value={synopsis} maxLength={500} onChange={(event) => setSynopsis(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm font-normal" />
            </label>
            <label className="mt-4 block text-sm font-bold">Author&apos;s note
              <textarea value={authorNote} maxLength={2000} onChange={(event) => setAuthorNote(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm font-normal" />
            </label>
            <fieldset className="mt-4">
              <legend className="text-sm font-bold">Content warnings</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {['Violence', 'Mature themes', 'Strong language', 'Grief'].map((warning) => (
                  <button key={warning} type="button" aria-pressed={warnings.includes(warning)} onClick={() => setWarnings((current) => current.includes(warning) ? current.filter((item) => item !== warning) : [...current, warning])} className={selectStyle(warnings.includes(warning))}>{warning}</button>
                ))}
              </div>
            </fieldset>
            <p className="mt-4 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Scheduling is not available yet. Publish now when the episode is ready.</p>
          </Panel>
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
          <Panel className="p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reader preview</h2>
            <div className={`mt-3 max-h-[28rem] min-h-52 overflow-y-auto rounded-xl p-3 ${previewBackground} ${spacing === 'none' ? 'space-y-0' : spacing === 'small' ? 'space-y-2' : 'space-y-5'}`}>
              {pages.length ? pages.map((page, index) => <img key={page.imageId} src={page.imageUrl} alt={page.altText || `Comic page ${index + 1}`} className="mx-auto block h-auto max-w-full" />) : <div className="flex h-48 items-center justify-center text-center text-sm text-white/70">Uploaded pages will appear here.</div>}
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold">Reader background</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['dark', 'light', 'paper'] as const).map((item) => <button key={item} type="button" aria-pressed={background === item} onClick={() => setBackground(item)} className={selectStyle(background === item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold">Space between pages</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['none', 'small', 'large'] as const).map((item) => <button key={item} type="button" aria-pressed={spacing === item} onClick={() => setSpacing(item)} className={selectStyle(spacing === item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
              </div>
            </div>
          </Panel>
          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          <Panel className="flex flex-col gap-2 p-4">
            <Button type="button" variant="outline" disabled={busy || uploading} onClick={() => void saveDraft()} className="min-h-11 rounded-full">Save draft</Button>
            <Button type="button" disabled={busy || uploading || pages.length === 0} onClick={() => void publish()} className="min-h-11 rounded-full bg-accent text-accent-foreground">{busy ? 'Saving…' : 'Publish…'}</Button>
            {savedWork && <Button type="button" variant="ghost" onClick={() => router.push(`/works/${savedWork.id}`)} className="min-h-11 rounded-full">Preview as reader</Button>}
          </Panel>
        </aside>
      </div>
    </CreatorFrame>
  )
}
