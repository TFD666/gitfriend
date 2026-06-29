import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useProjectRole } from '../hooks/useProjectRole'
import {
  enqueuePRReview,
  listPRReviews,
  getPRReviews,
  postReviewToGitHub,
} from '../api/prReview'
import { getProject } from '../api/projects'
import ViewerBanner from '../components/ui/ViewerBanner'
import ProgressBar from '../components/ui/ProgressBar'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import { GitPullRequest, Sparkles, ExternalLink, AlertCircle, ArrowLeft } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VERDICT_CONFIG = {
  approve:          { variant: 'success', label: 'Approve' },
  request_changes:  { variant: 'danger',  label: 'Request Changes' },
  comment:          { variant: 'warning', label: 'Comment' },
}

function VerdictBadge({ verdict, className = '', style = {} }) {
  const cfg = VERDICT_CONFIG[verdict] ?? { variant: 'neutral', label: verdict }
  return (
    <Badge variant={cfg.variant} className={className} style={style}>
      {cfg.label}
    </Badge>
  )
}

function timeAgo(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RunDetailCard({ run, isOwner, projectId, prNumber, onPostSuccess }) {
  const [postResult, setPostResult] = useState(null)
  const [postError, setPostError] = useState(null)

  const postMutation = useMutation({
    mutationFn: () => postReviewToGitHub(projectId, prNumber, run.id),
    onSuccess: (data) => {
      setPostResult(data)
      setPostError(null)
      if (onPostSuccess) onPostSuccess()
    },
    onError: (err) => {
      setPostError(err?.response?.data?.detail ?? 'Failed to post to GitHub.')
    },
  })

  const allCommentsPosted = run.comments.length > 0 && run.comments.every(c => c.github_posted)

  const commentTypeColors = {
    issue:      'var(--danger)',
    suggestion: 'var(--info)',
    praise:     'var(--success)',
    nitpick:    'var(--text-muted)',
  }

  const commentTypeBadges = {
    issue:      'danger',
    suggestion: 'info',
    praise:     'success',
    nitpick:    'neutral',
  }

  return (
    <div>
      {/* Verdict & Summary Card */}
      <div
        className="card"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          marginBottom: '24px',
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <VerdictBadge verdict={run.verdict} style={{ fontSize: '13px', fontWeight: 600, padding: '4px 10px' }} />
            <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Run #{run.run_number} · {timeAgo(run.reviewed_at)}
            </span>
          </div>

          {/* GitHub Post Section */}
          {isOwner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {allCommentsPosted ? (
                <Badge variant="success">Posted to GitHub ✓</Badge>
              ) : (
                <>
                  {postResult && (
                    <span style={{ fontSize: '12px', color: 'var(--success)' }}>
                      Posted {postResult.posted_count} comment(s)
                    </span>
                  )}
                  {postError && (
                    <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{postError}</span>
                  )}
                  <button
                    onClick={() => postMutation.mutate()}
                    disabled={postMutation.isPending}
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                  >
                    {postMutation.isPending ? 'Posting…' : 'Post to GitHub ↗'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '16px', whiteSpace: 'pre-wrap' }}>
          {run.summary}
        </p>
      </div>

      {/* Inline Comments */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          INLINE COMMENTS ({run.comments.length})
        </div>

        {run.comments.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No inline comments generated for this run.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {run.comments.map((c, index) => {
              const borderLeftColor = commentTypeColors[c.comment_type] ?? 'var(--border)'
              const badgeVariant = commentTypeBadges[c.comment_type] ?? 'neutral'
              return (
                <div
                  key={c.id}
                  className="card"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${borderLeftColor}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                    animation: 'row-in 200ms ease-out both',
                    animationDelay: `${index * 40}ms`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Badge variant={badgeVariant} className="text-xs">
                      {c.comment_type}
                    </Badge>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      {c.file_path}
                    </span>
                    {c.line_number != null && (
                      <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        line {c.line_number}
                      </span>
                    )}
                    {c.github_posted && (
                      <span style={{ fontSize: '11px', color: 'var(--success)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px' }}>
                        ✓ posted
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, marginTop: '10px', whiteSpace: 'pre-wrap' }}>
                    {c.body}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function PRRuns({ projectId, prNumber, isOwner, projectOwner, repoName }) {
  const queryClient = useQueryClient()
  const [activeRunId, setActiveRunId] = useState(null)

  const { data: runs, isLoading, error } = useQuery({
    queryKey: ['prRuns', projectId, prNumber],
    queryFn: () => getPRReviews(projectId, prNumber),
    refetchInterval: false,
  })

  // Set activeRunId to the latest run when loaded
  useEffect(() => {
    if (runs && runs.length > 0) {
      const maxRun = runs.reduce((prev, current) => (prev.run_number > current.run_number) ? prev : current)
      setActiveRunId(maxRun.id)
    } else {
      setActiveRunId(null)
    }
  }, [runs])

  if (isLoading) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ height: '32px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '24px', width: '60%', animation: 'pulse-skeleton 1.5s ease-in-out infinite' }} />
        <div style={{ height: '120px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', marginBottom: '32px', animation: 'pulse-skeleton 1.5s ease-in-out infinite' }} />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 500, letterSpacing: '0.08em' }}>INLINE COMMENTS</div>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: '80px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '12px', animation: 'pulse-skeleton 1.5s ease-in-out infinite', animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: '16px' }}>
        <AlertCircle size={40} style={{ color: 'var(--danger)' }} />
        <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>Failed to load review</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '-8px', textAlign: 'center' }}>
          {error?.response?.data?.detail ?? 'An error occurred while fetching review runs.'}
        </p>
        <button className="btn-secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ['prRuns', projectId, prNumber] })}>
          Retry
        </button>
      </div>
    )
  }

  if (!runs || runs.length === 0) {
    return (
      <div style={{ padding: '64px 24px' }}>
        <EmptyState
          icon={GitPullRequest}
          title="No runs for this PR"
          description="This pull request does not have any review runs yet."
        />
      </div>
    )
  }

  const activeRun = runs.find(r => r.id === activeRunId) || runs[0]
  const maxRunNumber = Math.max(...runs.map(r => r.run_number))

  const handlePostSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['prRuns', projectId, prNumber] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Detail Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <span className="mono" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
              #{prNumber}
            </span>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={activeRun.pr_title}>
              {activeRun.pr_title || `PR #${prNumber}`}
            </h2>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {runs.length} {runs.length === 1 ? 'run' : 'runs'} · Last reviewed {timeAgo(activeRun.reviewed_at)}
          </div>
        </div>
        
        {projectOwner && repoName && (
          <a
            href={`https://github.com/${projectOwner}/${repoName}/pull/${prNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', flexShrink: 0 }}
          >
            View on GitHub <ExternalLink size={13} />
          </a>
        )}
      </div>

      {/* Run selector (pills) */}
      {runs.length > 1 && (
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', overflowX: 'auto', flexShrink: 0 }}>
          {runs.map(r => {
            const isActive = r.id === activeRun.id
            const isNewest = r.run_number === maxRunNumber
            return (
              <button
                key={r.id}
                onClick={() => setActiveRunId(r.id)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? 'var(--accent-subtle)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                className="mono"
              >
                Run #{r.run_number}
                {isNewest && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isActive ? 'var(--accent)' : 'var(--text-muted)', display: 'inline-block' }} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Run Detail - Scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <RunDetailCard
          run={activeRun}
          isOwner={isOwner}
          projectId={projectId}
          prNumber={prNumber}
          onPostSuccess={handlePostSuccess}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PRReview() {
  const { projectId } = useParams()
  const queryClient = useQueryClient()
  const role = useProjectRole(projectId)
  const isOwner = role === 'owner'

  const [prInput, setPrInput] = useState('')
  const [enqueueError, setEnqueueError] = useState(null)
  const [selectedPR, setSelectedPR] = useState(null)

  // Fetch project details for GitHub links
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: !!projectId,
  })

  const repoFullName = project?.github_repo_full_name
  const parts = repoFullName ? repoFullName.split('/') : []
  const projectOwner = parts[0]
  const repoName = parts[1]

  // Poll history list; stop when stable
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['prReviews', projectId],
    queryFn: () => listPRReviews(projectId),
    refetchInterval: selectedPR ? false : 5000,
  })

  // Group runs by pr_number to deduplicate history
  const prMap = new Map()
  history.forEach(item => {
    const prNum = item.pr_number
    if (!prMap.has(prNum)) {
      prMap.set(prNum, {
        id: item.id,
        pr_number: prNum,
        pr_title: item.pr_title,
        verdict: item.verdict,
        latest_run_number: item.run_number,
        runs_count: 1,
        reviewed_at: item.reviewed_at,
      })
    } else {
      const existing = prMap.get(prNum)
      existing.runs_count += 1
      if (item.run_number > existing.latest_run_number) {
        existing.pr_title = item.pr_title || existing.pr_title
        existing.verdict = item.verdict
        existing.latest_run_number = item.run_number
        existing.reviewed_at = item.reviewed_at
      }
    }
  })
  
  const dedupedHistory = Array.from(prMap.values()).sort(
    (a, b) => new Date(b.reviewed_at) - new Date(a.reviewed_at)
  )

  const enqueueMutation = useMutation({
    mutationFn: () => enqueuePRReview(projectId, parseInt(prInput, 10)),
    onSuccess: () => {
      setEnqueueError(null)
      setPrInput('')
      // Poll until new run shows up
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['prReviews', projectId] }), 2000)
    },
    onError: (err) => {
      setEnqueueError(err?.response?.data?.detail ?? 'Failed to queue review.')
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    const n = parseInt(prInput, 10)
    if (!n || n < 1) {
      setEnqueueError('Enter a valid PR number.')
      return
    }
    setEnqueueError(null)
    enqueueMutation.mutate()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* 1. Viewer Banner (if viewer) */}
      {role === 'viewer' && <ViewerBanner />}

      {/* 2. Top Progress Bar for Polling */}
      <ProgressBar loading={enqueueMutation.isPending} />

      {/* 3. Sticky Page Header */}
      <header
        style={{
          height: '56px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(9,9,11,0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <Link
            to="/dashboard"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            <ArrowLeft size={14} />
            Dashboard
          </Link>
          <span style={{ color: 'var(--border)', fontSize: '12px', flexShrink: 0 }}>/</span>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
            PR Review
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            · RAG-augmented code review
          </span>
        </div>
      </header>

      {/* 4. Split panel layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Sidebar (280px) */}
        <aside
          style={{
            width: '280px',
            flexShrink: 0,
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Submit new review (owner only) */}
          {isOwner && (
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>PR #</span>
                <input
                  type="number"
                  min="1"
                  value={prInput}
                  onChange={e => { setPrInput(e.target.value); setEnqueueError(null); }}
                  placeholder="123"
                  className="input"
                  style={{
                    width: '80px',
                    padding: '6px 10px',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                  }}
                />
                <button
                  type="submit"
                  disabled={enqueueMutation.isPending || !prInput}
                  className="btn-primary"
                  style={{ padding: '4px 10px', fontSize: '12px', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  {enqueueMutation.isPending ? (
                    <>
                      <span
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          border: '2px solid currentColor',
                          borderTopColor: 'transparent',
                          animation: 'spin 0.7s linear infinite',
                          display: 'inline-block',
                        }}
                      />
                      Reviewing…
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      Review
                    </>
                  )}
                </button>
              </form>
              {enqueueError && (
                <p style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '8px', marginBottom: 0 }}>{enqueueError}</p>
              )}
            </div>
          )}

          {/* History List - Scrollable */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '12px 16px 8px' }}>
              Review History
            </div>
            
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                <span style={{
                  width: '16px', height: '16px', borderRadius: '50%',
                  border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                  animation: 'spin 0.8s linear infinite', display: 'inline-block',
                }} />
              </div>
            )}

            {!isLoading && dedupedHistory.length === 0 && (
              <div style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px' }}>
                <GitPullRequest size={28} style={{ color: 'var(--text-muted)' }} />
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No reviews yet</p>
                {role !== 'viewer' ? (
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>Enter a PR number above to get started.</p>
                ) : (
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>No reviews run yet.</p>
                )}
              </div>
            )}

            {dedupedHistory.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {dedupedHistory.map((row, idx) => {
                  const isSelected = selectedPR === row.pr_number
                  return (
                    <div
                      key={row.id}
                      onClick={() => setSelectedPR(row.pr_number)}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                        borderBottom: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        transition: 'background 150ms ease',
                        animation: 'row-in 200ms ease-out both',
                        animationDelay: `${idx * 40}ms`,
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = 'var(--bg-subtle)'
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
                          <span className="mono" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginRight: '8px', flexShrink: 0 }}>
                            #{row.pr_number}
                          </span>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.pr_title}>
                            {row.pr_title || `PR #${row.pr_number}`}
                          </span>
                        </div>
                        <VerdictBadge verdict={row.verdict} className="flex-shrink-0" style={{ transform: 'scale(0.9)' }} />
                      </div>
                      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {row.runs_count} {row.runs_count === 1 ? 'run' : 'runs'} · last {timeAgo(row.reviewed_at)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Right: Main Content (flex-1) */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedPR === null ? (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <EmptyState
                icon={GitPullRequest}
                title="Select a PR to view its review"
                description={role !== 'viewer' ? "or enter a PR number to start a new review" : undefined}
              />
            </div>
          ) : (
            <PRRuns
              projectId={projectId}
              prNumber={selectedPR}
              isOwner={isOwner}
              projectOwner={projectOwner}
              repoName={repoName}
            />
          )}
        </main>
      </div>
    </div>
  )
}
