'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Brush, PenLine, UserRound, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { getSupabaseClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { Badge } from '@/lib/types'

type Profile = {
  id: string
  displayName: string
  username: string
  roles: Badge[]
}

type ProfilePost = {
  id: string
  content: string
  type: string
  createdAt: string
}

function roleLabel(role: Badge) {
  if (role === 'artist') return 'Artist'
  if (role === 'writer') return 'Writer'
  return 'Reader'
}

export function ProfileView({
  profileId,
  onEdit,
}: {
  profileId?: string
  onEdit: () => void
}) {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<ProfilePost[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingFollow, setSavingFollow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [followError, setFollowError] = useState<string | null>(null)

  const loadProfile = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('Profile database is not configured.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const nextUserId = session?.user.id ?? null
      setCurrentUserId(nextUserId)
      const targetId = profileId ?? nextUserId
      if (!targetId) {
        router.push('/login?next=%2Fprofile')
        return
      }

      const [profileResult, postsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, username, roles')
          .eq('id', targetId)
          .maybeSingle(),
        supabase
          .from('community_posts')
          .select('id, content, type, created_at')
          .eq('author_id', targetId)
          .order('created_at', { ascending: false })
          .limit(50),
      ])
      if (profileResult.error) throw profileResult.error
      if (postsResult.error) throw postsResult.error
      if (!profileResult.data) {
        setProfile(null)
        setPosts([])
        setError('This profile could not be found.')
        return
      }

      const nextProfile: Profile = {
        id: profileResult.data.id,
        displayName: profileResult.data.display_name,
        username: profileResult.data.username,
        roles: Array.isArray(profileResult.data.roles)
          ? profileResult.data.roles.filter((role): role is Badge => ['reader', 'writer', 'artist'].includes(role))
          : [],
      }
      setProfile(nextProfile)
      setPosts((postsResult.data ?? []).map((post) => ({
        id: post.id,
        content: post.content,
        type: post.type,
        createdAt: post.created_at,
      })))

      const canBeFollowed = nextProfile.roles.some((role) => role === 'writer' || role === 'artist')
      if (nextUserId && nextUserId !== targetId && canBeFollowed) {
        const { data: follow, error: followQueryError } = await supabase
          .from('community_follows')
          .select('creator_id')
          .eq('follower_id', nextUserId)
          .eq('creator_id', targetId)
          .maybeSingle()
        if (followQueryError) throw followQueryError
        setIsFollowing(Boolean(follow))
      } else {
        setIsFollowing(false)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load this profile.')
    } finally {
      setLoading(false)
    }
  }, [profileId, router])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const followProfile = async () => {
    if (!profile) return
    const supabase = getSupabaseClient()
    setSavingFollow(true)
    setFollowError(null)
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }

      if (isFollowing) {
        const { error: deleteError } = await supabase
          .from('community_follows')
          .delete()
          .eq('follower_id', session.user.id)
          .eq('creator_id', profile.id)
        if (deleteError) throw deleteError
        setIsFollowing(false)
      } else {
        const { error: insertError } = await supabase
          .from('community_follows')
          .insert({ follower_id: session.user.id, creator_id: profile.id })
        if (insertError) throw insertError
        setIsFollowing(true)
      }
    } catch (followActionError) {
      setFollowError(followActionError instanceof Error ? followActionError.message : 'Could not update follow status.')
    } finally {
      setSavingFollow(false)
    }
  }

  if (loading) {
    return <div className="community-card h-64 animate-pulse bg-secondary/45" aria-label="Loading profile" aria-busy="true" />
  }

  if (error || !profile) {
    return (
      <div role="alert" className="community-card flex flex-col items-start gap-3">
        <p className="text-sm text-destructive">{error ?? 'This profile could not be found.'}</p>
        <Button type="button" variant="outline" onClick={() => void loadProfile()}>Try again</Button>
      </div>
    )
  }

  const ownProfile = currentUserId === profile.id
  const creatorProfile = profile.roles.some((role) => role === 'writer' || role === 'artist')

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="profile-banner" />
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-end">
          <span className="profile-avatar" aria-hidden="true">
            <UserRound className="size-8" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-serif text-3xl font-bold">{profile.displayName}</h1>
            <p className="mt-1 break-all text-sm text-muted-foreground">@{profile.username}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.roles.map((role) => (
                <span key={role} className={`badge ${role === 'reader' ? 'badge-reader' : 'badge-writer'}`}>
                  {role === 'artist' ? <Brush className="size-3" /> : role === 'writer' ? <PenLine className="size-3" /> : <BookOpen className="size-3" />}
                  {roleLabel(role)}
                </span>
              ))}
            </div>
          </div>
          {ownProfile ? (
            <Button type="button" variant="outline" onClick={onEdit} className="rounded-lg">Edit profile</Button>
          ) : creatorProfile ? (
            <Button
              type="button"
              onClick={() => void followProfile()}
              disabled={savingFollow}
              variant={isFollowing ? 'outline' : 'default'}
              className="min-h-11 rounded-lg"
            >
              <UsersRound className="size-4" />
              {savingFollow ? 'Saving…' : isFollowing ? 'Following' : 'Follow'}
            </Button>
          ) : null}
        </div>
      </section>

      {followError && <p role="alert" className="text-sm text-destructive">{followError}</p>}

      <section aria-label={`${profile.displayName}'s community posts`}>
        <h2 className="mb-3 font-serif text-2xl font-bold">Community posts</h2>
        {posts.length ? (
          <div className="flex flex-col gap-3">
            {posts.map((post) => (
              <article className="community-card" key={post.id}>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{post.content}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="community-type">{post.type}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString()}</time>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<BookOpen />}
            title={ownProfile ? 'Wala ka pang community posts' : 'Wala pang community posts'}
            message={ownProfile ? 'Ibahagi ang una mong post sa community.' : 'Wala pang nakabahaging post ang account na ito.'}
          />
        )}
      </section>
    </div>
  )
}
