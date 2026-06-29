import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, Clock, BarChart2, CheckCircle } from 'lucide-react'
import { getHealth, triggerHealthAnalysis } from '../api/projects'
import { useProjectRole } from '../hooks/useProjectRole'
import ViewerBanner from '../components/ui/ViewerBanner'

const COOLDOWN_MINUTES = 10

// ---------------------------------------------------------------------------
// Time display utilities (display only — not logic)
// ---------------------------------------------------------------------------

function formatLastAnalyzed(iso) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

function daysAgo(isoString) {
  if (!isoString) return null
  const days = Math.floor((Date.now() - new Date(isoString)) / 86_400_000)
  return days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
}

function minutesAgo(isoString) {
  if (!isoString) return null
  return Math.floor((Date.now() - new Date(isoString)) / 60_000)
}

function staleColor(iso) {
  if (!iso) return 'var(--text-secondary)'
  const d = Math.floor((Date.now() - new Date(iso)) / 86_400_000)
  if (d > 180) return 'var(--danger)'
  if (d >= 90) return 'var(--warning)'
  return 'var(--text-secondary)'
}

function scoreGradient(pct) {
  if (pct >= 70) return 'linear-gradient(90deg, var(--danger), #FF6B8A)'
  if (pct >= 40) return 'linear-gradient(90deg, var(--warning), #FBBF24)'
  return 'linear-gradient(90deg, var(--accent), #C084FC)'
}

// ---------------------------------------------------------------------------
// Score bar — animates width 0→actual on mount
// ---------------------------------------------------------------------------

function HotspotBar({ score, rowDelay = 0 }) {
  const pct = Math.round((score ?? 0) * 100)
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), rowDelay + 80)
    return () => clearTimeout(t)
  }, [rowDelay])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: '80px', height: '6px',
        background: 'var(--bg-subtle)', borderRadius: '999px',
        flexShrink: 0, overflow: 'hidden',
      }}>
        <div style={{
          height: '6px', borderRadius: '999px',
          background: scoreGradient(pct),
          width: animated ? `${pct}%` : '0%',
          transition: 'width 600ms ease-out',
        }} />
      </div>
      <span className="mono" style={{ fontSize: '13px', color: 'var(--text-primary)', minWidth: '28px', textAlign: 'right' }}>
        {pct}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hotspots tab
// ---------------------------------------------------------------------------

