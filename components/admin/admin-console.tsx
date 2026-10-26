'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  ChevronDown,
  Clock3,
  EyeOff,
  Flag,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'

export type AdminSection = 'overview' | 'reports' | 'users' | 'content' | 'audit' | 'staff'

type AccountHistoryItem = { action: string; note: string; createdAt: string }
type Reporter = {
  id: string
  createdAt: string
  reason: string
  note: string
  user: { id: string; displayName: string; username: string }
}
type AdminUser = {
  id: string
  displayName: string
  username: string
  roles: string[]
  joinedAt: string
  status: 'active' | 'suspended' | 'banned'
  staffRole?: 'moderator' | 'admin' | null
  suspendedUntil: string | null
  warningCount: number
  reportCount: number
  workCount: number
  postCount: number
  lastActive: string
  accountHistory: AccountHistoryItem[]
}
export type AdminReport = {
  id: string
  targetType: string
  targetId: string
  createdAt: string
  reason: string
  content: string
  context: string | null
  reportCount: number
  allReportCount: number
  reportedUser: AdminUser
  reporters: Reporter[]
}
type AuditEntry = {
  id: string
  action: string
  note: string
  details: Record<string, unknown>
  createdAt: string
  reportId: string | null
  targetType: string | null
  actorId: string
  actor: string
  targetUserId: string | null
  target: string | null
}
type ContentItem = {
  id: string
  type: string
  title: string
  content: string
  createdAt: string
  hidden: boolean
  authorId: string
  author: string
}
type StaffMember = {
  id: string
  displayName: string
  username: string
  staffRole: 'moderator' | 'admin'
  joinedAt: string
}
type OverviewData = {
  stats: {
    openReports: number
    urgentReports: number
    resolvedThisWeek: number
    newUsers: number
    publishedWorks: number
  }
  reports: AdminReport[]
  actions: { action: string; note: string; createdAt: string; actor: string; target: string | null }[]
  activity: { date: string; signups: number; posts: number; reports: number }[]
}

const reasonLabels: Record<string, string> = {
  spam_scam: 'Spam or scam',
  harassment_bullying: 'Harassment or bullying',
  hate_speech: 'Hate speech',
  sexual_graphic_content: 'Sexual or graphic content',
  violence_self_harm: 'Violence or self-harm',
  copied_stolen_work: 'Copied or stolen work',
  something_else: 'Something else',
}
const actionLabels: Record<string, string> = {
  dismiss: 'Dismissed report',
  hide_content: 'Hid content',
  warn: 'Warned account',
  suspend: 'Suspended account',
  ban: 'Banned account',
  restore: 'Restored account',
  content_hidden: 'Hid content',
  content_restored: 'Restored content',
  staff_role_changed: 'Changed staff role',
}

const fieldClass = 'min-h-10 rounded-full border border-[#dfc9ac] bg-[#fffaf1] px-4 text-sm text-[#442a1c] outline-none focus-visible:ring-2 focus-visible:ring-[#ab4b30]'
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#dfc9ac] bg-[#fffaf1] px-4 text-sm font-semibold text-[#442a1c] transition hover:bg-[#f4e7d5] disabled:cursor-wait disabled:opacity-60'
const primaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#a8442a] px-4 text-sm font-bold text-white transition hover:bg-[#8f3823] disabled:cursor-wait disabled:opacity-60'

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? data as T[] : []
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatAction(action: string) {
  return actionLabels[action] ?? action.replaceAll('_', ' ')
}

function isUrgent(report: AdminReport) {
  return report.reason === 'violence_self_harm'
    || Date.now() - new Date(report.createdAt).getTime() > 24 * 60 * 60 * 1000
}

