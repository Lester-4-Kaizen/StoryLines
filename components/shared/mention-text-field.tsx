'use client'

import { useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type KeyboardEvent, type Ref } from 'react'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { getSupabaseClient } from '@/lib/supabase'

type MentionProfile = {
  id: string
  display_name: string
  username: string
  avatar_path: string | null
}

type MentionTextFieldProps = {
  as: 'input' | 'textarea'
  id?: string
  value: string
  currentUserId: string | null
  onChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  fieldRef?: Ref<HTMLInputElement | HTMLTextAreaElement>
  placeholder?: string
  className?: string
  maxLength?: number
  rows?: number
  disabled?: boolean
  inputMode?: 'text' | 'search' | 'email' | 'url' | 'tel' | 'numeric' | 'decimal' | 'none'
  'aria-label'?: string
}

type MentionToken = { start: number; end: number; query: string }

function getMentionToken(value: string, caret: number): MentionToken | null {
  const beforeCaret = value.slice(0, caret)
  const match = beforeCaret.match(/(^|\s)@([A-Za-z0-9_]{0,30})$/)
  if (!match) return null
  const start = beforeCaret.length - match[0].length + match[1].length
  return { start, end: caret, query: match[2] }
}

export function MentionTextField({
  as,
  id,
  value,
  currentUserId,
  onChange,
  onKeyDown,
  fieldRef,
  placeholder,
  className,
  maxLength,
  rows,
  disabled,
  inputMode,
  'aria-label': ariaLabel,
}: MentionTextFieldProps) {
  const internalRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [token, setToken] = useState<MentionToken | null>(null)
  const [suggestions, setSuggestions] = useState<MentionProfile[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  useImperativeHandle(fieldRef, () => internalRef.current!, [])

  useEffect(() => {
    if (!token || !currentUserId || disabled) {
      return
    }
    let active = true
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setLookupError(null)
      void (async () => {
        try {
          const { data, error } = await getSupabaseClient()
            .rpc('search_mention_profiles', { p_query: token.query })
          if (!active) return
          if (error) throw error
          setSuggestions((data ?? []) as MentionProfile[])
          setActiveIndex(0)
        } catch (error: unknown) {
          if (!active) return
          console.error('Failed to load mention suggestions', error)
          setSuggestions([])
          setLookupError('Could not load mention suggestions.')
        } finally {
          if (active) setLoading(false)
        }
      })()
    }, 150)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [currentUserId, disabled, token])

  useEffect(() => {
    if (!token) return
    const dismissOutsideMention = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setToken(null)
        setSuggestions([])
      }
    }
    document.addEventListener('pointerdown', dismissOutsideMention)
    return () => document.removeEventListener('pointerdown', dismissOutsideMention)
  }, [token])

  const updateToken = (target: HTMLInputElement | HTMLTextAreaElement) => {
    const nextToken = getMentionToken(target.value, target.selectionStart ?? target.value.length)
    setToken(nextToken)
    setSuggestions([])
    setActiveIndex(0)
    setLookupError(null)
    setLoading(false)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(event.target.value)
    updateToken(event.target)
  }

  const selectMention = (username: string) => {
    const field = internalRef.current
    if (!field || !token) return
    const mention = `@${username} `
    const nextValue = `${value.slice(0, token.start)}${mention}${value.slice(token.end)}`
    onChange(nextValue)
    setToken(null)
    setSuggestions([])
    requestAnimationFrame(() => {
      const caret = token.start + mention.length
      field.focus()
      field.setSelectionRange(caret, caret)
    })
  }

  const showEveryoneOption = token !== null
    && (token.query === '' || 'everyone'.startsWith(token.query.toLocaleLowerCase()))
  const optionCount = suggestions.length + (showEveryoneOption ? 1 : 0)

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (token && optionCount && event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % optionCount)
      return
    }
    if (token && optionCount && event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + optionCount) % optionCount)
      return
    }
    if (token && optionCount && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault()
      if (showEveryoneOption && activeIndex === 0) selectMention('everyone')
      else selectMention(suggestions[activeIndex - (showEveryoneOption ? 1 : 0)].username)
      return
    }
    if (token && event.key === 'Escape') {
      setToken(null)
      setSuggestions([])
      return
    }
    onKeyDown?.(event)
  }

  const setFieldRef = (field: HTMLInputElement | HTMLTextAreaElement | null) => {
    internalRef.current = field
  }

  const fieldProps = {
    id,
    ref: setFieldRef,
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    placeholder,
    className,
    maxLength,
    disabled,
    inputMode,
    'aria-label': ariaLabel,
    'aria-autocomplete': 'list' as const,
    'aria-expanded': Boolean(token && (suggestions.length || loading || lookupError)),
    'aria-controls': id ? `${id}-mention-options` : undefined,
  }

  return (
    <div ref={containerRef} className="relative">
      {as === 'textarea'
        ? <textarea {...fieldProps} rows={rows} />
        : <input {...fieldProps} />}
      {token && currentUserId && (
        <div
          id={id ? `${id}-mention-options` : undefined}
          role="listbox"
          aria-label="Mention suggestions"
          className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-xl"
        >
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {token.query ? 'Matching people' : 'People you follow'}
          </p>
          {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Searching people…</p>}
          {lookupError && <p role="alert" className="px-3 py-2 text-xs text-destructive">{lookupError}</p>}
          {showEveryoneOption && (
            <button
              type="button"
              role="option"
              aria-selected={activeIndex === 0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMention('everyone')}
              className={`flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-secondary ${activeIndex === 0 ? 'bg-secondary' : ''}`}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">@</span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">Everyone</span>
                <span className="block truncate text-[11px] text-muted-foreground">Notify people who follow you</span>
              </span>
            </button>
          )}
          {!loading && !lookupError && suggestions.map((suggestion, index) => {
            const optionIndex = index + (showEveryoneOption ? 1 : 0)
            return (
            <button
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={activeIndex === optionIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMention(suggestion.username)}
              className={`flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-secondary ${activeIndex === optionIndex ? 'bg-secondary' : ''}`}
            >
              <ProfileAvatar
                src={suggestion.avatar_path
                  ? getSupabaseClient().storage.from('avatars').getPublicUrl(suggestion.avatar_path).data.publicUrl
                  : null}
                name={suggestion.display_name}
                className="size-8"
                imageSizes="32px"
              />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{suggestion.display_name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">@{suggestion.username}</span>
              </span>
            </button>
            )
          })}
          {!loading && !lookupError && !suggestions.length && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {token.query ? 'No matching usernames.' : 'Follow creators to see them here, or type a username to search.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
