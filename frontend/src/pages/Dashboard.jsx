import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Activity,
  GitBranch,
  GitPullRequest,
  Users,
  MessageSquare,
  Briefcase,
  FolderGit2,
  Database,
  FileText,
  Clock,
} from 'lucide-react'
import { getProjects, connectRepo, triggerIndex } from '../api/projects'
import { getMe, getStats, getActivity } from '../api/auth'
import EmptyState from '../components/ui/EmptyState'

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'just now'
}

function relativeIndexedTime(iso) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(h / 24)
  if (d > 0) return `indexed ${d}d ago`
  if (h > 0) return `indexed ${h}h ago`
  return 'indexed just now'
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const configs = {
    ready:    { variant: 'success', label: 'Ready',    pulse: false },
    indexing: { variant: 'warning', label: 'Indexing…', pulse: true },
    pending:  { variant: 'warning', label: 'Queued',   pulse: true },
    failed:   { variant: 'danger',  label: 'Failed',   pulse: false },
  }
  const { variant, label, pulse } = configs[status] ?? configs.pending
  const dotColors = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' }

  return (
    <span className={`badge badge-${variant}`}>
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', background: dotColors[variant], display: 'inline-block', flexShrink: 0 }}
        className={pulse ? 'animate-pulse-dot' : undefined}
      />
      {label}
    </span>
  )
}

// ── Verdict badge ─────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }) {
  const map = {
    approve: { variant: 'success', label: 'Approve ✓' },
    request_changes: { variant: 'danger', label: 'Changes ✗' },
    comment: { variant: 'neutral', label: 'Comment' },
  }
  const { variant, label } = map[verdict] ?? { variant: 'neutral', label: verdict }
  return (
    <span className={`badge badge-${variant}`} style={{ fontSize: '10px', padding: '1px 4px' }}>
      {label}
    </span>
  )
}

// ── Indeterminate progress bar ────────────────────────────────────────────────

function IndeterminateBar() {
  return (
    <div style={{ height: '2px', background: 'var(--bg-subtle)', borderRadius: '1px', overflow: 'hidden', position: 'relative', margin: '12px 0' }}>
      <div
        className="animate-indeterminate"
        style={{ position: 'absolute', height: '100%', width: '40%', background: 'var(--accent)', borderRadius: '1px' }}
      />
    </div>
  )
}

// ── Stat card with count-up animation ────────────────────────────────────────

