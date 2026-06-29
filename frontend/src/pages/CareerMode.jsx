import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Sparkles, RefreshCw, Copy, ExternalLink } from 'lucide-react'
import { listArtifacts, generateArtifact } from '../api/career'
import { getProject, publishProject } from '../api/projects'
import { getMe } from '../api/auth'
import { useProjectRole } from '../hooks/useProjectRole'
import ViewerBanner from '../components/ui/ViewerBanner'

const TABS = ['portfolio', 'resume_bullets', 'interview_prep']

const TAB_LABELS = {
  portfolio: 'Portfolio',
  resume_bullets: 'Resume Bullets',
  interview_prep: 'Interview Prep',
}

const SECTION_HEADING = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px',
}

// ---------------------------------------------------------------------------
// Clipboard formatting (logic unchanged)
// ---------------------------------------------------------------------------

function formatForClipboard(type, content) {
  if (!content) return ''
  if (type === 'portfolio') {
    return [
      content.summary ?? '',
      '',
      'Tech Stack: ' + (content.tech_stack ?? []).join(', '),
      '',
      'Highlights:',
      ...(content.highlights ?? []).map(h => `• ${h}`),
    ].join('\n')
  }
  if (type === 'resume_bullets') {
    return (content.bullets ?? []).map(b => `• ${b}`).join('\n')
  }
  if (type === 'interview_prep') {
    return (content.questions ?? [])
      .map(q => {
        const refs = q.file_refs?.length ? `\nFiles: ${q.file_refs.join(', ')}` : ''
        return `Q: ${q.question}\nA: ${q.answer}${refs}`
      })
      .join('\n\n')
  }
  return JSON.stringify(content, null, 2)
}

// ---------------------------------------------------------------------------
// Content renderers — restyled, structure unchanged
// ---------------------------------------------------------------------------

