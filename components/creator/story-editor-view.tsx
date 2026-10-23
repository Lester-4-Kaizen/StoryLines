'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  AlignCenter,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  Focus,
  ImagePlus,
  Italic,
  Link2,
  List,
  Plus,
  Quote,
  Redo2,
  Save,
  Scissors,
  Underline,
  Undo2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { FieldSelect } from '@/components/shared/field-select'
import { Panel } from '@/components/shared/panel'
import { useAppState } from '@/lib/app-state'
import { useWorks } from '@/lib/works-store'
import type { Route, Work } from '@/lib/types'

type EditorChapter = { number: number; title: string; body: string; authorNote: string }
type EditorDraft = {
  title: string
  blurb: string
  genre: string
  language: string
  rating: string
  status: Work['status']
  coverImageUrl: string
  contentWarnings: string[]
  chapters: EditorChapter[]
  selectedChapter: number
}
type StyleSettings = {
  font: 'serif' | 'sans' | 'dyslexic' | 'mono'
  textSize: number
  spacing: 'snug' | 'relaxed' | 'airy'
  width: 'narrow' | 'medium' | 'wide'
  alignment: 'left' | 'center'
  theme: 'paper' | 'sepia' | 'night' | 'contrast'
  focus: boolean
  typewriter: boolean
  autosave: boolean
}

const GENRES = ['Fantasy', 'Romance', 'Slice of life', 'Mystery', 'Horror', 'Sci-fi', 'Drama', 'Other']
const WARNINGS = ['Violence', 'Mature themes', 'Strong language', 'Grief', 'Self-harm']
const STYLES_STORAGE_KEY = 'storylines-editor-style'

function renderInline(text: string): ReactNode[] {
  const tokens = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|<u>(.+?)<\/u>|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  const nodes: ReactNode[] = []
  let offset = 0
  let index = 0

  for (const match of text.matchAll(tokens)) {
    const position = match.index ?? 0
    if (position > offset) nodes.push(text.slice(offset, position))
    if (match[1] !== undefined) {
      nodes.push(<a key={index++} href={match[2]} target="_blank" rel="noreferrer" className="underline">Image: {match[1] || 'open image'}</a>)
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={index++}>{match[3]}</strong>)
    } else if (match[4] !== undefined) {
      nodes.push(<em key={index++}>{match[4]}</em>)
    } else if (match[5] !== undefined) {
      nodes.push(<u key={index++}>{match[5]}</u>)
    } else if (match[6] !== undefined) {
      nodes.push(<a key={index++} href={match[7]} target="_blank" rel="noreferrer" className="underline">{match[6]}</a>)
    }
    offset = position + match[0].length
  }
  if (offset < text.length) nodes.push(text.slice(offset))
  return nodes
}

function renderChapterBody(text: string): ReactNode[] {
  return text.split(/\n{2,}/).map((block, index) => {
    if (block.startsWith('### ')) return <h3 key={index} className="mb-4 text-xl font-bold">{renderInline(block.slice(4))}</h3>
    if (block.startsWith('## ')) return <h2 key={index} className="mb-4 text-2xl font-bold">{renderInline(block.slice(3))}</h2>
    if (block.startsWith('> ')) return <blockquote key={index} className="mb-5 border-l-2 border-current/30 pl-4 italic">{renderInline(block.slice(2))}</blockquote>
    const lines = block.split('\n')
    if (lines.every((line) => line.startsWith('• '))) {
      return <ul key={index} className="mb-5 list-disc pl-6">{lines.map((line, lineIndex) => <li key={lineIndex}>{renderInline(line.slice(2))}</li>)}</ul>
    }
    return <p key={index} className="mb-5 whitespace-pre-wrap">{lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{renderInline(line)}</span>)}</p>
  })
}

