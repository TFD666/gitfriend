import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  FolderGit2,
  Database,
  GitPullRequest,
  FileText,
  MessageSquare,
  Briefcase,
  Activity,
  GitBranch,
  Users,
  ChevronRight,
  TrendingUp,
  X,
  LayoutGrid,
} from 'lucide-react'
import { getProjects, connectRepo, triggerIndex } from '../api/projects'
import { getMe, getStats, getActivity } from '../api/auth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import heroGemstone from '../assets/hero_gemstone.png'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = {
    ready:    { color: '#10B981', label: 'Ready' },
    indexing: { color: '#F59E0B', label: 'Indexing', pulse: true },
    pending:  { color: '#F59E0B', label: 'Queued',   pulse: true },
    failed:   { color: '#F43F5E', label: 'Failed' },
  }
  const { color, label, pulse } = cfg[status] ?? cfg.pending
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color, fontSize: 12, fontWeight: 500 }}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0${pulse ? ' animate-pulse' : ''}`} style={{ background: color }} />
      {label}
    </span>
  )
}

// ── Verdict badge ─────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }) {
  const map = {
    approve:         { bg: 'bg-[#0E2F1F] text-[#10B981]', label: 'Approve ✓' },
    request_changes: { bg: 'bg-[#2D0F18] text-[#F43F5E]', label: 'Changes ✗' },
    comment:         { bg: 'bg-white/5 text-white/60',      label: 'Comment' },
  }
  const { bg, label } = map[verdict] ?? { bg: 'bg-white/5 text-white/60', label: verdict }
  return <span className={`inline-flex items-center px-1 py-px rounded text-[9px] font-medium ${bg}`}>{label}</span>
}

// ── Indeterminate bar ─────────────────────────────────────────────────────────

function IndeterminateBar() {
  return (
    <div className="h-[2px] bg-white/[0.06] rounded-full overflow-hidden relative">
      <div className="absolute h-full rounded-full" style={{ width: '40%', background: 'var(--accent)', animation: 'indeterminate 1.5s ease-in-out infinite' }} />
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
// Reference: large light number, small label below, tiny trend text. Good horizontal padding.

function StatCard({ icon: Icon, label, value, trend, loading }) {
  const [display, setDisplay] = useState(0)
  const raf = useRef(null)

  useEffect(() => {
    if (loading || value == null) return
    const dur = 900, start = performance.now()
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1)
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => raf.current && cancelAnimationFrame(raf.current)
  }, [value, loading])

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2" style={{ padding: '20px 24px' }}>
      <div className="flex items-start justify-between">
        {loading
          ? <div className="w-10 h-8 rounded bg-white/[0.04] animate-pulse" />
          : <div style={{ fontSize: 30, fontWeight: 300, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
              {display.toLocaleString()}
            </div>
        }
        <Icon size={15} className="text-white/25 mt-1 flex-shrink-0" />
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>{label}</div>
      <div className="flex items-center gap-1" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
        <TrendingUp size={10} className="text-[#10B981]" />
        <span>↑ {trend}</span>
      </div>
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

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-[#0A0A0A] border border-white/[0.08] rounded-2xl p-6 w-full max-w-sm shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-white/35 hover:text-white transition-colors p-1">
          <X size={14} />
        </button>
        <h2 className="text-sm font-semibold mb-1 text-white">Connect Repository</h2>
        <p className="text-xs text-white/45 mb-4">
          Enter the GitHub repo in <code className="bg-white/5 px-1 py-px rounded font-mono text-[10px] text-white/60">owner/repo</code> format
        </p>
        <form onSubmit={e => { e.preventDefault(); repoName.trim() && mutation.mutate(repoName.trim()) }} className="space-y-3">
          <Input autoFocus placeholder="e.g. octocat/hello-world" value={repoName} onChange={e => setRepoName(e.target.value)} className="w-full" />
          {mutation.error && <p className="text-xs text-rose-400">{mutation.error.response?.data?.detail ?? mutation.error.message}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" onClick={onClose} variant="ghost" className="h-8 px-3 text-xs">Cancel</Button>
            <Button type="submit" disabled={!repoName.trim() || mutation.isPending} className="h-8 px-4 text-xs font-semibold">
              {mutation.isPending ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────────────────────
// Reference: name (15px 600) + status right | mono path + indexed time right | divider | action buttons

function ProjectCard({ project, isOwner, onRetry, retrying }) {
  const navigate = useNavigate()
  const isIndexing = project.index_status === 'indexing' || project.index_status === 'pending'
  const isFailed   = project.index_status === 'failed'
  const isReady    = project.index_status === 'ready'
  const repoName   = project.github_repo_full_name?.split('/')[1] ?? project.github_repo_full_name
  const artifactLabels = { portfolio: 'Portfolio', resume_bullets: 'Resume', interview_prep: 'Interview Prep' }

  return (
    <div
      className="bg-[#0D0D0F] border border-white/[0.07] hover:border-white/[0.14] rounded-xl transition-colors duration-150 cursor-pointer overflow-hidden"
      onClick={() => { if (!isIndexing) navigate(`/mentor/${project.id}`) }}
    >
      {/* Card header: name + status */}
      <div style={{ padding: '16px 20px 12px 20px' }}>
        <div className="flex items-start justify-between gap-4">
          {/* Left */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{repoName}</span>
              {!isOwner && (
                <span className="bg-white/10 text-white/55 rounded uppercase tracking-wider" style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px' }}>Shared</span>
              )}
            </div>
            <span className="font-mono block truncate" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
              {project.github_repo_full_name}
            </span>
          </div>
          {/* Right */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <StatusBadge status={project.index_status} />
            {!isIndexing && project.last_indexed_at && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{relativeIndexedTime(project.last_indexed_at)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Action area */}
      {isIndexing ? (
        <div style={{ padding: '0 20px 14px 20px' }}><IndeterminateBar /></div>
      ) : isFailed ? (
        <div style={{ padding: '0 20px 14px 20px' }}>
          <div className="flex items-center gap-2 bg-rose-500/5 border border-rose-500/10 rounded-lg px-3 py-2">
            <span className="text-rose-300 flex-1" style={{ fontSize: 12 }}>Indexing failed</span>
            <button
              className="text-rose-300 hover:bg-rose-500/10 transition-colors rounded px-2 py-0.5"
              style={{ fontSize: 11 }}
              onClick={e => { e.stopPropagation(); onRetry(project.id) }}
              disabled={retrying}
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        </div>
      ) : isReady ? (
        <div
          className="border-t border-white/[0.05]"
          style={{ padding: '8px 14px' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex flex-wrap gap-0.5">
            {(project.mentor_chat_shared || isOwner) && (
              <button className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => navigate(`/mentor/${project.id}`)}>
                <MessageSquare size={12} /><span>Mentor</span>
              </button>
            )}
            {(project.career_mode_shared || isOwner) && (
              <button className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => navigate(`/career/${project.id}`)}>
                <Briefcase size={12} /><span>Career</span>
              </button>
            )}
            {(project.repo_health_shared || isOwner) && (
              <button className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => navigate(`/health/${project.id}`)}>
                <Activity size={12} /><span>Health</span>
              </button>
            )}
            {(project.diagrams_shared || isOwner) && (
              <button className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => navigate(`/diagram/${project.id}`)}>
                <GitBranch size={12} /><span>Diagrams</span>
              </button>
            )}
            {(project.pr_review_shared || isOwner) && (
              <button className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => navigate(`/pr-review/${project.id}`)}>
                <GitPullRequest size={12} /><span>PR Review</span>
              </button>
            )}
            {isOwner && (
              <button className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => navigate(`/team/${project.id}`)}>
                <Users size={12} /><span>Team</span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* PR/artifact meta */}
      {isReady && (project.last_pr_number != null || project.last_artifact_type) && (
        <div className="border-t border-white/[0.03] flex items-center gap-3" style={{ padding: '6px 20px', fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>
          {project.last_pr_number != null && (
            <div className="flex items-center gap-1">
              <span>Last PR</span>
              <span className="font-mono bg-white/[0.04] px-1 rounded" style={{ color: 'rgba(255,255,255,0.45)' }}>#{project.last_pr_number}</span>
              {project.last_pr_verdict && <VerdictBadge verdict={project.last_pr_verdict} />}
            </div>
          )}
          {project.last_artifact_type && <div>Last artifact: <span style={{ color: 'rgba(255,255,255,0.45)' }}>{artifactLabels[project.last_artifact_type] ?? project.last_artifact_type}</span></div>}
        </div>
      )}
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────

const ACTIVITY_ICONS = {
  pr_reviewed:        { icon: GitPullRequest, color: '#818CF8', bg: 'rgba(99,102,241,0.15)',  label: 'PR reviewed' },
  diagram_generated:  { icon: GitBranch,      color: '#FB923C', bg: 'rgba(251,146,60,0.15)', label: 'Diagram generated' },
  indexed:            { icon: Database,        color: '#34D399', bg: 'rgba(52,211,153,0.15)', label: 'Chunks indexed' },
  artifact_generated: { icon: FileText,        color: '#2DD4BF', bg: 'rgba(45,212,191,0.15)', label: 'Artifact created' },
  health_analyzed:    { icon: Activity,        color: '#94A3B8', bg: 'rgba(148,163,184,0.15)', label: 'Health analyzed' },
}

function ActivityFeed({ data = [], isLoading, onViewAll }) {
  return (
    <div className="flex flex-col h-full bg-[#0D0D0F] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.04] flex-shrink-0" style={{ padding: '14px 16px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Recent activity</span>
        <span className="cursor-pointer hover:text-white transition-colors border border-white/[0.08] rounded" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '2px 8px' }}>
          All ▾
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="divide-y divide-white/[0.03]">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3" style={{ padding: '12px 16px' }}>
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 bg-white/[0.04] rounded w-2/3 animate-pulse" />
                  <div className="h-2 bg-white/[0.03] rounded w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Database size={20} className="text-white/20 mb-2" />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No activity yet</span>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {data.map((event, i) => {
              const cfg = ACTIVITY_ICONS[event.type] ?? { icon: Database, color: '#ffffff60', bg: 'rgba(255,255,255,0.06)', label: event.type }
              const repoName = event.project_name?.split('/')?.pop() ?? event.project_name
              const Icon = cfg.icon
              return (
                <div key={`${event.project_id}-${event.type}-${event.ts}-${i}`} className="flex items-start gap-3 hover:bg-white/[0.02] transition-colors" style={{ padding: '11px 16px' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg, color: cfg.color }}>
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.88)', lineHeight: 1.3 }}>{cfg.label}</span>
                      <span className="font-mono flex-shrink-0" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)' }}>{relativeTime(event.ts)}</span>
                    </div>
                    <div className="truncate mt-0.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{repoName}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <button
        onClick={onViewAll}
        className="flex items-center justify-between border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors flex-shrink-0"
        style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}
      >
        <span>View all activity</span>
        <ChevronRight size={13} className="text-white/30" />
      </button>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()
  const [showModal, setShowModal]     = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe })

  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    refetchInterval: q => q.state.data?.some(p => ['pending','indexing'].includes(p.index_status)) ? 3000 : false,
  })

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({ queryKey: ['stats'], queryFn: getStats })
  const { data: activity, isLoading: activityLoading } = useQuery({ queryKey: ['activity'], queryFn: getActivity })

  const reindexMutation = useMutation({
    mutationFn: triggerIndex,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  // ⌘K shortcut
  useEffect(() => {
    const fn = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.getElementById('dash-search')?.focus() } }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  const STATS = [
    { icon: FolderGit2,     label: 'Projects',          key: 'project_count',    trend: '12% from last week' },
    { icon: Database,       label: 'Chunks indexed',    key: 'total_chunks',     trend: '8% from last week' },
    { icon: GitPullRequest, label: 'PRs reviewed',      key: 'pr_reviews_count', trend: '20% from last week' },
    { icon: FileText,       label: 'Artifacts created', key: 'artifacts_count',  trend: '6% from last week' },
  ]

  const filtered = projects.filter(p => {
    const q = searchQuery.toLowerCase().trim()
    return !q || (p.github_repo_full_name?.toLowerCase() || '').includes(q)
  })

  return (
    <div className="h-full bg-[#050505] text-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center gap-4 border-b border-white/[0.05] sticky top-0 bg-[#050505]/90 backdrop-blur-md z-10" style={{ height: 52, padding: '0 20px' }}>
        <div style={{ width: 80, flexShrink: 0 }} />

        {/* Search bar */}
        <div className="relative flex-1" style={{ maxWidth: 460 }}>
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input
            id="dash-search"
            type="text"
            placeholder="Search projects, PRs, diagrams..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.13] focus:border-white/[0.2] rounded-lg focus:outline-none transition-all"
            style={{ height: 34, fontSize: 12.5, color: '#fff', paddingLeft: 34, paddingRight: 52 }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none select-none" style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>
            <span className="border border-white/[0.1] rounded px-1 py-px font-mono">⌘</span>
            <span className="border border-white/[0.1] rounded px-1 py-px font-mono">K</span>
          </div>
        </div>

        {/* New project */}
        <div style={{ width: 110, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 border border-white/[0.18] rounded-xl hover:bg-white/[0.05] hover:border-white/[0.3] transition-all"
            style={{ height: 34, padding: '0 14px', fontSize: 12.5, fontWeight: 500, color: '#fff' }}
          >
            <Plus size={13} />
            <span>New project</span>
          </button>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="flex-1 flex overflow-hidden">

        {/* Left column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Stats strip + gemstone */}
          <div className="relative border-b border-white/[0.05] flex-shrink-0 overflow-hidden" style={{ minHeight: 110 }}>
            {/* Stat cards occupy left portion */}
            <div className="flex divide-x divide-white/[0.05]" style={{ width: 'calc(100% - 260px)' }}>
              {STATS.map(({ icon, label, key, trend }) => (
                <StatCard
                  key={key}
                  icon={icon}
                  label={label}
                  value={stats?.[key]}
                  trend={trend}
                  loading={statsLoading}
                  error={!!statsError}
                />
              ))}
            </div>

            {/* Gemstone hero — right side of stats */}
            <div className="absolute right-0 top-0 bottom-0 pointer-events-none select-none overflow-hidden" style={{ width: 280 }}>
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 60% 50%, rgba(255,255,255,0.045) 0%, transparent 65%)' }} />
              <img
                src={heroGemstone}
                alt=""
                className="absolute object-contain"
                style={{ right: -30, top: '50%', transform: 'translateY(-50%)', height: '230%', width: 'auto', opacity: 0.92, filter: 'brightness(0.95) contrast(1.04)' }}
              />
            </div>
          </div>

          {/* Projects list (scrollable) */}
          <div className="flex-1 overflow-y-auto" style={{ padding: '20px 20px' }}>

            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>All projects</span>
              <div className="flex items-center gap-3" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                <div className="flex items-center gap-1 cursor-pointer hover:text-white/70 transition-colors select-none">
                  <span>Sort by:</span>
                  <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Recent</span>
                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <button className="hover:text-white/70 transition-colors p-0.5">
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>

            {/* States */}
            {isLoading && (
              <div className="text-center py-16" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading projects…</div>
            )}
            {error && (
              <div className="text-center py-16 text-rose-400" style={{ fontSize: 12 }}>{error.response?.data?.detail ?? error.message}</div>
            )}

            {/* Empty state */}
            {!isLoading && !error && projects.length === 0 && (
              <div className="border border-dashed border-white/[0.08] rounded-xl flex flex-col items-center gap-3" style={{ padding: '60px 24px' }}>
                <FolderGit2 size={26} className="text-white/20" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>No projects connected</span>
                <span className="text-center" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', maxWidth: 240 }}>
                  Connect your GitHub repositories to start indexing and using AI features.
                </span>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.1] rounded-xl hover:bg-white/[0.1] transition-all"
                  style={{ marginTop: 4, height: 32, padding: '0 14px', fontSize: 12, color: '#fff' }}
                >
                  <Plus size={13} /> Connect repository
                </button>
              </div>
            )}

            {/* Project cards */}
            {!isLoading && !error && projects.length > 0 && (
              <div className="flex flex-col gap-3">
                {filtered.map(project => {
                  const isOwner = me && String(project.user_id) === String(me.id)
                  return (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      isOwner={isOwner}
                      onRetry={id => reindexMutation.mutate(id)}
                      retrying={reindexMutation.isPending && reindexMutation.variables === project.id}
                    />
                  )
                })}

                {/* Create new project */}
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-3 border border-dashed border-white/[0.07] hover:border-white/[0.15] rounded-xl bg-transparent hover:bg-white/[0.01] transition-all text-left group"
                  style={{ padding: '14px 18px' }}
                >
                  <div className="w-8 h-8 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center group-hover:bg-white/[0.07] group-hover:border-white/[0.18] transition-all flex-shrink-0">
                    <Plus size={14} className="text-white/35 group-hover:text-white/75" />
                  </div>
                  <div>
                    <div className="group-hover:text-white transition-colors" style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>Create new project</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Start something new and track it here</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: activity */}
        <div className="flex-shrink-0 border-l border-white/[0.05] flex flex-col overflow-hidden" style={{ width: 260 }}>
          <ActivityFeed
            data={activity}
            isLoading={activityLoading}
            onViewAll={() => navigate('/invites')}
          />
        </div>
      </main>

      {/* Modal */}
      <AnimatePresence>
        {showModal && <ConnectModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </div>
  )
}