function StatusBadge({ status }: { status: string }) {
  const colors = status === 'banned'
    ? 'bg-[#f5c9bc] text-[#9a351f]'
    : status === 'urgent'
      ? 'bg-[#f5c9bc] text-[#9a351f]'
    : status === 'suspended'
      ? 'bg-[#f7e3ab] text-[#744d12]'
      : status === 'active'
        ? 'bg-[#dcebd3] text-[#355d31]'
        : 'bg-[#efe0c8] text-[#73543b]'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${colors}`}>{status}</span>
}

function SearchField({
  value,
  onChange,
  placeholder = 'Search users, posts, reports…',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-full border border-[#dfc9ac] bg-[#fffaf1] px-3 focus-within:ring-2 focus-within:ring-[#ab4b30]">
      <Search className="size-4 shrink-0 text-[#927b65]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9a8671]"
      />
    </label>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-[#dfc9ac] px-5 py-10 text-center text-sm text-[#806b56]">{children}</div>
}

function StatCard({ label, value, note, urgent = false }: { label: string; value: number; note: string; urgent?: boolean }) {
  return (
    <article className="rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-4 shadow-sm">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#7d5d47]">{label}</p>
      <p className={`mt-1 font-serif text-3xl font-bold ${urgent ? 'text-[#a63824]' : 'text-[#41271a]'}`}>{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-[#806b56]">{note}</p>
    </article>
  )
}

function ReportSummary({ report }: { report: AdminReport }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={isUrgent(report) ? 'urgent' : 'open'} />
        <span className="text-xs font-semibold text-[#72553f]">{reasonLabels[report.reason] ?? report.reason}</span>
      </div>
      <p className="mt-1 truncate text-sm font-bold">{report.content.split('\n')[0] || 'Reported content'}</p>
      <p className="mt-1 text-xs text-[#806b56]">
        {report.targetType.replace('_', ' ')} · {report.reportCount} {report.reportCount === 1 ? 'report' : 'reports'} · {formatDate(report.createdAt)}
      </p>
    </div>
  )
}

function Overview({ data }: { data: OverviewData }) {
  const router = useRouter()
  const maximum = Math.max(1, ...data.activity.map((day) => day.signups + day.posts + day.reports))
  const stats = [
    ['Open reports', data.stats.openReports, 'Waiting for review', false],
    ['Urgent', data.stats.urgentReports, 'Handle first', true],
    ['Resolved this week', data.stats.resolvedThisWeek, 'All report outcomes', false],
    ['New users', data.stats.newUsers, 'This week', false],
    ['Published works', data.stats.publishedWorks, 'This week', false],
  ] as const

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value, note, urgent]) => <StatCard key={label} label={label} value={value} note={note} urgent={urgent} />)}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-5">
          <div className="flex items-center justify-between gap-3 border-b border-[#eadbc5] pb-3">
            <h2 className="font-serif text-xl font-bold">Needs your attention</h2>
            <Link href="/admin/reports" className="text-sm font-bold text-[#a8442a] hover:underline">All reports</Link>
          </div>
          <div className="divide-y divide-[#eadbc5]">
            {data.reports.length ? data.reports.map((report) => (
              <Link key={report.id} href={`/admin/reports/${report.id}`} className="flex min-h-[4.6rem] items-center justify-between gap-3 py-3 hover:bg-[#fcf4e8]">
                <ReportSummary report={report} />
                <span className={primaryButtonClass}>Review</span>
              </Link>
            )) : <p className="py-6 text-sm text-[#806b56]">No open reports. The queue is clear.</p>}
          </div>
        </article>
        <article className="rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-5">
          <h2 className="border-b border-[#eadbc5] pb-3 font-serif text-xl font-bold">Recent actions</h2>
          <div className="divide-y divide-[#eadbc5]">
            {data.actions.length ? data.actions.map((action, index) => (
              <p key={`${action.action}-${action.createdAt}-${index}`} className="py-3 text-sm">
                <strong>{action.actor}</strong> {formatAction(action.action).toLowerCase()}
                {action.target ? ` · ${action.target}` : ''} <span className="text-xs text-[#806b56]">· {formatDate(action.createdAt)}</span>
              </p>
            )) : <p className="py-6 text-sm text-[#806b56]">No moderation actions logged yet.</p>}
          </div>
          <Link href="/admin/audit" className="mt-3 inline-block text-sm font-bold text-[#a8442a] hover:underline">Open audit log</Link>
        </article>
      </section>
      <section className="rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-bold">Activity · last 14 days</h2>
            <p className="mt-1 text-xs text-[#806b56]">Daily sign-ups, posts, and reports</p>
          </div>
          <div className="flex gap-3 text-xs text-[#806b56]">
            <span>● Sign-ups</span><span className="text-[#a8442a]">● Posts</span><span className="text-[#c18a2c]">● Reports</span>
          </div>
        </div>
        <div className="mt-5 flex h-36 items-end gap-1 border-b border-[#dfc9ac] sm:gap-2">
          {data.activity.map((day) => {
            const total = day.signups + day.posts + day.reports
            return (
              <button
                key={day.date}
                type="button"
                title={`${day.date}: ${day.signups} sign-ups, ${day.posts} posts, ${day.reports} reports`}
                onClick={() => router.push(`/admin/reports`)}
                className="group flex min-w-0 flex-1 flex-col justify-end"
              >
                <span className="mx-auto w-full max-w-8 rounded-t bg-[#b36b50] transition group-hover:bg-[#a8442a]" style={{ height: `${Math.max(4, total / maximum * 100)}%` }} />
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-[#806b56]">Sign-ups, posts, reports combined</p>
      </section>
    </div>
  )
}

function ReportDetail({
  report,
  note,
  setNote,
  suspendDays,
  setSuspendDays,
  notifyReporters,
  setNotifyReporters,
  notifyReported,
  setNotifyReported,
  onAction,
  busy,
}: {
  report: AdminReport
  note: string
  setNote: (value: string) => void
  suspendDays: number
  setSuspendDays: (value: number) => void
  notifyReporters: boolean
  setNotifyReporters: (value: boolean) => void
  notifyReported: boolean
  setNotifyReported: (value: boolean) => void
  onAction: (action: string) => void
  busy: boolean
}) {
  const user = report.reportedUser
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#806b56]">Reported {report.targetType.replace('_', ' ')}</p>
            <h2 className="mt-1 font-serif text-2xl font-bold">{reasonLabels[report.reason] ?? report.reason}</h2>
          </div>
          <StatusBadge status={isUrgent(report) ? 'urgent' : 'open'} />
        </div>
        <blockquote className="mt-4 whitespace-pre-wrap rounded-xl border-l-4 border-[#a8442a] bg-[#f7eddd] p-4 text-sm leading-6">
          {report.content || '[No content text was available for this report.]'}
        </blockquote>
        {report.context && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[#806b56]">{report.context}</p>}
        <p className="mt-3 text-xs text-[#806b56]">{report.reportCount} open reports · {report.allReportCount} reports total · {formatDate(report.createdAt)}</p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-[#edddc3]"><UserRound className="size-5" /></span>
            <div>
              <h3 className="font-bold">{user.displayName}</h3>
              <p className="text-xs text-[#806b56]">@{user.username} · joined {formatDate(user.joinedAt)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <p><strong>{user.reportCount}</strong> reports received</p>
            <p><strong>{user.warningCount}</strong> warnings</p>
            <p><strong>{user.workCount}</strong> works</p>
            <p><strong>{user.postCount}</strong> posts</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={user.status} />
            {user.staffRole && <span className="rounded-full bg-[#4e2919] px-2.5 py-1 text-xs font-semibold capitalize text-white">{user.staffRole}</span>}
            {user.roles.map((role) => <span key={role} className="rounded-full bg-[#efe0c8] px-2.5 py-1 text-xs font-semibold capitalize">{role}</span>)}
          </div>
          <h4 className="mt-5 text-xs font-extrabold uppercase tracking-wider text-[#806b56]">Account history</h4>
          <div className="mt-2 space-y-2">
            {user.accountHistory.length ? user.accountHistory.map((entry, index) => (
              <p key={`${entry.action}-${entry.createdAt}-${index}`} className="border-l-2 border-[#dfc9ac] pl-3 text-xs leading-5">
                <strong>{formatAction(entry.action)}</strong> · {formatDate(entry.createdAt)}
                {entry.note ? <span className="block text-[#806b56]">{entry.note}</span> : null}
              </p>
            )) : <p className="text-xs text-[#806b56]">No previous moderation actions.</p>}
          </div>
        </section>
        <section className="rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-5">
          <h3 className="font-serif text-xl font-bold">Reporters ({report.reporters.length})</h3>
          <div className="mt-3 max-h-60 space-y-3 overflow-y-auto">
            {report.reporters.map((reporter) => (
              <div key={reporter.id} className="rounded-xl bg-[#f7eddd] p-3">
                <p className="text-sm font-bold">{reporter.user.displayName} <span className="font-normal text-[#806b56]">@{reporter.user.username}</span></p>
                <p className="mt-1 text-xs text-[#806b56]">{reasonLabels[reporter.reason] ?? reporter.reason} · {formatDate(reporter.createdAt)}</p>
                {reporter.note && <p className="mt-2 whitespace-pre-wrap text-sm">{reporter.note}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[#806b56]">Reporter identities are not shared with the reported user.</p>
        </section>
      </div>

      <section className="rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-5">
        <h3 className="font-serif text-xl font-bold">Resolve report</h3>
        <label className="mt-3 block text-sm font-semibold" htmlFor="moderation-note">Internal audit note</label>
        <textarea
          id="moderation-note"
          value={note}
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Record the reason for this decision…"
          className="mt-1 min-h-24 w-full rounded-xl border border-[#dfc9ac] bg-[#fffaf1] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#ab4b30]"
        />
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifyReporters} onChange={(event) => setNotifyReporters(event.target.checked)} />
          Tell the reporter(s) the outcome
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifyReported} onChange={(event) => setNotifyReported(event.target.checked)} />
          Tell the reported user the outcome
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          Suspend for
          <select value={suspendDays} onChange={(event) => setSuspendDays(Number(event.target.value))} className={`${fieldClass} min-h-9 py-1`}>
            {[1, 3, 7, 14, 30, 90, 365].map((days) => <option key={days} value={days}>{days} days</option>)}
          </select>
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={busy} onClick={() => onAction('dismiss')}><Check className="size-4" /> Dismiss</button>
          {report.targetType !== 'profile' && <button type="button" className={buttonClass} disabled={busy} onClick={() => onAction('hide_content')}><EyeOff className="size-4" /> Hide content</button>}
          <button type="button" className={buttonClass} disabled={busy || Boolean(user.staffRole)} title={user.staffRole ? 'Remove staff access before moderating this account.' : undefined} onClick={() => onAction('warn')}><ShieldAlert className="size-4" /> Warn</button>
          <button type="button" className={buttonClass} disabled={busy || Boolean(user.staffRole)} title={user.staffRole ? 'Remove staff access before moderating this account.' : undefined} onClick={() => onAction('suspend')}><Clock3 className="size-4" /> Suspend</button>
          <button type="button" className={`${primaryButtonClass} bg-[#9f321e] hover:bg-[#822816]`} disabled={busy || Boolean(user.staffRole)} title={user.staffRole ? 'Remove staff access before moderating this account.' : undefined} onClick={() => onAction('ban')}><Ban className="size-4" /> Ban</button>
        </div>
        {user.staffRole && <p className="mt-3 text-xs text-[#806b56]">Remove this account’s staff role from Staff &amp; settings before applying account-level moderation.</p>}
      </section>
    </div>
  )
}

