import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  // Project icon pool
  Code2,
  Terminal,
  Server,
  BarChart2,
  Folder,
  Box,
  Layers,
  Puzzle,
  ClipboardList,
} from 'lucide-react'
import { getProjects, connectRepo, triggerIndex, COLOR_HEX } from '../api/projects'
import { getMe, getStats, getActivity } from '../api/auth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import GithubNavbarAnimation from '../components/GithubNavbarAnimation'
import backgroundImage from '../assets/backgroundimage.png'
import backgroundVideo from '../assets/animatedvideo2.webm'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/Select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/DropdownMenu'

// Maps icon key → Lucide component (single source of truth on the frontend)
const PROJECT_ICON_MAP = {
  'code-brackets': Code2,
  'terminal':      Terminal,
  'server':        Server,
  'chart':         BarChart2,
  'folder':        Folder,
  'box':           Box,
  'layers':        Layers,
  'puzzle-piece':  Puzzle,
  'clipboard':     ClipboardList,
  'pulse':         Activity,
}


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
    ready: { color: '#10B981', label: 'Ready' },
    indexing: { color: '#F59E0B', label: 'Indexing', pulse: true },
    pending: { color: '#F59E0B', label: 'Queued', pulse: true },
    failed: { color: '#F43F5E', label: 'Failed' },
  }
  const { color, label, pulse } = cfg[status] ?? cfg.pending
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color, fontSize: 12, fontWeight: 500 }}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0${pulse ? ' animate-pulse' : ''}`} style={{ background: color }} />
      {label}
    </span>
  )
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
// Supports three trend modes:
//   noTrend  — show a static informational label (Chunks Indexed only)
//   normal   — standard current vs prev percentage comparison

function StatCard({ icon: Icon, label, value, prevValue, loading, noTrend = false, infoLabel = null }) {
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

  // Compute a single-line trend string + color.
  // Returns null when in noTrend mode (informational label shown instead).
  const trend = (() => {
    if (noTrend) return null
    if (loading || value == null) return null

    // No historical data available at all
    if (prevValue === undefined || prevValue === null) {
      return { text: 'No previous data', icon: null, color: 'text-white/30' }
    }

    const curr = value
    const prev = prevValue

    // Divide-by-zero guard: prev is 0
    if (prev === 0) {
      if (curr > 0) return { text: '↗ +100% vs last week', icon: <TrendingUp size={10} />, color: 'text-[#10B981]' }
      return { text: '\u2192 0% vs last week', icon: <Minus size={10} />, color: 'text-white/30' }
    }

    const pct = Math.round(((curr - prev) / prev) * 100)
    if (pct > 0) return { text: `↗ +${pct}% vs last week`, icon: <TrendingUp size={10} />, color: 'text-[#10B981]' }
    if (pct < 0) return { text: `↘ ${pct}% vs last week`, icon: <TrendingDown size={10} />, color: 'text-[#F43F5E]' }
    return { text: '\u2192 0% vs last week', icon: <Minus size={10} />, color: 'text-white/30' }
  })()

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

      {/* Trend / info footer */}
      <div className="flex items-center gap-1" style={{ fontSize: 11, minHeight: 16 }}>
        {loading || value == null ? (
          <div className="w-24 h-3 rounded bg-white/[0.03] animate-pulse" />
        ) : noTrend ? (
          // Static informational label for metrics where trend is not meaningful
          <span style={{ color: 'rgba(255,255,255,0.28)' }}>{infoLabel ?? 'No trend data'}</span>
        ) : trend ? (
          <span className={`flex items-center gap-1 font-medium ${trend.color}`}>
            {trend.icon && <span className={trend.color}>{trend.icon}</span>}
            {trend.text}
          </span>
        ) : null}
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

/**
 * ProjectIconBadge — larger rounded-square icon box for the new card layout.
 * Uses resolved_icon / resolved_color from ProjectResponse (server-resolved, no client logic).
 */
function ProjectIconBadge({ icon, color }) {
  const IconComponent = PROJECT_ICON_MAP[icon] ?? Folder
  const hex = COLOR_HEX[color] ?? '#818CF8'
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: `${hex}15`,
        border: `1px solid ${hex}28`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: hex,
      }}
    >
      <IconComponent size={18} />
    </div>
  )
}

function ProjectCard({ project, isOwner, onRetry, retrying }) {
  const navigate = useNavigate()
  const isIndexing = project.index_status === 'indexing' || project.index_status === 'pending'
  const isFailed   = project.index_status === 'failed'
  const isReady    = project.index_status === 'ready'
  const repoName   = project.github_repo_full_name?.split('/')[1] ?? project.github_repo_full_name

  const hex        = COLOR_HEX[project.resolved_color] ?? '#818CF8'

  return (
    <div
      className="relative rounded-xl overflow-hidden cursor-pointer group transition-all duration-150"
      style={{
        background: '#0D0D0F',
        border: `1px solid ${hex}22`,
      }}
      onClick={() => { if (!isIndexing) navigate(`/mentor/${project.id}`) }}
    >
      {/* ── Left accent bar ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          borderRadius: '12px 0 0 12px',
          background: `linear-gradient(to bottom, ${hex}CC, ${hex}55)`,
        }}
      />

      {/* ── Card body ───────────────────────────────────────────────────────── */}
      <div style={{ paddingLeft: 16 }}>

        {/* Header row */}
        <div style={{ padding: '18px 18px 14px 16px' }}>
          <div className="flex items-start justify-between gap-4">

            {/* Left — icon + name block */}
            <div className="flex items-start gap-3 min-w-0">
              <ProjectIconBadge
                icon={project.resolved_icon}
                color={project.resolved_color}
              />
              <div className="min-w-0" style={{ paddingTop: 2 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 650, color: '#fff', lineHeight: 1.25 }}>
                    {repoName}
                  </span>
                  {!isOwner && (
                    <span
                      className="uppercase tracking-wider"
                      style={{
                        fontSize: 8, fontWeight: 700, padding: '2px 5px',
                        background: 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.45)',
                        borderRadius: 4,
                      }}
                    >
                      Shared
                    </span>
                  )}
                </div>
                <span
                  className="font-mono block truncate"
                  style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.32)' }}
                >
                  {project.github_repo_full_name}
                </span>
              </div>
            </div>

            {/* Right — status + indexed time + chevron nav */}
            <div className="flex items-start gap-3 flex-shrink-0">
              {/* Status + time stack */}
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={project.index_status} />
                {!isIndexing && project.last_indexed_at && (
                  <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)' }}>
                    {relativeIndexedTime(project.last_indexed_at)}
                  </span>
                )}
              </div>

              {/* Circular chevron nav button */}
              {!isIndexing && !isFailed && (
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/mentor/${project.id}`) }}
                  className="flex items-center justify-center transition-all duration-150"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: `1px solid rgba(255,255,255,0.1)`,
                    background: 'rgba(255,255,255,0.03)',
                    color: 'rgba(255,255,255,0.3)',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = `${hex}60`
                    e.currentTarget.style.background   = `${hex}12`
                    e.currentTarget.style.color         = hex
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.background   = 'rgba(255,255,255,0.03)'
                    e.currentTarget.style.color         = 'rgba(255,255,255,0.3)'
                  }}
                  aria-label={`Open ${repoName}`}
                >
                  <ChevronRight size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Action area ─────────────────────────────────────────────────── */}
        {isIndexing ? (
          <div style={{ padding: '0 18px 16px 16px' }}><IndeterminateBar /></div>
        ) : isFailed ? (
          <div style={{ padding: '0 18px 16px 16px' }}>
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
            style={{
              borderTop: '1px solid rgba(255,255,255,0.04)',
              padding: '8px 14px 10px 12px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-wrap gap-0.5">
              {(project.mentor_chat_shared || isOwner) && (
                <button
                  className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => navigate(`/mentor/${project.id}`)}
                >
                  <MessageSquare size={12} /><span>Mentor</span>
                </button>
              )}
              {(project.career_mode_shared || isOwner) && (
                <button
                  className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => navigate(`/career/${project.id}`)}
                >
                  <Briefcase size={12} /><span>Career</span>
                </button>
              )}
              {(project.repo_health_shared || isOwner) && (
                <button
                  className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => navigate(`/health/${project.id}`)}
                >
                  <Activity size={12} /><span>Health</span>
                </button>
              )}
              {(project.diagrams_shared || isOwner) && (
                <button
                  className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => navigate(`/diagram/${project.id}`)}
                >
                  <GitBranch size={12} /><span>Diagrams</span>
                </button>
              )}
              {(project.pr_review_shared || isOwner) && (
                <button
                  className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => navigate(`/pr-review/${project.id}`)}
                >
                  <GitPullRequest size={12} /><span>PR Review</span>
                </button>
              )}
              {isOwner && (
                <button
                  className="flex items-center gap-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05] transition-all"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => navigate(`/team/${project.id}`)}
                >
                  <Users size={12} /><span>Team</span>
                </button>
              )}
            </div>
          </div>
        ) : null}

      </div>{/* end card body */}
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────