function makeEditorDraft(draft: Partial<Work> | null, work?: Work): EditorDraft {
  const chapters = work?.chapters ?? draft?.chapters
  return {
    title: work?.title ?? draft?.title ?? '',
    blurb: work?.synopsis ?? draft?.synopsis ?? '',
    genre: work?.genre ?? draft?.genre ?? 'Choose genre',
    language: work?.language ?? draft?.language ?? 'Filipino',
    rating: work?.rating ?? draft?.rating ?? 'All ages',
    status: work?.status ?? draft?.status ?? 'Draft',
    coverImageUrl: work?.coverImageUrl ?? draft?.coverImageUrl ?? '',
    contentWarnings: work?.contentWarnings ?? draft?.contentWarnings ?? [],
    chapters: chapters?.length
      ? chapters.map((chapter) => ({ ...chapter, authorNote: chapter.authorNote ?? '' }))
      : [{ number: 1, title: work?.chapterTitle ?? 'Chapter 1', body: work?.chapterBody ?? '', authorNote: '' }],
    selectedChapter: 1,
  }
}

function languageCode(language: string) {
  if (language === 'Tagalog' || language === 'Filipino') return 'fil'
  if (language === 'English') return 'en'
  return 'en'
}

export function StoryEditorView({
  go,
  work,
}: {
  go: (route: Route) => void
  work?: Work
}) {
  const router = useRouter()
  const { draft, addWork, clearDraft, updateWork, deleteWork: deleteWorkFromStore, refreshWorks } = useWorks()
  const { currentUserId } = useAppState()
  const [editor, setEditor] = useState(() => makeEditorDraft(draft, work))
  const [style, setStyle] = useState<StyleSettings>({
    font: 'serif',
    textSize: 18,
    spacing: 'relaxed',
    width: 'medium',
    alignment: 'left',
    theme: 'paper',
    focus: false,
    typewriter: false,
    autosave: true,
  })
  const [saving, setSaving] = useState(false)
  const [savedStatus, setSavedStatus] = useState('Autosave is on')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const restoredRef = useRef(false)
  const historyRef = useRef<string[]>([''])
  const historyIndexRef = useRef(0)

  useEffect(() => {
    historyRef.current = [activeChapter?.body ?? '']
    historyIndexRef.current = 0
  }, [editor.selectedChapter])

  const activeChapterIndex = Math.max(0, editor.chapters.findIndex((chapter) => chapter.number === editor.selectedChapter))
  const activeChapter = editor.chapters[activeChapterIndex] ?? editor.chapters[0]
  const body = activeChapter?.body ?? ''
  const words = body.trim() ? body.trim().split(/\s+/).length : 0
  const minutes = Math.ceil(words / 200)
  const storageKey = currentUserId ? `storylines-editor-draft:${currentUserId}:${work?.id ?? 'new'}` : null

  useEffect(() => {
    try {
      const savedStyle = window.localStorage.getItem(STYLES_STORAGE_KEY)
      if (savedStyle) setStyle((current) => ({ ...current, ...JSON.parse(savedStyle) }))
    } catch (storageError) {
      setError(storageError instanceof Error ? `Could not restore editor preferences: ${storageError.message}` : 'Could not restore editor preferences.')
    }
  }, [])

  useEffect(() => {
    if (!storageKey) {
      restoredRef.current = true
      return
    }
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<EditorDraft>
        if (Array.isArray(parsed.chapters) && parsed.chapters.length) {
          setEditor((current) => ({
            ...current,
            ...parsed,
            chapters: parsed.chapters!.map((chapter, index) => ({
              number: chapter.number ?? index + 1,
              title: chapter.title ?? `Chapter ${index + 1}`,
              body: chapter.body ?? '',
              authorNote: chapter.authorNote ?? '',
            })),
          }))
        }
      }
    } catch (storageError) {
      setError(storageError instanceof Error ? `Could not restore your local draft: ${storageError.message}` : 'Could not restore your local draft.')
    } finally {
      restoredRef.current = true
    }
  }, [storageKey])

  useEffect(() => {
    if (!restoredRef.current || !storageKey || !style.autosave) return
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(editor))
        setSavedStatus(`Autosaved on this device · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
      } catch (storageError) {
        setSavedStatus('Autosave unavailable')
        setError(storageError instanceof Error ? `Could not save local draft: ${storageError.message}` : 'Could not save local draft.')
      }
    }, 900)
    return () => window.clearTimeout(timeout)
  }, [editor, storageKey, style.autosave])

  useEffect(() => {
    try {
      window.localStorage.setItem(STYLES_STORAGE_KEY, JSON.stringify(style))
    } catch (storageError) {
      setError(storageError instanceof Error ? `Could not save editor preferences: ${storageError.message}` : 'Could not save editor preferences.')
    }
  }, [style])

  const updateChapter = (patch: Partial<EditorChapter>) => {
    if (!activeChapter) return
    setEditor((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) => chapter.number === activeChapter.number ? { ...chapter, ...patch } : chapter),
    }))
    setSavedStatus('Unsaved changes')
  }

  const addChapter = () => {
    if (editor.chapters.length >= 50) {
      setError('Hanggang 50 kabanata muna ang puwedeng ilagay sa isang story.')
      return
    }
    const number = Math.max(0, ...editor.chapters.map((chapter) => chapter.number)) + 1
    setEditor((current) => ({
      ...current,
      chapters: [...current.chapters, { number, title: `Chapter ${number}`, body: '', authorNote: '' }],
      selectedChapter: number,
    }))
    setPreview(false)
    setError(null)
  }

  const moveChapter = (direction: -1 | 1) => {
    const destination = activeChapterIndex + direction
    if (destination < 0 || destination >= editor.chapters.length) return
    const chapters = [...editor.chapters]
    ;[chapters[activeChapterIndex], chapters[destination]] = [chapters[destination], chapters[activeChapterIndex]]
    setEditor((current) => ({
      ...current,
      chapters: chapters.map((chapter, index) => ({ ...chapter, number: index + 1 })),
      selectedChapter: destination + 1,
    }))
  }

  const addText = (before: string, after = '') => {
    const textarea = editorRef.current
    const start = textarea?.selectionStart ?? body.length
    const end = textarea?.selectionEnd ?? body.length
    const selection = body.slice(start, end)
    const nextBody = `${body.slice(0, start)}${before}${selection}${after}${body.slice(end)}`
    replaceBody(nextBody)
    requestAnimationFrame(() => {
      if (!textarea) return
      textarea.focus()
      const cursorStart = start + before.length
      const cursorEnd = cursorStart + selection.length
      textarea.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  const replaceBody = (nextBody: string) => {
    const history = historyRef.current.slice(0, historyIndexRef.current + 1)
    if (history[history.length - 1] !== nextBody) {
      history.push(nextBody)
      historyRef.current = history.slice(-100)
      historyIndexRef.current = historyRef.current.length - 1
    }
    updateChapter({ body: nextBody })
  }

  const formatSelection = (before: string, after = before) => {
    const textarea = editorRef.current
    const start = textarea?.selectionStart ?? body.length
    const end = textarea?.selectionEnd ?? body.length
    const selected = body.slice(start, end)
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`
    replaceBody(next)
    requestAnimationFrame(() => {
      if (!textarea) return
      textarea.focus()
      const contentStart = start + before.length
      textarea.setSelectionRange(contentStart, contentStart + selected.length)
    })
  }

  const formatBlock = (kind: 'paragraph' | 'heading' | 'subheading') => {
    const textarea = editorRef.current
    const start = textarea?.selectionStart ?? body.length
    const end = textarea?.selectionEnd ?? body.length
    const lineStart = body.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const nextBreak = body.indexOf('\n', end)
    const lineEnd = nextBreak === -1 ? body.length : nextBreak
    const selectedLines = body.slice(lineStart, lineEnd).split('\n')
    const prefix = kind === 'heading' ? '## ' : kind === 'subheading' ? '### ' : ''
    const formatted = selectedLines.map((line) => {
      const content = line.replace(/^#{1,3}\s+/, '')
      return content ? `${prefix}${content}` : content
    }).join('\n')
    replaceBody(`${body.slice(0, lineStart)}${formatted}${body.slice(lineEnd)}`)
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(lineStart, lineStart + formatted.length)
    })
  }

  const insertUrl = (kind: 'image' | 'link') => {
    const rawUrl = window.prompt(kind === 'image' ? 'Ilagay ang image URL' : 'Ilagay ang link URL')
    if (!rawUrl) return
    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      setError('Hindi valid ang URL. Gumamit ng buong https:// address.')
      return
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      setError('Gumamit ng http:// o https:// URL.')
      return
    }
    const label = window.prompt(kind === 'image' ? 'Ilagay ang alt text' : 'Ilagay ang link text')
    if (label === null) return
    addText(kind === 'image' ? `![${label}](${url.toString()})` : `[${label || url.hostname}](${url.toString()})`)
    setError(null)
  }

  const save = async (status: 'Draft' | 'Ongoing' | 'Complete') => {
    if (!editor.title.trim()) {
      setError('Lagyan muna ng pamagat ang story.')
      setShowDetails(true)
      return
    }
    if (status !== 'Draft' && editor.chapters.every((chapter) => !chapter.body.trim())) {
      setError('Magdagdag muna ng laman sa kahit isang kabanata bago i-publish.')
      return
    }
    if (editor.chapters.some((chapter) => !chapter.title.trim())) {
      setError('Lagyan ng pamagat ang bawat kabanata.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const story = {
        title: editor.title.trim(),
        type: 'story' as const,
        authorId: work?.authorId ?? 'me',
        synopsis: editor.blurb,
        genre: editor.genre || undefined,
        language: editor.language,
        rating: editor.rating,
        coverImageUrl: editor.coverImageUrl || undefined,
        contentWarnings: editor.contentWarnings,
        status,
        chapters: editor.chapters.map((chapter, index) => ({ ...chapter, number: index + 1 })),
      }
      if (work) await updateWork(work.id, story)
      else await addWork(story)
      if (!work) clearDraft()
      if (storageKey) window.localStorage.removeItem(storageKey)
      await refreshWorks()
      setSavedStatus(status === 'Draft' ? 'Draft saved to your account' : 'Published successfully')
      if (!work) go('/create/works')
      else router.push('/create/works')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Hindi na-save ang story. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  const deleteWork = async () => {
    if (!work) return
    setSaving(true)
    setError(null)
    try {
      await deleteWorkFromStore(work.id)
      if (storageKey) window.localStorage.removeItem(storageKey)
      router.push('/create/works')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Hindi na-delete ang story.')
      setSaving(false)
    }
  }

  const handleShortcut = useCallback((event: KeyboardEvent) => {
    const modifier = event.ctrlKey || event.metaKey
    if (!modifier) return
    if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save('Draft')
    } else if (event.key.toLowerCase() === 'b') {
      event.preventDefault()
      formatSelection('**')
    } else if (event.key.toLowerCase() === 'i') {
      event.preventDefault()
      formatSelection('*')
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void save('Ongoing')
    }
  }, [editor, work, storageKey])

  useEffect(() => {
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [handleShortcut])

  useEffect(() => {
    if (style.typewriter && editorRef.current) {
      editorRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeChapterIndex, style.typewriter])

  const styleButton = <T extends string>(
    value: T,
    selected: T,
    onSelect: (value: T) => void,
    label: string,
  ) => (
    <button
      key={value}
      type="button"
      aria-pressed={selected === value}
      onClick={() => onSelect(value)}
      className={`min-h-10 rounded-full border px-3 text-xs font-bold ${
        selected === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-accent'
      }`}
    >
      {label}
    </button>
  )

  const themeClasses = {
    paper: 'bg-card text-card-foreground',
    sepia: 'bg-[#f1e3cb] text-[#4b3325]',
    night: 'bg-[#241b18] text-[#f2e8da]',
    contrast: 'bg-black text-white',
  }
  const fontClasses = {
    serif: 'font-serif',
    sans: 'font-sans',
    dyslexic: 'font-sans tracking-wide',
    mono: 'font-mono',
  }
  const spacingClasses = { snug: 'leading-6', relaxed: 'leading-8', airy: 'leading-10' }
  const widthClasses = { narrow: 'max-w-xl', medium: 'max-w-3xl', wide: 'max-w-none' }

  return (
    <div className={style.focus ? 'fixed inset-0 z-40 overflow-y-auto bg-background p-4 sm:p-6' : ''}>
      <CreatorFrame
        eyebrow={work ? 'Story editor / edit' : 'Story editor'}
        title={editor.title || 'Untitled story'}
        go={go}
        backHref={work ? '/create/works' : '/create/works/new/story'}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-xs text-muted-foreground">{savedStatus}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setPreview((value) => !value)} className="min-h-11 rounded-full">
              <Eye data-icon="inline-start" /> {preview ? 'Back to editor' : 'Preview as reader'}
            </Button>
            {work && <Button type="button" variant="outline" disabled={saving} onClick={() => setDeleteConfirm(true)} className="min-h-11 rounded-full">Delete story</Button>}
            <Button type="button" variant="outline" disabled={saving} onClick={() => void save('Draft')} className="min-h-11 rounded-full">
              <Save data-icon="inline-start" /> Save draft
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save(editor.status === 'Draft' ? 'Ongoing' : editor.status)} className="min-h-11 rounded-full bg-accent text-accent-foreground">
            {saving ? 'Saving…' : work?.status === 'Ongoing' || work?.status === 'Complete' ? 'Save & publish' : 'Publish…'}
            </Button>
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}

        {style.focus && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm font-bold">Focus mode</span>
            <button type="button" onClick={() => setStyle((current) => ({ ...current, focus: false }))} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold hover:bg-muted">
              <X className="size-4" /> Exit focus mode
            </button>
          </div>
        )}

        <div className={`grid items-start gap-4 xl:grid-cols-[minmax(180px,220px)_minmax(0,1fr)_220px] ${style.focus ? 'xl:grid-cols-1' : ''}`}>
          {!style.focus && (
            <aside className="flex flex-col gap-4">
              <Panel className="p-3">
                <h2 className="px-2 py-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Chapters</h2>
                <ol className="mt-2 flex flex-col gap-1">
                  {editor.chapters.map((chapter) => (
                    <li key={chapter.number}>
                      <button
                        type="button"
                        onClick={() => { setEditor((current) => ({ ...current, selectedChapter: chapter.number })); setPreview(false) }}
                        className={`w-full rounded-lg px-3 py-2 text-left ${chapter.number === activeChapter?.number ? 'bg-secondary' : 'hover:bg-muted'}`}
                      >
                        <span className="block truncate text-sm font-bold">{chapter.number} · {chapter.title || 'Untitled chapter'}</span>
                        <span className="text-xs text-muted-foreground">{chapter.body.trim() ? `${chapter.body.trim().split(/\s+/).length} words` : 'Draft'}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="mt-2 flex gap-1 border-t border-border pt-2">
                  <Button type="button" variant="outline" onClick={addChapter} className="min-h-10 flex-1 rounded-lg text-xs"><Plus data-icon="inline-start" /> Add chapter</Button>
                  <button type="button" aria-label="Move chapter up" disabled={activeChapterIndex === 0} onClick={() => moveChapter(-1)} className="inline-flex size-10 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ArrowUp className="size-4" /></button>
                  <button type="button" aria-label="Move chapter down" disabled={activeChapterIndex === editor.chapters.length - 1} onClick={() => moveChapter(1)} className="inline-flex size-10 items-center justify-center rounded-lg border border-border disabled:opacity-40"><ArrowDown className="size-4" /></button>
                </div>
              </Panel>

              <Panel className="p-3">
                <button type="button" onClick={() => setShowDetails((value) => !value)} aria-expanded={showDetails} className="flex min-h-10 w-full items-center justify-between px-2 text-left text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Story details <ChevronDown className={`size-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                </button>
                {showDetails && (
                  <div className="mt-2 flex flex-col gap-3">
                    <label className="text-xs font-bold">Story title
                      <input value={editor.title} maxLength={160} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal" />
                    </label>
                    <label className="text-xs font-bold">Cover image URL
                      <input type="url" value={editor.coverImageUrl} onChange={(event) => setEditor((current) => ({ ...current, coverImageUrl: event.target.value }))} placeholder="https://…" className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal" />
                    </label>
                    <label className="text-xs font-bold">Blurb
                      <textarea value={editor.blurb} maxLength={500} onChange={(event) => setEditor((current) => ({ ...current, blurb: event.target.value }))} className="mt-1 min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm font-normal" />
                    </label>
                    <FieldSelect label="Genre" value={editor.genre} onChange={(genre) => setEditor((current) => ({ ...current, genre }))} options={['Choose genre', ...GENRES]} />
                    <FieldSelect label="Language" value={editor.language} onChange={(language) => setEditor((current) => ({ ...current, language }))} options={['Filipino', 'English', 'Tagalog', 'Other']} />
                    <FieldSelect label="Rating" value={editor.rating} onChange={(rating) => setEditor((current) => ({ ...current, rating }))} options={['All ages', 'Teen', 'Mature']} />
                    <FieldSelect label="Publication status" value={editor.status} onChange={(status) => setEditor((current) => ({ ...current, status: status as Work['status'] }))} options={['Draft', 'Ongoing', 'Complete']} />
                    <fieldset>
                      <legend className="text-xs font-bold">Content warnings</legend>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {WARNINGS.map((warning) => {
                          const checked = editor.contentWarnings.includes(warning)
                          return (
                            <button key={warning} type="button" aria-pressed={checked} onClick={() => setEditor((current) => ({ ...current, contentWarnings: checked ? current.contentWarnings.filter((item) => item !== warning) : [...current.contentWarnings, warning] }))} className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${checked ? 'border-accent bg-accent/10' : 'border-border'}`}>
                              {warning}
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  </div>
                )}
              </Panel>
            </aside>
          )}

          <main className={`min-w-0 ${style.focus ? 'mx-auto w-full max-w-4xl' : ''}`}>
            <Panel className={`overflow-hidden p-0 ${themeClasses[style.theme]}`}>
              {!preview && (
                <div className="flex flex-col gap-2 border-b border-border p-3">
                  <div className="flex flex-wrap gap-1.5">
                    <label className="sr-only" htmlFor="paragraph-style">Paragraph style</label>
                    <select id="paragraph-style" className="min-h-10 rounded-full border border-border bg-background px-3 text-xs font-semibold" onChange={(event) => {
                      formatBlock(event.target.value as 'paragraph' | 'heading' | 'subheading')
                      event.currentTarget.value = 'paragraph'
                    }}>
                      <option value="paragraph">Paragraph</option><option value="heading">Heading</option><option value="subheading">Subheading</option>
                    </select>
                    <button type="button" title="Bold (Ctrl+B)" onClick={() => formatSelection('**')} className="size-10 rounded-full border border-border font-bold">B</button>
                    <button type="button" title="Italic (Ctrl+I)" onClick={() => formatSelection('*')} className="inline-flex size-10 items-center justify-center rounded-full border border-border"><Italic className="size-4" /></button>
                    <button type="button" title="Underline" onClick={() => formatSelection('<u>', '</u>')} className="inline-flex size-10 items-center justify-center rounded-full border border-border"><Underline className="size-4" /></button>
                    <button type="button" title="Quote" onClick={() => addText('> ')} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold"><Quote className="size-3.5" /> Quote</button>
                    <button type="button" title="Bulleted list" onClick={() => addText('• ')} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold"><List className="size-3.5" /> List</button>
                    <button type="button" title="Align left" aria-pressed={style.alignment === 'left'} onClick={() => setStyle((current) => ({ ...current, alignment: 'left' }))} className="inline-flex size-10 items-center justify-center rounded-full border border-border"><AlignLeft className="size-4" /></button>
                    <button type="button" title="Center text" aria-pressed={style.alignment === 'center'} onClick={() => setStyle((current) => ({ ...current, alignment: 'center' }))} className="inline-flex size-10 items-center justify-center rounded-full border border-border"><AlignCenter className="size-4" /></button>
                    <button type="button" title="Scene break" onClick={() => addText('\n\n* * *\n\n')} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold"><Scissors className="size-3.5" /> Scene break</button>
                    <button type="button" title="Insert image URL" onClick={() => insertUrl('image')} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold"><ImagePlus className="size-3.5" /> Image</button>
                    <button type="button" title="Insert link" onClick={() => insertUrl('link')} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold"><Link2 className="size-3.5" /> Link</button>
                    <button type="button" title="Undo" disabled={historyIndexRef.current <= 0} onClick={() => {
                      historyIndexRef.current = Math.max(0, historyIndexRef.current - 1)
                      updateChapter({ body: historyRef.current[historyIndexRef.current] })
                    }} className="inline-flex size-10 items-center justify-center rounded-full border border-border disabled:opacity-40"><Undo2 className="size-4" /></button>
                    <button type="button" title="Redo" disabled={historyIndexRef.current >= historyRef.current.length - 1} onClick={() => {
                      historyIndexRef.current = Math.min(historyRef.current.length - 1, historyIndexRef.current + 1)
                      updateChapter({ body: historyRef.current[historyIndexRef.current] })
                    }} className="inline-flex size-10 items-center justify-center rounded-full border border-border disabled:opacity-40"><Redo2 className="size-4" /></button>
                    <button type="button" title="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)} className="inline-flex min-h-10 items-center rounded-full border border-border px-3 text-xs font-semibold">Shortcuts</button>
                  </div>
                </div>
              )}
              {preview ? (
                <article className={`mx-auto min-h-[26rem] p-6 sm:p-10 ${widthClasses[style.width]} ${fontClasses[style.font]} ${spacingClasses[style.spacing]} ${style.alignment === 'center' ? 'text-center' : 'text-left'}`}>
                  <h2 className="mb-5 text-3xl font-bold">{activeChapter?.title || 'Untitled chapter'}</h2>
                  {body.trim() ? renderChapterBody(body) : <p className="italic opacity-70">Dito magsisimula ang kuwento mo…</p>}
                  {activeChapter?.authorNote && <aside className="mt-8 border-t border-current/20 pt-5 text-sm"><strong>Author&apos;s note</strong><p className="mt-2 whitespace-pre-wrap">{activeChapter.authorNote}</p></aside>}
                </article>
              ) : (
                <div className={`mx-auto ${widthClasses[style.width]}`}>
                  <label className="sr-only" htmlFor="chapter-title">Chapter title</label>
                  <input id="chapter-title" value={activeChapter?.title ?? ''} onChange={(event) => updateChapter({ title: event.target.value })} placeholder="Chapter title" className={`mt-4 w-full bg-transparent px-5 text-2xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring ${fontClasses[style.font]}`} />
                  <textarea
                    ref={editorRef}
                    value={body}
                    onChange={(event) => replaceBody(event.target.value)}
                    placeholder="Dito magsimula ang kuwento mo…"
                    lang={languageCode(editor.language)}
                    spellCheck
                    className={`min-h-[24rem] w-full resize-y bg-transparent px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring ${fontClasses[style.font]} ${spacingClasses[style.spacing]} ${style.alignment === 'center' ? 'text-center' : 'text-left'}`}
                    style={{ fontSize: `${style.textSize}px` }}
                  />
                </div>
              )}
              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <span>{words} words · {minutes} min read</span>
                <span>{savedStatus} · <button type="button" onClick={() => setShortcutsOpen(true)} className="underline underline-offset-2">Keyboard shortcuts</button></span>
              </footer>
            </Panel>

            {!preview && (
              <Panel className="mt-3 flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-bold">Add an author&apos;s note
                  <textarea value={activeChapter?.authorNote ?? ''} maxLength={2000} onChange={(event) => updateChapter({ authorNote: event.target.value })} placeholder="Say hello to readers at the end of the chapter." className="mt-2 min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm font-normal sm:w-[28rem]" />
                </label>
                <span className="text-xs text-muted-foreground">{(activeChapter?.authorNote ?? '').length}/2000</span>
              </Panel>
            )}
          </main>

          {!style.focus && (
            <aside className="flex flex-col gap-3">
              <Panel className="p-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Make it comfortable</h2>
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold">Font</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['serif', 'sans', 'dyslexic', 'mono'] as const).map((font) => styleButton(font, style.font, (value) => setStyle((current) => ({ ...current, font: value })), { serif: 'Serif', sans: 'Sans', dyslexic: 'Dyslexia-friendly', mono: 'Mono' }[font]))}
                  </div>
                </div>
                <label className="mt-4 block text-xs font-semibold">Text size
                  <input type="range" min={14} max={28} value={style.textSize} onChange={(event) => setStyle((current) => ({ ...current, textSize: Number(event.target.value) }))} className="mt-2 w-full accent-accent" />
                  <span className="sr-only">{style.textSize} pixels</span>
                </label>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold">Line spacing</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['snug', 'relaxed', 'airy'] as const).map((spacing) => styleButton(spacing, style.spacing, (value) => setStyle((current) => ({ ...current, spacing: value })), spacing))}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold">Page width</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['narrow', 'medium', 'wide'] as const).map((width) => styleButton(width, style.width, (value) => setStyle((current) => ({ ...current, width: value })), width))}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold">Theme</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['paper', 'sepia', 'night', 'contrast'] as const).map((theme) => styleButton(theme, style.theme, (value) => setStyle((current) => ({ ...current, theme: value })), { paper: 'Paper', sepia: 'Sepia', night: 'Night', contrast: 'High contrast' }[theme]))}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
                  <label className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={style.focus} onChange={(event) => setStyle((current) => ({ ...current, focus: event.target.checked }))} /> <Focus className="size-4" /> Focus mode</label>
                  <label className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={style.typewriter} onChange={(event) => setStyle((current) => ({ ...current, typewriter: event.target.checked }))} /> Typewriter scrolling</label>
                  <label className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={style.autosave} onChange={(event) => setStyle((current) => ({ ...current, autosave: event.target.checked }))} /> Autosave every few seconds</label>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold">Spellcheck</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['Taglish', 'Tagalog', 'English'] as const).map((language) => (
                      <button key={language} type="button" aria-pressed={editor.language === language || (language === 'Taglish' && editor.language === 'Filipino')} onClick={() => setEditor((current) => ({ ...current, language: language === 'Taglish' ? 'Filipino' : language }))} className={`min-h-10 rounded-full border px-3 text-xs font-bold ${editor.language === language || (language === 'Taglish' && editor.language === 'Filipino') ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                        {language}
                      </button>
                    ))}
                  </div>
                </div>
              </Panel>
              <Panel className="p-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Publishing</h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">Your work is private until you publish it. You can keep editing after publication.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void save('Ongoing')} disabled={saving} className="min-h-11 rounded-full bg-primary text-primary-foreground">Publish now</Button>
                  <Button type="button" onClick={() => void save('Draft')} disabled={saving} variant="outline" className="min-h-11 rounded-full">Save draft</Button>
                </div>
              </Panel>
            </aside>
          )}
        </div>
      </CreatorFrame>

      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShortcutsOpen(false) }}>
          <Panel className="w-full max-w-md p-5" >
            <div className="flex items-center justify-between"><h2 className="font-serif text-2xl font-bold">Keyboard shortcuts</h2><button type="button" onClick={() => setShortcutsOpen(false)} aria-label="Close shortcuts" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"><X className="size-4" /></button></div>
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4"><dt>Bold</dt><dd>Ctrl / ⌘ + B</dd></div>
              <div className="flex justify-between gap-4"><dt>Italic</dt><dd>Ctrl / ⌘ + I</dd></div>
              <div className="flex justify-between gap-4"><dt>Save draft</dt><dd>Ctrl / ⌘ + S</dd></div>
              <div className="flex justify-between gap-4"><dt>Publish</dt><dd>Ctrl / ⌘ + Enter</dd></div>
            </dl>
          </Panel>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteConfirm(false) }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-story-title">
            <Panel className="w-full max-w-sm p-5">
              <h2 id="delete-story-title" className="font-serif text-xl font-bold">Delete this story?</h2>
              <p className="mt-2 text-sm text-muted-foreground">Hindi na maibabalik ang “{work?.title}”.</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                <Button type="button" variant="destructive" disabled={saving} onClick={() => void deleteWork()}>Delete story</Button>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}
