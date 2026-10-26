'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { BookMarked, Inbox, MessageCircle, Search, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/shared/panel'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { getSupabaseClient } from '@/lib/supabase'
import { useAppState } from '@/lib/app-state'
import type { Badge } from '@/lib/types'

type CollaboratorRole = 'artist' | 'writer'
type CollaborateTab = 'find' | 'active' | 'pending' | 'past'

type CollaboratorProfile = {
  id: string
  name: string
  username: string
  avatarUrl: string | null
  roles: Badge[]
  bio: string
  languages: string[]
  genres: string[]
  collaborationRoles: string[]
  portfolioUrl: string | null
  openForCollaboration: boolean
  kind: CollaboratorRole
}

type CollaborationRecord = {
  id: string
  requester_id: string
  recipient_id: string | null
  listing_id: string | null
  kind: 'listing' | 'proposal'
  title: string
  description: string
  collaboration_role: CollaboratorRole
  status: 'open' | 'pending' | 'accepted' | 'declined' | 'completed' | 'closed'
  created_at: string
}

type DialogState =
  | { kind: 'invite'; profile: CollaboratorProfile }
  | { kind: 'listing' }
  | { kind: 'apply'; listing: CollaborationRecord }
  | null

const profileColumns = 'id, display_name, username, avatar_path, roles, bio, writing_languages, favorite_genres, collaboration_roles, portfolio_url'
const requestColumns = 'id, requester_id, recipient_id, listing_id, kind, title, description, collaboration_role, status, created_at'

function safeExternalUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function profileRole(roles: string[], selectedRole: CollaboratorRole): CollaboratorRole {
  return roles.includes(selectedRole) ? selectedRole : roles.includes('writer') ? 'writer' : 'artist'
}

function requestSetupError(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && ['PGRST205', '42P01'].includes(String(error.code))
  ) {
    return 'Hindi pa naka-set up ang collaboration system. I-run ang 20261025000000_collaboration_requests.sql migration sa Supabase SQL Editor.'
  }
  return error instanceof Error ? error.message : 'Hindi ma-load ang collaboration data. Subukan ulit.'
}