function HotspotsTab({ hotspots, onAnalyze, canAnalyze }) {
  if (hotspots.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '48px 24px' }}>
        <Activity size={32} className="empty-state-icon" />
        <p className="empty-state-title" style={{ margin: 0 }}>No hotspots found</p>
        <p className="empty-state-desc" style={{ margin: 0 }}>
          Run an analysis to see complexity and churn data.
        </p>
        {canAnalyze && (
          <button onClick={onAnalyze} className="btn-primary" style={{ marginTop: '4px' }}>
            <Activity size={13} />
            Analyze →
          </button>
        )}
      </div>
    )
  }

  return (
    <table className="table" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 'auto' }} />
        <col style={{ width: '90px' }} />
        <col style={{ width: '80px' }} />
        <col style={{ width: '130px' }} />
      </colgroup>
      <thead>
        <tr>
          <th>File</th>
          <th style={{ textAlign: 'right' }}>
            Complexity{' '}
            <span
              title="Complexity is a heuristic proxy (control-flow token count), not a standard metric."
              style={{ cursor: 'help', color: 'var(--text-muted)', fontSize: '10px' }}
            >?</span>
          </th>
          <th style={{ textAlign: 'right' }}>Commits</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {hotspots.map((f, i) => (
          <tr
            key={f.file_path}
            style={{
              animation: 'row-in 200ms ease-out both',
              animationDelay: `${i * 50}ms`,
            }}
          >
            <td style={{ maxWidth: 0, overflow: 'hidden' }}>
              <span
                className="mono"
                title={f.file_path.length > 50 ? f.file_path : undefined}
                style={{
                  fontSize: '12px', color: 'var(--text-primary)',
                  display: 'block', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {f.file_path}
              </span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <span className="mono" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {f.complexity_score ?? '—'}
              </span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <span className="mono" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {f.commit_count ?? '—'}
              </span>
            </td>
            <td>
              <HotspotBar score={f.hotspot_score} rowDelay={i * 50} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Stale tab
// ---------------------------------------------------------------------------

function StaleTab({ stale }) {
  if (stale.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '48px 24px' }}>
        <CheckCircle size={32} style={{ color: 'var(--success)' }} />
        <p className="empty-state-title" style={{ margin: 0, color: 'var(--success)' }}>
          No stale files detected
        </p>
        <p className="empty-state-desc" style={{ margin: 0 }}>
          All files have been touched within the last 90 days.
        </p>
      </div>
    )
  }

  return (
    <table className="table" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 'auto' }} />
        <col style={{ width: '140px' }} />
      </colgroup>
      <thead>
        <tr>
          <th>File</th>
          <th style={{ textAlign: 'right' }}>Last Commit</th>
        </tr>
      </thead>
      <tbody>
        {stale.map((f, i) => (
          <tr
            key={f.file_path}
            style={{
              animation: 'row-in 200ms ease-out both',
              animationDelay: `${i * 50}ms`,
            }}
          >
            <td style={{ maxWidth: 0, overflow: 'hidden' }}>
              <span
                className="mono"
                title={f.file_path.length > 50 ? f.file_path : undefined}
                style={{
                  fontSize: '12px', color: 'var(--text-primary)',
                  display: 'block', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {f.file_path}
              </span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '13px', color: staleColor(f.last_commit_at) }}>
                {daysAgo(f.last_commit_at) ?? '—'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Skeleton rows (shown during analysis)
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <div style={{ padding: '16px' }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          style={{
            height: '44px', background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)', marginBottom: '8px',
            animation: 'pulse-skeleton 1.5s ease-in-out infinite',
            animationDelay: `${i * 150}ms`,
          }}
        />
      ))}
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', margin: '8px 0 0' }}>
        Analysis in progress…
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const TABS = ['hotspots', 'stale']

export default function RepoHealth() {
  const { projectId } = useParams()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('hotspots')
  const [analyzeError, setAnalyzeError] = useState(null)

  const role = useProjectRole(projectId)
  const canAnalyze = role === 'owner' || role === 'editor'

  const { data, isLoading } = useQuery({
    queryKey: ['health', projectId],
    queryFn: () => getHealth(projectId),
    refetchInterval: (query) =>
      query.state.data?.health_status === 'running' ? 3000 : false,
  })

  const analyzeMutation = useMutation({
    mutationFn: () => triggerHealthAnalysis(projectId),
    onSuccess: () => {
      setAnalyzeError(null)
      queryClient.invalidateQueries({ queryKey: ['health', projectId] })
    },
    onError: (err) => {
      setAnalyzeError(err?.response?.data?.detail ?? 'Failed to start analysis.')
    },
  })

  const status = data?.health_status ?? null
  const lastRanAt = data?.last_health_analysis_at ?? null
  const isRunning = status === 'running'
  const isFailed = status === 'failed'
  const neverRun = status === null && !isLoading

  const elapsedMinutes = lastRanAt ? minutesAgo(lastRanAt) : null
  const onCooldown =
    !isRunning &&
    elapsedMinutes !== null &&
    elapsedMinutes < COOLDOWN_MINUTES
  const remainingMinutes = onCooldown
    ? Math.ceil(COOLDOWN_MINUTES - elapsedMinutes)
    : 0

  const analyzeDisabled = isRunning || onCooldown || analyzeMutation.isPending

  const hotspots = data?.hotspots ?? []
  const stale = data?.stale ?? []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Sticky header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          maxWidth: '860px', margin: '0 auto', padding: '12px 32px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <Link
            to="/dashboard"
            style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            ← Dashboard
          </Link>
          <span style={{ color: 'var(--border)', fontSize: '12px' }}>/</span>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Repo Health
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.2 }}>
              Complexity hotspots and stale file detection
            </div>
          </div>
        </div>
      </header>

      {/* Viewer banner */}
      {role === 'viewer' && <ViewerBanner />}

      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '0 32px 40px' }}>

        {/* Initial load spinner */}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <span style={{
              width: '20px', height: '20px', borderRadius: '50%',
              border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.8s linear infinite', display: 'inline-block',
            }} />
          </div>
        )}

        {/* Never-run empty state */}
        {neverRun && (
          <div className="empty-state" style={{ padding: '64px 0' }}>
            <BarChart2 size={48} className="empty-state-icon" />
            <p className="empty-state-title" style={{ margin: 0 }}>Run your first analysis</p>
            <p className="empty-state-desc" style={{ margin: 0 }}>
              DevKit AI will surface complexity hotspots and files that haven't been touched in 90+ days.
            </p>
            {canAnalyze && (
              <>
                <button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={analyzeMutation.isPending}
                  className="btn-primary"
                  style={{ marginTop: '4px' }}
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <span style={{
                        width: '12px', height: '12px', borderRadius: '50%',
                        border: '2px solid currentColor', borderTopColor: 'transparent',
                        animation: 'spin 0.7s linear infinite', display: 'inline-block',
                      }} />
                      Starting…
                    </>
                  ) : (
                    <><Activity size={13} />Analyze →</>
                  )}
                </button>
                {analyzeError && (
                  <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px' }}>{analyzeError}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Post-first-run layout */}
        {!neverRun && !isLoading && (
          <>
            {/* Control bar */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: '16px 20px', margin: '24px 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {lastRanAt ? (
                  <>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Last analyzed {formatLastAnalyzed(lastRanAt)}
                    </span>
                    {onCooldown && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Next analysis available in {remainingMinutes}m
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No analysis run yet</span>
                )}
                {isFailed && (
                  <span style={{ fontSize: '12px', color: 'var(--danger)' }}>
                    Last analysis failed — retry when ready.
                  </span>
                )}
                {analyzeError && (
                  <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{analyzeError}</span>
                )}
              </div>

              {canAnalyze ? (
                isRunning ? (
                  <button disabled className="btn-secondary" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                    <span style={{
                      width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
                      border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                      animation: 'spin 0.8s linear infinite', display: 'inline-block',
                    }} />
                    Analyzing…
                  </button>
                ) : onCooldown ? (
                  <button disabled className="btn-secondary" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                    <Clock size={13} />
                    Wait {remainingMinutes}m
                  </button>
                ) : (
                  <button
                    onClick={() => analyzeMutation.mutate()}
                    disabled={analyzeDisabled}
                    className="btn-primary"
                  >
                    <Activity size={13} />
                    Analyze
                  </button>
                )
              ) : (
                <span className="badge badge-neutral">Read only</span>
              )}
            </div>

            {/* Tab bar — always visible, even during isRunning */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              {TABS.map(tab => {
                const count = tab === 'hotspots' ? hotspots.length : stale.length
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '10px 16px', fontSize: '13px', fontWeight: 500,
                      color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                      background: 'none', border: 'none',
                      borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: '-1px', cursor: 'pointer', outline: 'none',
                      transition: 'color 150ms ease',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                    onMouseEnter={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--text-primary)' }}
                    onMouseLeave={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--text-secondary)' }}
                  >
                    {tab === 'hotspots' ? 'Hotspots' : 'Stale'}
                    {count > 0 && (
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        ({count})
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Table card — border-top none to merge with tab bar */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderTop: 'none',
              borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
              overflow: 'hidden',
            }}>
              {isRunning ? (
                <SkeletonRows />
              ) : status === 'ready' ? (
                <>
                  {activeTab === 'hotspots' && (
                    <HotspotsTab
                      hotspots={hotspots}
                      onAnalyze={() => analyzeMutation.mutate()}
                      canAnalyze={canAnalyze}
                    />
                  )}
                  {activeTab === 'stale' && <StaleTab stale={stale} />}
                </>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