const ACTIVITY_ICONS = {
  pr_reviewed: { icon: GitPullRequest, color: '#818CF8', bg: 'rgba(99,102,241,0.15)', label: 'PR reviewed' },
  diagram_generated: { icon: GitBranch, color: '#FB923C', bg: 'rgba(251,146,60,0.15)', label: 'Diagram generated' },
  indexed: { icon: Database, color: '#34D399', bg: 'rgba(52,211,153,0.15)', label: 'Chunks indexed' },
  artifact_generated: { icon: FileText, color: '#2DD4BF', bg: 'rgba(45,212,191,0.15)', label: 'Artifact created' },
  health_analyzed: { icon: Activity, color: '#94A3B8', bg: 'rgba(148,163,184,0.15)', label: 'Health analyzed' },
}

const filterLabels = {
  all: 'All',
  pr_reviews: 'PR Reviews',
  diagrams: 'Diagrams',
  artifacts: 'Artifacts',
  team: 'Team Activity'
}

function ActivityFeed({ data = [], isLoading, filter = 'all', onFilterChange, onViewAll }) {
  return (
    <div className="flex flex-col h-full bg-[#0D0D0F]/80 backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.02] flex-shrink-0" style={{ padding: '14px 16px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Recent activity</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors border border-white/[0.08] hover:border-white/[0.12] rounded bg-white/[0.02] px-2 py-0.5 text-[11px] font-medium text-white/50 focus:outline-none">
              <span>{filterLabels[filter] || 'All'}</span>
              <ChevronDown size={11} className="opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onFilterChange('all')}>All</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange('pr_reviews')}>PR Reviews</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange('diagrams')}>Diagrams</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange('artifacts')}>Artifacts</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange('team')}>Team Activity</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No activity found.</span>
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
        className="flex items-center justify-between border-t border-white/[0.02] hover:bg-white/[0.02] transition-colors flex-shrink-0"
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
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Background video hooks removed for performance and static image replacement

  // localStorage persisted states
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('dashboard_sort_by') || 'recent')
  const [activityFilter, setActivityFilter] = useState(() => localStorage.getItem('dashboard_activity_filter') || 'all')

  const handleSortChange = (val) => {
    setSortBy(val)
    localStorage.setItem('dashboard_sort_by', val)
  }

  const handleActivityFilterChange = (val) => {
    setActivityFilter(val)
    localStorage.setItem('dashboard_activity_filter', val)
  }

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe })

  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    refetchInterval: q => q.state.data?.some(p => ['pending', 'indexing'].includes(p.index_status)) ? 3000 : false,
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
    // Projects: cumulative count vs 7-day-ago count. created_at is immutable.
    { icon: FolderGit2, label: 'Projects', key: 'project_count', prevKey: 'project_count_prev', noTrend: false },
    // Chunks: live codebase size only. Trend removed — chunks are deleted/re-created on re-index.
    { icon: Database, label: 'Chunks indexed', key: 'total_chunks', prevKey: null, noTrend: true, infoLabel: 'Tracks codebase size' },
    // PRs: rolling 7-day window (this week vs prior week). reviewed_at is immutable.
    { icon: GitPullRequest, label: 'PRs reviewed', key: 'pr_reviews_this_week', prevKey: 'pr_reviews_prev_week', noTrend: false },
    // Artifacts: rolling 7-day window using updated_at (refreshed on every regeneration).
    { icon: FileText, label: 'Artifact activity', key: 'artifacts_this_week', prevKey: 'artifacts_prev_week', noTrend: false },
  ]

  const allSharedStatus = projects.length > 0 && projects.every(p => p.index_status === projects[0].index_status)

  const filtered = projects.filter(p => {
    const q = searchQuery.toLowerCase().trim()
    return !q || (p.github_repo_full_name?.toLowerCase() || '').includes(q)
  })

  const sortedProjects = [...filtered].sort((a, b) => {
    if (sortBy === 'name_asc') {
      return (a.github_repo_full_name || '').localeCompare(b.github_repo_full_name || '')
    }
    if (sortBy === 'name_desc') {
      return (b.github_repo_full_name || '').localeCompare(a.github_repo_full_name || '')
    }
    if (sortBy === 'oldest') {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0
      const db = b.created_at ? new Date(b.created_at).getTime() : 0
      return da - db
    }
    if (sortBy === 'recently_indexed') {
      const da = a.last_indexed_at ? new Date(a.last_indexed_at).getTime() : 0
      const db = b.last_indexed_at ? new Date(b.last_indexed_at).getTime() : 0
      return db - da
    }
    if (sortBy === 'status' && !allSharedStatus) {
      const statusOrder = { ready: 1, indexing: 2, pending: 3, failed: 4 }
      const sa = statusOrder[a.index_status] || 9
      const sb = statusOrder[b.index_status] || 9
      return sa - sb
    }
    // Default to 'recent' (created_at desc)
    const da = a.created_at ? new Date(a.created_at).getTime() : 0
    const db = b.created_at ? new Date(b.created_at).getTime() : 0
    return db - da
  })

  const filteredActivity = (activity || []).filter(event => {
    if (activityFilter === 'all') return true
    if (activityFilter === 'pr_reviews') return event.type === 'pr_reviewed'
    if (activityFilter === 'diagrams') return event.type === 'diagram_generated'
    if (activityFilter === 'artifacts') return event.type === 'artifact_generated'
    if (activityFilter === 'team') return event.type === 'team_activity' || event.type === 'team'
    return false
  })

  return (
    <div className="h-full text-white flex flex-col relative overflow-hidden">

      {/* Background Artwork Layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {/*
          Analytical positioning (1280×800 viewport, 1220×748 content):
          Image 495×865 at height:120% → rendered 900px×515px
          Scale factor S = 900/865 = 1.040
          Ring center source (380, 155) → rendered (395, 161) from image origin
          left:46% → image starts at 561px → ring lands at 561+395=956px (78% of 1220) ✓
          Convergence source (300, 340) → rendered (312, 354) → dashboard (873, 350) = 72% x, 47% y ✓
          Stream source (150-270, 80-560) → dashboard (717-841, 83-583) = 59-69% x ✓
          Planet source (335, 510) → rendered (348, 530) → dashboard (909, 526) = 75% x, 70% y ✓
        */}
        <video
          src={backgroundVideo}
          autoPlay
          loop
          muted
          playsInline
          poster={backgroundImage}
          style={{
            position: 'absolute',
            left: '46%',
            top: '-4%',
            height: '120%',
            width: 'auto',
            opacity: 0.68,
          }}
        />
        {/* Left blend: fully opaque through image left edge (46%), then wide feather to transparent */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to right, rgba(5,5,5,1) 0%, rgba(5,5,5,1) 47%, rgba(5,5,5,0.65) 58%, rgba(5,5,5,0.12) 70%, transparent 82%)',
          }}
        />
        {/* Right blend: fade image's right edge back into dark panel background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to left, rgba(5,5,5,0.70) 0%, transparent 22%)',
          }}
        />
        {/* Top darkener for header readability */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(5,5,5,0.80) 0%, transparent 11%)',
          }}
        />
      </div>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center border-b border-white/[0.02] sticky top-0 bg-[#050505]/60 backdrop-blur-md z-[10]" style={{ height: 52, padding: '0 20px' }}>
        {/* Left block (desktop only) */}
        <div className="hidden md:block md:flex-1" />

        {/* Search bar */}
        <div className="relative w-full max-w-[460px] flex-1 md:flex-none">
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

        {/* Spacer (mobile only) */}
        <div className="flex-1 md:hidden" />

        {/* New project */}
        <div className="flex-shrink-0 md:flex-1 flex items-center justify-end gap-0">
          {/* Brand beacon — hand-drawn GitHub mark, animated loop */}
          <GithubNavbarAnimation />
          <Button
            onClick={() => setShowModal(true)}
            variant="primary"
            className="h-[34px] px-0.6 text-xs font-semibold shadow-sm"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            <Plus size={13} className="mr-0" />
            <span>New project</span>
          </Button>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="flex-1 flex overflow-hidden relative z-10">

        {/* Left column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">


          {/* Stats strip */}
          <div className="border-b border-white/[0.02] flex-shrink-0">
            {/* Stat cards occupy full width */}
            <div className="flex divide-x divide-white/[0.02] w-full">
              {STATS.map(({ icon, label, key, prevKey, noTrend, infoLabel }) => (
                <StatCard
                  key={key}
                  icon={icon}
                  label={label}
                  value={stats?.[key]}
                  prevValue={prevKey ? stats?.[prevKey] : undefined}
                  loading={statsLoading}
                  noTrend={noTrend}
                  infoLabel={infoLabel}
                />
              ))}
            </div>
          </div>

          {/* Projects list (scrollable) */}
          <div className="flex-1 overflow-y-auto" style={{ padding: '20px 20px' }}>

            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>All projects</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-white/40 text-xs font-semibold select-none">Sort by:</span>
                  <Select value={sortBy} onValueChange={handleSortChange}>
                    <SelectTrigger className="h-8 bg-transparent border-transparent px-2 text-white/70 hover:text-white font-semibold">
                      <SelectValue placeholder="Recent" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="recent">Recent</SelectItem>
                      <SelectItem value="name_asc">Name A → Z</SelectItem>
                      <SelectItem value="name_desc">Name Z → A</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="recently_indexed">Recently Indexed</SelectItem>
                      {!allSharedStatus && <SelectItem value="status">Status</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
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
                {sortedProjects.map(project => {
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
        <div className="flex-shrink-0 border-l border-white/[0.02] flex flex-col overflow-hidden" style={{ width: 260 }}>
          <ActivityFeed
            data={filteredActivity}
            isLoading={activityLoading}
            filter={activityFilter}
            onFilterChange={handleActivityFilterChange}
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