export function CollaborateView({
  creator,
  role,
  onUpgrade,
  initialTab = 'find',
}: {
  creator: boolean
  role: Badge
  onUpgrade: () => void
  initialTab?: CollaborateTab
}) {
  const { currentUserId } = useAppState()
  const [tab, setTab] = useState<CollaborateTab>(initialTab)
  const [kind, setKind] = useState<CollaboratorRole>('artist')
  const [query, setQuery] = useState('')
  const [portfolioOnly, setPortfolioOnly] = useState(false)
  const [profiles, setProfiles] = useState<CollaboratorProfile[]>([])
  const [requests, setRequests] = useState<CollaborationRecord[]>([])
  const [requestPeople, setRequestPeople] = useState<Map<string, { name: string; username: string }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [listingRole, setListingRole] = useState<CollaboratorRole>('artist')
  const [reloadVersion, setReloadVersion] = useState(0)
  const canFind = creator

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    if (!currentUserId) {
      setProfiles([])
      setRequests([])
      setLoading(false)
      return () => {
        active = false
      }
    }

    void (async () => {
      const supabase = getSupabaseClient()
      if (tab === 'find') {
        const [profilesResult, listingsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select(`${profileColumns}, open_for_collaboration`)
            .overlaps('roles', [kind])
            .neq('id', currentUserId ?? '')
            .order('display_name')
            .limit(60),
          supabase
            .from('collaboration_requests')
            .select(requestColumns)
            .eq('kind', 'listing')
            .eq('status', 'open')
            .order('created_at', { ascending: false })
            .limit(30),
        ])
        if (profilesResult.error) throw profilesResult.error
        if (listingsResult.error) throw listingsResult.error
        const mappedProfiles: CollaboratorProfile[] = (profilesResult.data ?? []).map((profile) => {
          const roles = (profile.roles ?? []).filter((candidate: string): candidate is Badge => (
            candidate === 'reader' || candidate === 'writer' || candidate === 'artist'
          ))
          return {
            id: profile.id,
            name: profile.display_name,
            username: profile.username,
            avatarUrl: profile.avatar_path
              ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
              : null,
            roles,
            bio: profile.bio ?? '',
            languages: profile.writing_languages ?? [],
            genres: profile.favorite_genres ?? [],
            collaborationRoles: profile.collaboration_roles ?? [],
            portfolioUrl: safeExternalUrl(profile.portfolio_url),
            openForCollaboration: profile.open_for_collaboration ?? false,
            kind: profileRole(roles, kind),
          }
        })
        const rows = (listingsResult.data ?? []) as CollaborationRecord[]
        const requesterIds = Array.from(new Set(rows.map((listing) => listing.requester_id)))
        const peopleResult = requesterIds.length
          ? await supabase.from('profiles').select('id, display_name, username').in('id', requesterIds)
          : { data: [], error: null }
        if (peopleResult.error) throw peopleResult.error
        if (!active) return
        setProfiles(mappedProfiles)
        setRequests(rows)
        setRequestPeople(new Map((peopleResult.data ?? []).map((person) => [
          person.id,
          { name: person.display_name, username: person.username },
        ])))
        return
      }

      const statuses = tab === 'active'
        ? ['accepted']
        : tab === 'pending'
          ? ['pending']
          : ['declined', 'completed', 'closed']
      const { data, error: requestsError } = await supabase
        .from('collaboration_requests')
        .select(requestColumns)
        .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .in('status', statuses)
        .order('created_at', { ascending: false })
        .limit(100)
      if (requestsError) throw requestsError
      const rows = (data ?? []) as CollaborationRecord[]
      const peopleIds = Array.from(new Set(rows.flatMap((request) => [
        request.requester_id,
        ...(request.recipient_id ? [request.recipient_id] : []),
      ])))
      const peopleResult = peopleIds.length
        ? await supabase.from('profiles').select('id, display_name, username').in('id', peopleIds)
        : { data: [], error: null }
      if (peopleResult.error) throw peopleResult.error
      if (!active) return
      setProfiles([])
      setRequests(rows)
      setRequestPeople(new Map((peopleResult.data ?? []).map((person) => [
        person.id,
        { name: person.display_name, username: person.username },
      ])))
    })().catch((loadError: unknown) => {
      if (active) setError(requestSetupError(loadError))
    }).finally(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
    }
  }, [currentUserId, kind, reloadVersion, tab])

  const visibleProfiles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return profiles.filter((profile) => {
      const hasPortfolio = Boolean(profile.portfolioUrl)
      const searchable = [
        profile.name,
        profile.username,
        profile.bio,
        ...profile.genres,
        ...profile.languages,
        ...profile.collaborationRoles,
      ].join(' ').toLocaleLowerCase()
      return (!portfolioOnly || hasPortfolio) && (!normalized || searchable.includes(normalized))
    })
  }, [portfolioOnly, profiles, query])

  const resetDialog = () => {
    setDialog(null)
    setTitle('')
    setDescription('')
    setError(null)
  }

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dialog || !currentUserId) return
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    if (!trimmedTitle || trimmedTitle.length > 120 || !trimmedDescription || trimmedDescription.length > 2000) {
      setError('Maglagay ng pamagat at paglalarawan (hanggang 2,000 character).')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const target = dialog.kind === 'invite' ? dialog.profile : null
      const listing = dialog.kind === 'apply' ? dialog.listing : null
      const { error: insertError } = await getSupabaseClient()
        .from('collaboration_requests')
        .insert({
          requester_id: currentUserId,
          recipient_id: target?.id ?? listing?.requester_id ?? null,
          listing_id: listing?.id ?? null,
          kind: dialog.kind === 'listing' ? 'listing' : 'proposal',
          title: trimmedTitle,
          description: trimmedDescription,
          collaboration_role: dialog.kind === 'listing' ? listingRole : target?.kind ?? listing?.collaboration_role,
          status: dialog.kind === 'listing' ? 'open' : 'pending',
        })
      if (insertError) throw insertError
      resetDialog()
      setTab(dialog.kind === 'listing' ? 'find' : 'pending')
      setReloadVersion((version) => version + 1)
    } catch (saveError) {
      setError(requestSetupError(saveError))
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (request: CollaborationRecord, status: CollaborationRecord['status']) => {
    if (!currentUserId) return
    setActionId(request.id)
    setError(null)
    try {
      const { error: updateError } = await getSupabaseClient()
        .from('collaboration_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', request.id)
      if (updateError) throw updateError
      if (status === 'accepted') setTab('active')
      if (status === 'declined' || status === 'completed') setTab('past')
      setReloadVersion((version) => version + 1)
    } catch (updateError) {
      setError(requestSetupError(updateError))
    } finally {
      setActionId(null)
    }
  }

  const cancelRequest = async (request: CollaborationRecord) => {
    setActionId(request.id)
    setError(null)
    try {
      const { error: deleteError } = await getSupabaseClient()
        .from('collaboration_requests')
        .delete()
        .eq('id', request.id)
      if (deleteError) throw deleteError
      setReloadVersion((version) => version + 1)
    } catch (deleteError) {
      setError(requestSetupError(deleteError))
    } finally {
      setActionId(null)
    }
  }

  const openDialog = (nextDialog: Exclude<DialogState, null>) => {
    setError(null)
    setTitle('')
    setDescription('')
    setDialog(nextDialog)
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <span className="eyebrow">Hanap ka-creative mo</span>
        <h1 className="mt-3 max-w-3xl font-serif text-5xl font-bold leading-[0.94] text-balance md:text-[4.15rem]">
          May mabubuo kapag nagsama-sama.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Makipag-ugnayan sa mga creator na bukas makipagtulungan, o mag-post ng proyektong kailangan ng ka-partner.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-border" aria-label="Collaboration sections">
        {([
          ['find', 'Find collaborators'],
          ['active', 'Active'],
          ['pending', 'Pending'],
          ['past', 'Past'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value ? 'page' : undefined}
            className={`rounded-t-lg px-4 py-3 text-sm font-bold transition-colors ${tab === value ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {!canFind ? (
        <Panel className="flex flex-col items-center p-8 text-center">
          <Users className="size-10 text-accent" />
          <h2 className="mt-4 font-serif text-2xl font-bold">Kailangan ng creator role para makipag-collab.</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Idagdag ang Writer o Alagad ng sining role para maghanap ng ka-partner, magpadala ng request, at gumawa sa iisang workspace.
          </p>
          <Button onClick={onUpgrade} className="mt-6 rounded-lg bg-accent text-accent-foreground">
            I-unlock ang creator tools
          </Button>
        </Panel>
      ) : tab === 'find' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
          <section className="space-y-4" aria-label="Find collaborators">
            <div className="flex flex-wrap gap-2">
              {([
                ['artist', 'Hanap alagad ng sining'],
                ['writer', 'Hanap writer'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  aria-pressed={kind === value}
                  className={`rounded-full px-4 py-2 text-xs font-bold ${kind === value ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-3 rounded-full border border-input bg-card/80 px-4 py-3 shadow-sm">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <span className="sr-only">Maghanap ng collaborator</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Pangalan, style, genre, wika...`}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 outline-none"
              />
            </label>

            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={portfolioOnly}
                onChange={(event) => setPortfolioOnly(event.target.checked)}
                className="accent-accent"
              />
              May portfolio link
            </label>

            {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading collaborators">
                {[0, 1, 2, 3].map((item) => <div key={item} className="h-52 animate-pulse rounded-[1.25rem] bg-secondary/60" />)}
              </div>
            ) : visibleProfiles.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {visibleProfiles.map((profile) => (
                  <article key={profile.id} className="flex h-full flex-col rounded-[1.25rem] border border-border bg-card p-4 shadow-[0_2px_0_rgba(78,47,36,0.06)]">
                    <div className="flex items-start gap-3">
                      <ProfileAvatar src={profile.avatarUrl} name={profile.name} className="size-11" imageSizes="44px" />
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-bold text-foreground">{profile.name}</h2>
                        <p className="text-xs text-muted-foreground">@{profile.username}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-accent">
                          {profile.kind === 'artist' ? 'Alagad ng sining' : 'Writer'}
                          {profile.openForCollaboration ? ' · Open' : ' · Not open yet'}
                        </p>
                      </div>
                    </div>

                    {profile.bio && <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">{profile.bio}</p>}

                    {profile.portfolioUrl && (
                      <a
                        href={profile.portfolioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex min-h-8 items-center text-xs font-bold text-accent underline underline-offset-4"
                      >
                        Tingnan ang portfolio
                      </a>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {[...profile.collaborationRoles, ...profile.genres, ...profile.languages].slice(0, 6).map((tag) => (
                        <span key={tag} className="rounded-full border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                      {profile.openForCollaboration ? (
                        <Button onClick={() => openDialog({ kind: 'invite', profile })} className="col-span-2 w-full rounded-full bg-accent text-xs font-bold text-accent-foreground">
                          Propose collaboration
                        </Button>
                      ) : (
                        <span className="col-span-2 flex min-h-8 items-center justify-center rounded-full border border-border px-3 text-center text-[11px] font-semibold text-muted-foreground">
                          Not accepting proposals
                        </span>
                      )}
                      <Link href={`/messages?user=${encodeURIComponent(profile.id)}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-bold transition-colors hover:bg-muted">
                        <MessageCircle aria-hidden="true" className="size-4" />
                        Message
                      </Link>
                      <Link href={`/profile/${profile.id}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-3 text-xs font-bold transition-colors hover:bg-muted">
                        View profile
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-border bg-card/60 p-8 text-center">
                <Users className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {query || portfolioOnly
                    ? 'Walang tumugma sa filters mo.'
                    : `Wala pang ${kind === 'artist' ? 'artist' : 'writer'} profile na makita.`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {query || portfolioOnly
                    ? 'Baguhin ang search o alisin ang portfolio filter.'
                    : 'Kapag may account na may ganitong creator badge, lalabas ito rito.'}
                </p>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-[0_3px_0_rgba(89,59,40,0.08)]">
              <h2 className="font-serif text-[2rem] leading-none text-foreground">May proyektong kailangan ng ka-partner?</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Mag-post ng request para makita ng ibang creator at makatanggap ng proposals.
              </p>
              <Button onClick={() => openDialog({ kind: 'listing' })} className="mt-5 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground hover:brightness-95">
                Mag-post ng request
              </Button>
            </div>

            <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-[0_2px_0_rgba(89,59,40,0.04)]">
              <h2 className="font-serif text-[1.75rem] leading-none text-foreground">Open requests</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Mga proyektong naghahanap ng Writer o Alagad ng sining.</p>
              {loading ? (
                <div className="mt-4 h-20 animate-pulse rounded-xl bg-secondary/60" />
              ) : requests.length ? (
                <ul className="mt-4 space-y-3">
                  {requests.map((listing) => {
                    const owner = requestPeople.get(listing.requester_id)
                    const ownListing = listing.requester_id === currentUserId
                    return (
                      <li key={listing.id} className="rounded-xl border border-border bg-background p-3">
                        <p className="font-bold text-sm text-foreground">{listing.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{listing.description}</p>
                        <p className="mt-2 text-[10px] font-semibold text-accent">
                          {listing.collaboration_role === 'artist' ? 'Artist wanted' : 'Writer wanted'}
                          {owner ? ` · @${owner.username}` : ''}
                        </p>
                        {ownListing ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionId === listing.id}
                            onClick={() => void updateStatus(listing, 'closed')}
                            className="mt-2 rounded-full"
                          >
                            Isara ang request
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={listing.collaboration_role !== role || !creator}
                            onClick={() => openDialog({ kind: 'apply', listing })}
                            className="mt-2 rounded-full bg-accent text-accent-foreground"
                          >
                            {listing.collaboration_role === role ? 'Mag-propose' : `Para sa ${listing.collaboration_role === 'artist' ? 'artist' : 'writer'}`}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">
                  Wala pang bukas na request. Maaari kang mag-post ng project brief.
                </p>
              )}
            </div>

            <div className="rounded-[1.35rem] border border-border bg-card p-5">
              <h2 className="font-serif text-[1.75rem] leading-none text-foreground">Paano ito gumagana</h2>
              <ol className="mt-4 space-y-4">
                {[
                  ['Mag-propose', 'Ibahagi ang project at ang ambag na hinahanap mo.'],
                  ['Magkasundo', 'Tanggapin o tanggihan ang proposal; malinaw na pag-usapan ang detalye.'],
                  ['Gumawa nang magkasama', 'Accepted collaborations mapupunta sa Active; tapos na sa Past.'],
                ].map(([step, text], index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">{index + 1}</span>
                    <span>
                      <span className="block text-sm font-bold text-foreground">{step}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      ) : (
        <section className="space-y-4" aria-label={`${tab} collaborations`}>
          {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {loading ? (
            <div className="h-40 animate-pulse rounded-[1.25rem] bg-secondary/60" aria-busy="true" />
          ) : requests.length ? (
            <div className="grid gap-3">
              {requests.map((request) => {
                const incoming = request.recipient_id === currentUserId
                const otherId = incoming ? request.requester_id : request.recipient_id
                const otherPerson = otherId ? requestPeople.get(otherId) : undefined
                const isListing = request.kind === 'listing'
                return (
                  <article key={request.id} className="rounded-[1.25rem] border border-border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.08em] text-accent">
                          {isListing ? 'Request' : incoming ? 'Received proposal' : 'Sent proposal'}
                          {' · '}
                          {request.status}
                        </p>
                        <h2 className="mt-1 font-serif text-xl font-bold">{request.title}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {request.collaboration_role === 'artist' ? 'Alagad ng sining' : 'Writer'}
                          {otherPerson ? ` · ${incoming ? 'Mula kay' : 'Kasama si'} ${otherPerson.name} (@${otherPerson.username})` : ''}
                        </p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{request.description}</p>
                      </div>
                      {!isListing && otherId && (
                        <Link href={`/messages?user=${encodeURIComponent(otherId)}`} className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-bold transition-colors hover:bg-muted">
                          Buksan ang messages
                        </Link>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {tab === 'pending' && incoming && (
                        <>
                          <Button disabled={actionId === request.id} onClick={() => void updateStatus(request, 'accepted')} className="rounded-full bg-accent text-accent-foreground">
                            Tanggapin
                          </Button>
                          <Button disabled={actionId === request.id} variant="outline" onClick={() => void updateStatus(request, 'declined')} className="rounded-full">
                            Tanggihan
                          </Button>
                        </>
                      )}
                      {tab === 'pending' && !incoming && !isListing && (
                        <Button disabled={actionId === request.id} variant="outline" onClick={() => void cancelRequest(request)} className="rounded-full">
                          Kanselahin
                        </Button>
                      )}
                      {tab === 'active' && (
                        <Button disabled={actionId === request.id} variant="outline" onClick={() => void updateStatus(request, 'completed')} className="rounded-full">
                          Markahang tapos na
                        </Button>
                      )}
                      {tab === 'past' && (
                        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          {request.status === 'completed' ? <Sparkles className="size-4" /> : request.status === 'closed' ? <BookMarked className="size-4" /> : <Inbox className="size-4" />}
                          {request.status === 'completed' ? 'Natapos na' : request.status === 'closed' ? 'Isinara' : 'Tinanggihan'}
                        </span>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[1.25rem] border border-dashed border-border bg-card/60 p-8 text-center">
              {tab === 'active' ? <Sparkles className="mx-auto size-8 text-muted-foreground" /> : tab === 'pending' ? <Inbox className="mx-auto size-8 text-muted-foreground" /> : <BookMarked className="mx-auto size-8 text-muted-foreground" />}
              <h2 className="mt-3 font-serif text-xl font-bold">
                {tab === 'active' ? 'Wala pang active collaboration' : tab === 'pending' ? 'Wala pang pending proposal' : 'Wala pang collaboration history'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Kapag may request o proposal, lalabas ito rito.</p>
              {tab !== 'past' && <Button variant="outline" onClick={() => setTab('find')} className="mt-4 rounded-full">Maghanap ng ka-collab</Button>}
            </div>
          )}
        </section>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/50 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) resetDialog()
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="collaboration-form-title" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <h2 id="collaboration-form-title" className="font-serif text-2xl font-bold">
              {dialog.kind === 'listing' ? 'Mag-post ng collaboration request' : dialog.kind === 'apply' ? 'Mag-propose sa project' : `Mag-propose kay ${dialog.profile.name}`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {dialog.kind === 'listing'
                ? 'Makikita ito ng mga creator at maaari nila itong sagutin ng proposal.'
                : dialog.kind === 'apply'
                  ? 'Ipakilala ang sarili at ipaliwanag kung paano ka makakatulong sa project.'
                  : 'Ipakilala ang project at kung anong collaboration ang gusto mong simulan.'}
            </p>
            <form onSubmit={(event) => void submitRequest(event)} className="mt-5 space-y-4">
              {dialog.kind === 'listing' && (
                <label className="block space-y-1.5 text-sm font-semibold">
                  Hinahanap na role
                  <select value={listingRole} onChange={(event) => setListingRole(event.target.value as CollaboratorRole)} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal">
                    <option value="artist">Alagad ng sining</option>
                    <option value="writer">Writer</option>
                  </select>
                </label>
              )}
              <label className="block space-y-1.5 text-sm font-semibold">
                Pamagat ng project
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal" />
              </label>
              <label className="block space-y-1.5 text-sm font-semibold">
                {dialog.kind === 'apply' ? 'Proposal mo' : 'Mga detalye'}
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} required rows={5} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal" />
                <span className="block text-right text-xs font-normal text-muted-foreground">{description.length}/2,000</span>
              </label>
              {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" disabled={saving} onClick={resetDialog} className="rounded-full">Kanselahin</Button>
                <Button type="submit" disabled={saving} className="rounded-full bg-accent text-accent-foreground">
                  {saving ? 'Ipinapadala...' : dialog.kind === 'listing' ? 'I-post ang request' : 'Ipadala ang proposal'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