function StatCard({ icon: Icon, label, value, loading, error }) {
  const [display, setDisplay] = useState(0)
  const counterRef = useRef({ val: 0 })
  const rafRef = useRef(null)

  useEffect(() => {
    if (loading || error || value == null) return
    const target = value
    const duration = 1200 // ms
    const start = performance.now()
    const startVal = 0

    function tick(now) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // power2.out easing: 1 - (1 - t)^2
      const eased = 1 - Math.pow(1 - progress, 2)
      const current = Math.round(startVal + (target - startVal) * eased)
      setDisplay(current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, loading, error])

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        position: 'relative',
        transition: 'border-color 150ms ease',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-focus)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <Icon
        size={16}
        style={{ position: 'absolute', top: '14px', right: '14px', color: 'var(--accent)', opacity: 0.8 }}
      />

      {loading ? (
        <div
          style={{
            width: '60px',
            height: '28px',
            borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(90deg, var(--bg-subtle) 25%, var(--bg-overlay) 50%, var(--bg-subtle) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      ) : (
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
          {error ? '—' : display.toLocaleString()}
        </div>
      )}
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{label}</div>
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────

const ACTIVITY_CONFIG = {
  indexed:            { color: 'var(--success)', label: 'Repo indexed' },
  pr_reviewed:        { color: 'var(--accent)',  label: 'PR reviewed' },
  artifact_generated: { color: 'var(--info)',    label: 'Career artifact generated' },
  diagram_generated:  { color: 'var(--warning)', label: 'Diagram generated' },
  health_analyzed:    { color: 'var(--text-muted)', label: 'Health analyzed' },
}

function ActivityFeed({ data, isLoading }) {
  return (
    <div
      style={{
        width: '300px',
        flexShrink: 0,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        height: 'fit-content',
        maxHeight: 'calc(100vh - 220px)',
        overflowY: 'auto',
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
        Recent Activity
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: '42px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', opacity: 0.6 }} />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '8px' }}>
          <Clock size={24} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No activity yet</span>
        </div>
      )}

      {data && data.length > 0 && (
        <div>
          {data.map((event, i) => {
            const config = ACTIVITY_CONFIG[event.type] ?? { color: 'var(--text-muted)', label: event.type }
            const repoName = event.project_name?.split('/')?.pop() ?? event.project_name
            return (
              <div
                key={`${event.project_id}-${event.type}-${event.ts}-${i}`}
                className="activity-item"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 0',
                  borderBottom: i < data.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  animationDelay: `${i * 30}ms`,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: config.color,
                    flexShrink: 0,
                    marginTop: '5px',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {config.label}
                    </span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {relativeTime(event.ts)}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {repoName}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Connect modal ─────────────────────────────────────────────────────────────

function ConnectModal({ onClose }) {
  const [repoName, setRepoName] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: connectRepo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      onClose()
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (repoName.trim()) mutation.mutate(repoName.trim())
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: 'var(--shadow-md)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
          Connect Repository
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Enter the GitHub repo in{' '}
          <span className="mono">owner/repo</span> format
        </p>

        <form onSubmit={handleSubmit}>
          <input
            className="input"
            autoFocus
            placeholder="e.g. octocat/hello-world"
            value={repoName}
            onChange={e => setRepoName(e.target.value)}
            style={{ marginBottom: '12px' }}
          />

          {mutation.error && (
            <p style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '12px' }}>
              {mutation.error.response?.data?.detail ?? mutation.error.message}
            </p>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={!repoName.trim() || mutation.isPending} className="btn-primary">
              {mutation.isPending ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, isOwner, onRetry, retrying }) {
  const navigate = useNavigate()
  const isIndexing = project.index_status === 'indexing' || project.index_status === 'pending'
  const isFailed   = project.index_status === 'failed'
  const isReady    = project.index_status === 'ready'

  const repoName = project.github_repo_full_name?.split('/')[1] ?? project.github_repo_full_name

  const artifactLabels = {
    portfolio: 'Portfolio',
    resume_bullets: 'Resume',
    interview_prep: 'Interview Prep',
  }

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isFailed ? 'rgba(244,63,94,0.3)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        transition: 'border-color 150ms ease',
        cursor: isIndexing ? 'default' : 'pointer',
      }}
      onMouseEnter={e => { if (!isFailed) e.currentTarget.style.borderColor = 'var(--border-focus)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isFailed ? 'rgba(244,63,94,0.3)' : 'var(--border)' }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {repoName}
          </span>
          {!isOwner && <span className="badge badge-accent">Shared</span>}
        </div>
        <StatusBadge status={project.index_status} />
      </div>

      {/* Second row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        <span className="mono" style={{ color: 'var(--text-secondary)' }}>
          {project.github_repo_full_name}
        </span>
        {!isIndexing && project.last_indexed_at && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {relativeIndexedTime(project.last_indexed_at)}
          </span>
        )}
      </div>

      {/* Divider / indexing bar / failed */}
      {isIndexing ? (
        <IndeterminateBar />
      ) : isFailed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Indexing failed —</span>
          <button
            className="btn-ghost"
            style={{ padding: '2px 8px', fontSize: '12px' }}
            onClick={() => onRetry(project.id)}
            disabled={retrying}
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : (
        <>
          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '12px 0' }} />

          {/* Action buttons row (2nd divider row) */}
          {isReady && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {(project.mentor_chat_shared || isOwner) && (
                <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => navigate(`/mentor/${project.id}`)}>
                  <MessageSquare size={14} /> Mentor
                </button>
              )}
              {(project.career_mode_shared || isOwner) && (
                <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => navigate(`/career/${project.id}`)}>
                  <Briefcase size={14} /> Career
                </button>
              )}
              {(project.repo_health_shared || isOwner) && (
                <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => navigate(`/health/${project.id}`)}>
                  <Activity size={14} /> Health
                </button>
              )}
              {(project.diagrams_shared || isOwner) && (
                <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => navigate(`/diagram/${project.id}`)}>
                  <GitBranch size={14} /> Diagrams
                </button>
              )}
              {(project.pr_review_shared || isOwner) && (
                <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => navigate(`/pr-review/${project.id}`)}>
                  <GitPullRequest size={14} /> PR Review
                </button>
              )}
              {isOwner && (
                <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => navigate(`/team/${project.id}`)}>
                  <Users size={14} /> Team
                </button>
              )}
            </div>
          )}

          {/* Quick-actions row (3rd row) — only if ready AND data exists */}
          {isReady && (project.last_pr_number != null || project.last_artifact_type) && (
            <>
              <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '10px 0 8px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {project.last_pr_number != null && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Last PR{' '}
                    <span className="mono" style={{ fontSize: '11px' }}>#{project.last_pr_number}</span>
                    {project.last_pr_verdict && <VerdictBadge verdict={project.last_pr_verdict} />}
                  </span>
                )}
                {project.last_artifact_type && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Last artifact: {artifactLabels[project.last_artifact_type] ?? project.last_artifact_type}
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe })

  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    refetchInterval: (query) => {
      const data = query.state.data ?? []
      return data.some(p => p.index_status === 'pending' || p.index_status === 'indexing')
        ? 3000
        : false
    },
  })

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  })

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: getActivity,
  })

  const reindexMutation = useMutation({
    mutationFn: triggerIndex,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  const STAT_CARDS = [
    { icon: FolderGit2,    label: 'Projects',         key: 'project_count' },
    { icon: Database,      label: 'Chunks indexed',   key: 'total_chunks' },
    { icon: GitPullRequest,label: 'PRs reviewed',     key: 'pr_reviews_count' },
    { icon: FileText,      label: 'Career artifacts', key: 'artifacts_count' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Page header */}
      <header style={{
        height: '56px',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'sticky',
        top: 0,
        background: 'var(--bg-base)',
        backdropFilter: 'blur(8px)',
        zIndex: 10,
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Projects</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={14} /> Add project
        </button>
      </header>

      {/* Content */}
      <div style={{ padding: '24px' }}>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {STAT_CARDS.map(({ icon, label, key }) => (
            <StatCard
              key={key}
              icon={icon}
              label={label}
              value={stats?.[key]}
              loading={statsLoading}
              error={!!statsError}
            />
          ))}
        </div>

        {/* Main area: project grid + activity feed */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          {/* Left: project cards */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {isLoading && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '80px 0', fontSize: '13px' }}>
                Loading…
              </div>
            )}

            {error && (
              <div style={{ textAlign: 'center', color: 'var(--danger)', padding: '80px 0', fontSize: '13px' }}>
                {error.response?.data?.detail ?? error.message}
              </div>
            )}

            {!isLoading && !error && projects.length === 0 && (
              <EmptyState
                icon={GitBranch}
                title="No projects yet"
                description="Connect a GitHub repo to get started."
                action={
                  <button className="btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={14} /> Add project
                  </button>
                }
              />
            )}

            {projects.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '12px' }}>
                {projects.map(project => {
                  const isOwner = me && String(project.user_id) === String(me.id)
                  return (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      isOwner={isOwner}
                      onRetry={(id) => reindexMutation.mutate(id)}
                      retrying={reindexMutation.isPending && reindexMutation.variables === project.id}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: activity feed */}
          <ActivityFeed data={activity} isLoading={activityLoading} />
        </div>
      </div>

      {showModal && <ConnectModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