function PortfolioContent({ content }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div style={SECTION_HEADING}>Summary</div>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text-primary)', margin: 0 }}>
          {content.summary}
        </p>
      </div>

      {content.tech_stack?.length > 0 && (
        <div>
          <div style={SECTION_HEADING}>Tech Stack</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {content.tech_stack.map((t, i) => (
              <span key={i} className="badge badge-accent">{t}</span>
            ))}
          </div>
        </div>
      )}

      {content.highlights?.length > 0 && (
        <div>
          <div style={SECTION_HEADING}>Highlights</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {content.highlights.map((h, i) => (
              <li key={i} style={{
                display: 'flex', gap: '10px', fontSize: '14px',
                lineHeight: 1.6, color: 'var(--text-primary)', padding: '4px 0',
              }}>
                <span style={{ color: 'var(--accent)', flexShrink: 0 }}>▸</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ResumeBulletsContent({ content }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {(content.bullets ?? []).map((b, i, arr) => (
        <li key={i} style={{
          display: 'flex', gap: '12px', padding: '8px 0',
          borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)',
          alignItems: 'flex-start',
        }}>
          <span style={{ color: 'var(--accent)', fontSize: '12px', flexShrink: 0, marginTop: '3px' }}>▸</span>
          {b}
        </li>
      ))}
    </ul>
  )
}

function InterviewPrepContent({ content }) {
  const [open, setOpen] = useState(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {(content.questions ?? []).map((q, i) => (
        <div key={i}>
          <div style={{ borderLeft: '3px solid var(--accent)' }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                background: 'var(--bg-subtle)', border: 'none',
                fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)',
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', outline: 'none',
              }}
            >
              <span>{q.question}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: '12px', flexShrink: 0, fontSize: '11px' }}>
                {open === i ? '▲' : '▼'}
              </span>
            </button>
          </div>
          {open === i && (
            <div style={{
              padding: '10px 14px 20px',
              fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6,
            }}>
              {q.answer}
              {q.file_refs?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '10px' }}>
                  {q.file_refs.map((f, j) => (
                    <span key={j} className="mono">{f}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CareerMode() {
  const { projectId } = useParams()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('portfolio')
  const [copied, setCopied] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)

  const role = useProjectRole(projectId)
  const canGenerate = role === 'owner' || role === 'editor'
  const canPublish = role === 'owner'

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
  })

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    staleTime: Infinity,
  })

  const { data: artifacts = [], isLoading } = useQuery({
    queryKey: ['career', projectId],
    queryFn: () => listArtifacts(projectId),
  })

  const byType = Object.fromEntries(artifacts.map(a => [a.artifact_type, a]))

  const generateMutation = useMutation({
    mutationFn: (type) => generateArtifact(projectId, type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['career', projectId] }),
  })

  const publishMutation = useMutation({
    mutationFn: (is_public) => publishProject(projectId, is_public),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  const currentArtifact = byType[activeTab]
  const isGenerating = generateMutation.isPending && generateMutation.variables === activeTab
  const generateError =
    generateMutation.isError && generateMutation.variables === activeTab
      ? (generateMutation.error?.response?.data?.detail ?? generateMutation.error?.message)
      : null

  function handleCopy() {
    const text = formatForClipboard(activeTab, currentArtifact?.content)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleCopyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    })
  }

  const isPublic = publishMutation.data?.is_public ?? project?.is_public ?? false
  const currentSlug = publishMutation.data?.slug ?? project?.slug ?? null
  const publicUrl = publishMutation.data?.public_url
    ?? (isPublic && currentSlug && me?.github_username
        ? `${window.location.origin}/u/${me.github_username}/${currentSlug}`
        : null)

  const repoName = project?.github_repo_full_name?.split('/')[1] ?? projectId

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Sticky page header */}
      <header style={{
        height: '56px', flexShrink: 0,
        display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(8px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          maxWidth: '800px', width: '100%', margin: '0 auto',
          padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link
              to="/dashboard"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              ← Dashboard
            </Link>
            <span style={{ color: 'var(--border)', fontSize: '12px' }}>/</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Career Mode</span>
          </div>
          {isPublic && publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', textDecoration: 'none' }}
            >
              View public page
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </header>

      {/* Viewer banner */}
      {role === 'viewer' && <ViewerBanner />}

      {/* Main content */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 32px' }}>

        {/* Publish panel — owner only */}
        {canPublish && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Globe size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: 1 }}>Public page</span>

              {/* Toggle */}
              <button
                disabled={publishMutation.isPending}
                onClick={() => publishMutation.mutate(!isPublic)}
                role="switch"
                aria-checked={isPublic}
                style={{
                  position: 'relative', display: 'inline-flex', height: '22px', width: '40px',
                  flexShrink: 0, cursor: publishMutation.isPending ? 'not-allowed' : 'pointer',
                  borderRadius: '999px', border: 'none', padding: 0,
                  background: isPublic ? 'var(--accent)' : 'var(--bg-overlay)',
                  transition: 'background 200ms ease',
                  opacity: publishMutation.isPending ? 0.5 : 1, outline: 'none',
                }}
              >
                <span style={{
                  position: 'absolute', top: '3px',
                  left: isPublic ? '21px' : '3px',
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: 'var(--text-primary)',
                  transition: 'left 200ms ease',
                }} />
              </button>

              {/* Public URL + copy */}
              {isPublic && publicUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--accent)', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {publicUrl.replace(window.location.origin, '')}
                  </span>
                  <button
                    onClick={() => handleCopyUrl(publicUrl)}
                    className="btn-ghost"
                    style={{ padding: '2px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Copy size={12} />
                    {urlCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>

            {isPublic && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginLeft: '28px' }}>
                Anyone with this link can view your portfolio
              </p>
            )}

            {publishMutation.isError && (
              <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px' }}>
                {publishMutation.error?.response?.data?.detail ?? 'Failed to update — try again.'}
              </p>
            )}
          </div>
        )}

        {/* Tab bar + Generate button */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', flex: 1 }}>
            {TABS.map(tab => (
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
                {TAB_LABELS[tab]}
                {byType[tab] && (
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: 'var(--success)', display: 'inline-block',
                  }} />
                )}
              </button>
            ))}
          </div>

          {/* Generate / Regenerate button */}
          {canGenerate && (
            <div style={{ paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {currentArtifact && !isGenerating && (
                <button
                  onClick={handleCopy}
                  className="btn-ghost"
                  style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Copy size={12} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
              <button
                disabled={isGenerating}
                onClick={() => generateMutation.mutate(activeTab)}
                className={currentArtifact ? 'btn-secondary' : 'btn-primary'}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px' }}
              >
                {isGenerating ? (
                  <>
                    <span style={{
                      width: '12px', height: '12px', borderRadius: '50%',
                      border: '2px solid currentColor', borderTopColor: 'transparent',
                      animation: 'spin 0.7s linear infinite', display: 'inline-block',
                    }} />
                    Generating…
                  </>
                ) : currentArtifact ? (
                  <><RefreshCw size={13} />Regenerate</>
                ) : (
                  <><Sparkles size={13} />Generate</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Artifact content area */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '24px',
          minHeight: '200px',
        }}>
          {/* Generating */}
          {isGenerating && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: '12px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                border: '2px solid var(--accent)', borderTopColor: 'transparent',
                animation: 'spin 0.7s linear infinite',
              }} />
              <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500, margin: 0 }}>Generating with Gemini…</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>This can take up to 60 seconds</p>
            </div>
          )}

          {/* Error */}
          {!isGenerating && generateError && (
            <div style={{
              padding: '12px 16px', background: 'var(--danger-subtle)',
              border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)',
              fontSize: '13px', color: 'var(--danger)',
            }}>
              <strong>Generation failed: </strong>{generateError}
            </div>
          )}

          {/* Loading skeleton */}
          {!isGenerating && isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
              {[80, 60, 90, 50].map((w, i) => (
                <div key={i} style={{
                  height: '14px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)', width: `${w}%`,
                  animation: 'pulse-skeleton 1.5s ease-in-out infinite',
                  animationDelay: `${i * 150}ms`,
                }} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isGenerating && !isLoading && !currentArtifact && !generateError && (
            <div className="empty-state">
              <Sparkles size={32} className="empty-state-icon" />
              <p className="empty-state-title" style={{ margin: 0 }}>
                No {TAB_LABELS[activeTab]} generated yet
              </p>
              {canGenerate && (
                <p className="empty-state-desc" style={{ margin: 0 }}>Click Generate to create one</p>
              )}
            </div>
          )}

          {/* Content */}
          {!isGenerating && currentArtifact && (
            <>
              {activeTab === 'portfolio' && <PortfolioContent content={currentArtifact.content} />}
              {activeTab === 'resume_bullets' && <ResumeBulletsContent content={currentArtifact.content} />}
              {activeTab === 'interview_prep' && <InterviewPrepContent content={currentArtifact.content} />}

              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '24px', textAlign: 'right', margin: '24px 0 0' }}>
                Generated {new Date(currentArtifact.updated_at).toLocaleString()} · {currentArtifact.model_version}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