function Reports({
  initialReports,
  selectedReportId,
  note,
  setNote,
  suspendDays,
  setSuspendDays,
  notifyReporters,
  setNotifyReporters,
  notifyReported,
  setNotifyReported,
  onAction,
  busy,
}: {
  initialReports: AdminReport[]
  selectedReportId?: string
  note: string
  setNote: (value: string) => void
  suspendDays: number
  setSuspendDays: (value: number) => void
  notifyReporters: boolean
  setNotifyReporters: (value: boolean) => void
  notifyReported: boolean
  setNotifyReported: (value: boolean) => void
  onAction: (action: string, reportId: string) => void
  busy: boolean
}) {
  const [search, setSearch] = useState('')
  const [reason, setReason] = useState('all')
  const [targetType, setTargetType] = useState('all')
  const [status, setStatus] = useState('open')
  const [reports, setReports] = useState(initialReports)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visibleReports = useMemo(() => reports.filter((report) => {
    const text = `${report.content} ${report.context ?? ''} ${report.reportedUser.displayName} ${report.reportedUser.username} ${report.reporters.map((item) => `${item.user.displayName} ${item.note}`).join(' ')}`
    return (reason === 'all' || report.reason === reason)
      && (targetType === 'all' || report.targetType === targetType)
      && (!search || text.toLowerCase().includes(search.toLowerCase()))
  }), [reason, reports, search, targetType])
  const selectedReport = visibleReports.find((report) => report.id === selectedReportId)

  const loadStatus = async (nextStatus: string) => {
    setStatus(nextStatus)
    setLoading(true)
    setError(null)
    setReports([])
    try {
      const response = await fetch(`/api/admin?section=reports&status=${encodeURIComponent(nextStatus)}`)
      const payload = await response.json() as { data?: AdminReport[]; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not load reports.')
      setReports(payload.data ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load reports.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-4 md:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
        <SearchField value={search} onChange={setSearch} placeholder="Search report, user, or note…" />
        <select aria-label="Report status" value={status} onChange={(event) => void loadStatus(event.target.value)} className={fieldClass}>
          <option value="open">Open queue</option><option value="actioned">Actioned</option><option value="dismissed">Dismissed</option>
        </select>
        <select aria-label="Report reason" value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClass}>
          <option value="all">All reasons</option>
          {Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Reported content type" value={targetType} onChange={(event) => setTargetType(event.target.value)} className={fieldClass}>
          <option value="all">All content</option>
          {['post', 'comment', 'chapter_comment', 'work', 'profile'].map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
        </select>
      </section>
      {error && <p role="alert" className="rounded-xl bg-[#f5c9bc] p-3 text-sm text-[#822816]">{error}</p>}
      {loading && <p className="text-sm text-[#806b56]">Loading reports…</p>}
      {selectedReport && status === 'open' ? (
        <div>
          <Link href="/admin/reports" className="mb-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#a8442a]"><ArrowLeft className="size-4" /> Back to queue</Link>
          <ReportDetail
            report={selectedReport}
            note={note}
            setNote={setNote}
            suspendDays={suspendDays}
            setSuspendDays={setSuspendDays}
            notifyReporters={notifyReporters}
            setNotifyReporters={setNotifyReporters}
            notifyReported={notifyReported}
            setNotifyReported={setNotifyReported}
            onAction={(action) => onAction(action, selectedReport.id)}
            busy={busy}
          />
        </div>
      ) : (
        <section className="divide-y divide-[#eadbc5] overflow-hidden rounded-2xl border border-[#e6d5bd] bg-[#fffaf1]">
          {visibleReports.length ? visibleReports.map((report) => (
            <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <ReportSummary report={report} />
              {status === 'open' && <Link className={buttonClass} href={`/admin/reports/${report.id}`}>Review</Link>}
              {status !== 'open' && <span className="text-xs text-[#806b56]">{status}</span>}
            </div>
          )) : <EmptyState>{loading ? 'Loading…' : 'No reports match these filters.'}</EmptyState>}
        </section>
      )}
    </div>
  )
}

function UsersPage({
  users,
  selectedUserId,
  onSelectUser,
  note,
  setNote,
  suspendDays,
  setSuspendDays,
  onAction,
  busy,
}: {
  users: AdminUser[]
  selectedUserId: string | null
  onSelectUser: (id: string) => void
  note: string
  setNote: (value: string) => void
  suspendDays: number
  setSuspendDays: (value: number) => void
  onAction: (action: string, userId: string) => void
  busy: boolean
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [role, setRole] = useState('all')
  const filtered = users.filter((user) => (
    (status === 'all' || user.status === status)
    && (role === 'all' || user.roles.includes(role))
    && (!search || `${user.displayName} ${user.username} ${user.id}`.toLowerCase().includes(search.toLowerCase()))
  ))
  const selected = filtered.find((user) => user.id === selectedUserId) ?? filtered[0]

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-[#e6d5bd] bg-[#fffaf1]">
        <div className="grid gap-2 border-b border-[#eadbc5] p-4 sm:grid-cols-[minmax(10rem,1fr)_auto_auto]">
          <SearchField value={search} onChange={setSearch} placeholder="Search name or @username…" />
          <select aria-label="Account role" value={role} onChange={(event) => setRole(event.target.value)} className={fieldClass}>
            <option value="all">All roles</option><option value="reader">Reader</option><option value="writer">Writer</option><option value="artist">Artist</option>
          </select>
          <select aria-label="Account status" value={status} onChange={(event) => setStatus(event.target.value)} className={fieldClass}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option>
          </select>
        </div>
        <div className="divide-y divide-[#eadbc5]">
          {filtered.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => onSelectUser(user.id)}
              className={`grid w-full grid-cols-[2.5rem_minmax(7rem,1fr)_auto_auto] items-center gap-3 p-3 text-left hover:bg-[#f7eddd] ${selected?.id === user.id ? 'bg-[#f7eddd]' : ''}`}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-[#edddc3]"><UserRound className="size-5" /></span>
              <span className="min-w-0">
                <strong className="block truncate text-sm">{user.displayName}</strong>
                <span className="block truncate text-xs text-[#806b56]">@{user.username}</span>
              </span>
              <span className="hidden text-xs text-[#806b56] sm:block">{user.reportCount} reports · {formatDate(user.joinedAt)}</span>
              <span className="flex flex-wrap items-center gap-1">
                {user.staffRole && <StatusBadge status={user.staffRole} />}
                <StatusBadge status={user.status} />
              </span>
            </button>
          ))}
          {!filtered.length && <EmptyState>No accounts match these filters.</EmptyState>}
        </div>
      </section>
      {selected ? (
        <section className="h-fit rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-[#edddc3]"><UserRound className="size-6" /></span>
            <div><h2 className="font-serif text-xl font-bold">{selected.displayName}</h2><p className="text-sm text-[#806b56]">@{selected.username}</p></div>
          </div>
          <p className="mt-3 text-xs text-[#806b56]">Joined {formatDate(selected.joinedAt)} · Last activity {formatDate(selected.lastActive)}</p>
          <div className="mt-4 flex flex-wrap gap-2">{selected.roles.map((item) => <span key={item} className="rounded-full bg-[#efe0c8] px-3 py-1 text-xs font-bold capitalize">{item}</span>)}<StatusBadge status={selected.status} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <p>{selected.reportCount} reports</p><p>{selected.warningCount} warnings</p><p>{selected.workCount} works</p><p>{selected.postCount} posts</p>
          </div>
          <h3 className="mt-5 text-xs font-extrabold uppercase tracking-wider text-[#806b56]">History</h3>
          <div className="mt-2 space-y-2">
            {selected.accountHistory.length ? selected.accountHistory.map((entry, index) => (
              <p key={`${entry.action}-${index}`} className="border-l-2 border-[#dfc9ac] pl-3 text-xs leading-5"><strong>{formatAction(entry.action)}</strong> · {formatDate(entry.createdAt)}{entry.note && <span className="block text-[#806b56]">{entry.note}</span>}</p>
            )) : <p className="text-xs text-[#806b56]">No account history.</p>}
          </div>
          <label className="mt-4 block text-xs font-semibold" htmlFor="user-action-note">Audit note</label>
          <textarea id="user-action-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} className="mt-1 min-h-16 w-full rounded-lg border border-[#dfc9ac] bg-transparent p-2 text-sm" />
          <label className="mt-2 flex items-center gap-2 text-xs">Suspend for
            <select value={suspendDays} onChange={(event) => setSuspendDays(Number(event.target.value))} className={`${fieldClass} min-h-8 py-1 text-xs`}>
              {[1, 3, 7, 14, 30, 90, 365].map((days) => <option key={days} value={days}>{days} days</option>)}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {!selected.staffRole && <>
              <button type="button" className={buttonClass} disabled={busy} onClick={() => onAction('warn', selected.id)}>Warn</button>
              <button type="button" className={buttonClass} disabled={busy} onClick={() => onAction('suspend', selected.id)}>Suspend</button>
              {selected.status !== 'active' && <button type="button" className={buttonClass} disabled={busy} onClick={() => onAction('restore', selected.id)}><ShieldCheck className="size-4" /> Restore</button>}
              <button type="button" className={`${primaryButtonClass} bg-[#9f321e] hover:bg-[#822816]`} disabled={busy} onClick={() => onAction('ban', selected.id)}><Ban className="size-4" /> Ban</button>
            </>}
          </div>
          {selected.staffRole && <p className="mt-3 text-xs text-[#806b56]">Remove staff access from Staff &amp; settings before applying account-level moderation.</p>}
        </section>
      ) : <EmptyState>Select a user to review account history.</EmptyState>}
    </div>
  )
}

function ContentPage({ items, onVisibility, busy }: { items: ContentItem[]; onVisibility: (item: ContentItem) => void; busy: boolean }) {
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState('all')
  const visible = items.filter((item) => (
    (visibility === 'all' || (visibility === 'hidden' ? item.hidden : !item.hidden))
    && (!search || `${item.title} ${item.content} ${item.author}`.toLowerCase().includes(search.toLowerCase()))
  ))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-4 sm:grid-cols-[minmax(12rem,1fr)_auto]">
        <SearchField value={search} onChange={setSearch} placeholder="Search content or author…" />
        <select aria-label="Content visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)} className={fieldClass}>
          <option value="all">All visibility</option><option value="visible">Visible</option><option value="hidden">Hidden</option>
        </select>
      </div>
      <section className="divide-y divide-[#eadbc5] overflow-hidden rounded-2xl border border-[#e6d5bd] bg-[#fffaf1]">
        {visible.map((item) => (
          <article key={`${item.type}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wider text-[#806b56]">{item.type.replace('_', ' ')}</span>{item.hidden && <StatusBadge status="hidden" />}</div>
              <h2 className="mt-1 font-semibold">{item.title} <span className="text-sm font-normal text-[#806b56]">· {item.author}</span></h2>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-[#806b56]">{item.content || 'No preview text'}</p>
              <p className="mt-1 text-xs text-[#806b56]">{formatDate(item.createdAt)}</p>
            </div>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => onVisibility(item)}>
              {item.hidden ? <><Check className="size-4" /> Restore</> : <><EyeOff className="size-4" /> Hide</>}
            </button>
          </article>
        ))}
        {!visible.length && <EmptyState>No content matches your search.</EmptyState>}
      </section>
    </div>
  )
}

function AuditPage({ entries }: { entries: AuditEntry[] }) {
  const [search, setSearch] = useState('')
  const filtered = entries.filter((entry) => `${entry.action} ${entry.actor} ${entry.target ?? ''} ${entry.note}`.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="space-y-4">
      <SearchField value={search} onChange={setSearch} placeholder="Search actions, staff, or users…" />
      <section className="divide-y divide-[#eadbc5] overflow-hidden rounded-2xl border border-[#e6d5bd] bg-[#fffaf1]">
        {filtered.map((entry) => (
          <article key={entry.id} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h2 className="font-semibold">{formatAction(entry.action)}{entry.target && <> · <span className="font-normal">{entry.target}</span></>}</h2>
              <p className="mt-1 text-xs text-[#806b56]">By {entry.actor} · {formatDate(entry.createdAt)}{entry.targetType ? ` · ${entry.targetType.replace('_', ' ')}` : ''}</p>
              {entry.note && <p className="mt-2 whitespace-pre-wrap text-sm">{entry.note}</p>}
              {entry.reportId && <Link href={`/admin/reports/${entry.reportId}`} className="mt-2 inline-block text-xs font-bold text-[#a8442a] hover:underline">Open report</Link>}
            </div>
            <code className="text-[10px] text-[#806b56]">{entry.id.slice(0, 8)}</code>
          </article>
        ))}
        {!filtered.length && <EmptyState>No audit records match your search.</EmptyState>}
      </section>
    </div>
  )
}

function StaffPage({
  staff,
  onRoleChange,
  busy,
}: {
  staff: StaffMember[]
  onRoleChange: (userId: string, staffRole: string) => void
  busy: boolean
}) {
  const [userId, setUserId] = useState('')
  const [staffRole, setStaffRole] = useState('moderator')
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#e6d5bd] bg-[#fffaf1] p-5">
        <h2 className="font-serif text-xl font-bold">Add staff member</h2>
        <p className="mt-1 text-sm text-[#806b56]">Enter the account UUID. Only administrators can manage staff access.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto]">
          <input aria-label="Account UUID" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Account UUID" className={fieldClass} />
          <select aria-label="New staff role" value={staffRole} onChange={(event) => setStaffRole(event.target.value)} className={fieldClass}>
            <option value="moderator">Moderator</option><option value="admin">Admin</option>
          </select>
          <button type="button" className={primaryButtonClass} disabled={busy || !userId.trim()} onClick={() => onRoleChange(userId.trim(), staffRole)}>Grant role</button>
        </div>
      </section>
      <section className="divide-y divide-[#eadbc5] overflow-hidden rounded-2xl border border-[#e6d5bd] bg-[#fffaf1]">
        {staff.map((member) => (
          <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><h3 className="font-bold">{member.displayName} <span className="font-normal text-[#806b56]">@{member.username}</span></h3><p className="text-xs text-[#806b56]">{member.id} · since {formatDate(member.joinedAt)}</p></div>
            <div className="flex gap-2">
              <select aria-label={`Staff role for ${member.username}`} value={member.staffRole} disabled={busy} onChange={(event) => onRoleChange(member.id, event.target.value)} className={fieldClass}>
                <option value="moderator">Moderator</option><option value="admin">Admin</option><option value="none">Remove staff</option>
              </select>
            </div>
          </div>
        ))}
        {!staff.length && <EmptyState>No staff accounts found.</EmptyState>}
      </section>
    </div>
  )
}

export function AdminConsole({
  section,
  data,
  selectedReportId,
}: {
  section: AdminSection
  data: unknown
  selectedReportId?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [suspendDays, setSuspendDays] = useState(7)
  const [notifyReporters, setNotifyReporters] = useState(true)
  const [notifyReported, setNotifyReported] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const getBanConfirmText = (targetLabel: string) => `Permanently ban ${targetLabel}? This immediately disables account access and cannot be undone.`

  const submitAction = async (payload: Record<string, unknown>, successMessage: string, confirmMessage?: string) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Moderation action failed.')
      setNotice(successMessage)
      setNote('')
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Moderation action failed.')
    } finally {
      setBusy(false)
    }
  }

  const reportAction = (action: string, reportId: string) => {
    void submitAction(
      { action: 'report', reportId, moderationAction: action, note, suspendDays, notifyReporters, notifyReported },
      `${formatAction(action)}. The decision was written to the audit log.`,
      action === 'ban' ? getBanConfirmText('this account and resolve all open reports about this content') : undefined,
    )
  }
  const userAction = (action: string, userId: string) => {
    void submitAction(
      { action: 'user', userId, moderationAction: action, note, suspendDays },
      `${formatAction(action)}. The decision was written to the audit log.`,
      action === 'ban' ? getBanConfirmText('this account') : undefined,
    )
  }
  const users = rows<AdminUser>(data)

  return (
    <div className="space-y-4">
      {notice && <p role="status" className="rounded-xl border border-[#b8d4ae] bg-[#e3f0dc] p-3 text-sm text-[#355d31]">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-[#e8b9ab] bg-[#f8ded5] p-3 text-sm text-[#822816]">{error}</p>}
      {section === 'overview' && <Overview data={data as OverviewData} />}
      {section === 'reports' && (
        <Reports
          initialReports={rows<AdminReport>(data)}
          selectedReportId={selectedReportId}
          note={note}
          setNote={setNote}
          suspendDays={suspendDays}
          setSuspendDays={setSuspendDays}
          notifyReporters={notifyReporters}
          setNotifyReporters={setNotifyReporters}
          notifyReported={notifyReported}
          setNotifyReported={setNotifyReported}
          onAction={reportAction}
          busy={busy}
        />
      )}
      {section === 'users' && (
        <UsersPage
          users={users}
          selectedUserId={selectedUserId}
          onSelectUser={setSelectedUserId}
          note={note}
          setNote={setNote}
          suspendDays={suspendDays}
          setSuspendDays={setSuspendDays}
          onAction={userAction}
          busy={busy}
        />
      )}
      {section === 'content' && (
        <ContentPage
          items={rows<ContentItem>(data)}
          busy={busy}
          onVisibility={(item) => void submitAction(
            { action: 'content', contentType: item.type, contentId: item.id, hidden: !item.hidden, note },
            `${item.hidden ? 'Content restored' : 'Content hidden'} and added to the audit log.`,
          )}
        />
      )}
      {section === 'audit' && <AuditPage entries={rows<AuditEntry>(data)} />}
      {section === 'staff' && (
        <StaffPage
          staff={rows<StaffMember>(data)}
          busy={busy}
          onRoleChange={(userId, staffRole) => void submitAction(
            { action: 'staff-role', userId, staffRole },
            `Staff role updated to ${staffRole}.`,
            staffRole === 'none' ? 'Remove staff access from this account?' : undefined,
          )}
        />
      )}
      {section === 'overview' && (
        <p className="flex items-center gap-2 text-xs text-[#806b56]"><AlertTriangle className="size-3.5" /> Urgent reports are safety-related or older than 24 hours.</p>
      )}
      {section === 'users' && <p className="flex items-center gap-2 text-xs text-[#806b56]"><Users className="size-3.5" /> Staff changes are restricted to administrators.</p>}
      {section === 'reports' && <p className="flex items-center gap-2 text-xs text-[#806b56]"><Flag className="size-3.5" /> Queue order prioritizes safety reports and older cases.</p>}
      {section === 'content' && <p className="flex items-center gap-2 text-xs text-[#806b56]"><ChevronDown className="size-3.5" /> Hidden content is removed from public views and can be restored here.</p>}
    </div>
  )
}
