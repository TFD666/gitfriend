import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import mermaid from 'mermaid'
import { getPublicProject } from '../api/public'
import PublicNav from '../components/ui/PublicNav'
import PublicFooter from '../components/ui/PublicFooter'

mermaid.initialize({ startOnLoad: false, theme: 'dark' })

const ARTIFACT_LABELS = {
  portfolio: 'Portfolio',
  resume_bullets: 'Resume Bullets',
  interview_prep: 'Interview Prep',
}

const ARTIFACT_ORDER = ['portfolio', 'resume_bullets', 'interview_prep']

const DIAGRAM_LABELS = {
  system_architecture: 'System Architecture',
  dependency_graph: 'Dependency Graph',
}

const SECTION_HEADING = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px',
}

function timeAgo(iso) {
  if (!iso) return null
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (d < 1) return 'today'
  if (d < 30) return `${d}d ago`
  const m = Math.floor(d / 30)
  if (m < 12) return `${m}mo ago`
  return `${Math.floor(m / 12)}y ago`
}

// ---------------------------------------------------------------------------
// Content renderers (restyled)
// ---------------------------------------------------------------------------

function PortfolioContent({ content }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div style={SECTION_HEADING}>Summary</div>
        <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text-primary)', margin: 0 }}>{content.summary}</p>
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
              <li key={i} style={{ display: 'flex', gap: '10px', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-primary)', padding: '4px 0' }}>
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
          fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', alignItems: 'flex-start',
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
            <div style={{ padding: '10px 14px 20px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
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
// Diagram panel (logic unchanged, restyled)
// ---------------------------------------------------------------------------

function PublicDiagramPanel({ diagram }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!diagram?.mermaid_source || !ref.current) return
    const id = `pub-mermaid-${diagram.diagram_type}-${Date.now()}`
    mermaid.render(id, diagram.mermaid_source)
      .then(({ svg }) => { if (ref.current) ref.current.innerHTML = svg })
      .catch(() => {})
  }, [diagram?.mermaid_source, diagram?.diagram_type])

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '20px', overflow: 'hidden',
    }}>
      <div style={{
        fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px',
      }}>
        {DIAGRAM_LABELS[diagram.diagram_type] ?? diagram.diagram_type}
      </div>
      <div ref={ref} style={{ overflowX: 'auto' }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function Skeleton({ width = '100%', height = '16px', style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-subtle)',
      ...style,
    }} />
  )
}

// ---------------------------------------------------------------------------
// Main page (logic unchanged)
// ---------------------------------------------------------------------------

export default function PublicProject() {
  const { username, slug } = useParams()
  const [activeTab, setActiveTab] = useState(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['public-project', username, slug],
    queryFn: () => getPublicProject(username, slug),
    retry: false,
    onSuccess: (d) => {
      if (activeTab === null && d.artifacts.length > 0) {
        const first = ARTIFACT_ORDER.find(t => d.artifacts.some(a => a.artifact_type === t))
        setActiveTab(first ?? d.artifacts[0].artifact_type)
      }
    },
  })

  const is404 = isError && error?.response?.status === 404

  const artifactMap = data
    ? Object.fromEntries(data.artifacts.map(a => [a.artifact_type, a]))
    : {}
  const presentTabs = ARTIFACT_ORDER.filter(t => artifactMap[t])

  const currentTab = activeTab ?? presentTabs[0] ?? null
  const currentArtifact = currentTab ? artifactMap[currentTab] : null

  // Hero: split "owner/repo" for styled heading
  const repoParts = data?.github_repo_full_name?.split('/') ?? []
  const repoOwner = repoParts[0] ?? ''
  const repoName = repoParts[1] ?? data?.name ?? ''
  const descriptionExcerpt = data?.artifacts?.find(a => a.artifact_type === 'portfolio')
    ?.content?.summary?.slice(0, 120) ?? ''

  const CONTENT_STYLE = {
    maxWidth: '760px', margin: '0 auto', padding: '0 24px',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <PublicNav username={username} />

      <div style={CONTENT_STYLE}>
        {/* Project hero */}
        <section style={{ padding: '48px 0 32px', borderBottom: '1px solid var(--border-subtle)' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Skeleton width="60%" height="36px" />
              <Skeleton width="80%" height="16px" />
              <Skeleton width="30%" height="12px" />
            </div>
          ) : data ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 12px', lineHeight: 1.2 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{repoOwner}/</span>
                  <span style={{ color: 'var(--text-primary)' }}>{repoName}</span>
                </h1>
                {descriptionExcerpt && (
                  <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px', maxWidth: '580px' }}>
                    {descriptionExcerpt}{descriptionExcerpt.length >= 120 ? '…' : ''}
                  </p>
                )}
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {data.published_at && <span>Published {timeAgo(data.published_at)}</span>}
                  {data.published_at && presentTabs.length > 0 && <span>·</span>}
                  {presentTabs.length > 0 && <span>{presentTabs.length} artifact{presentTabs.length !== 1 ? 's' : ''}</span>}
                </div>
              </div>
              <a
                href={`https://github.com/${data.github_repo_full_name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', flexShrink: 0, fontSize: '13px' }}
              >
                <svg width="14" height="14" viewBox="0 0 98 96" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
                </svg>
                View repo
              </a>
            </div>
          ) : null}
        </section>

        {/* 404 */}
        {is404 && (
          <div className="empty-state" style={{ paddingTop: '80px' }}>
            <p className="empty-state-title">Project not found</p>
            <p className="empty-state-desc">
              This project doesn't exist or isn't public.
            </p>
          </div>
        )}

        {/* Generic error */}
        {isError && !is404 && (
          <div className="empty-state" style={{ paddingTop: '80px' }}>
            <p className="empty-state-desc" style={{ color: 'var(--danger)' }}>Something went wrong. Try refreshing.</p>
          </div>
        )}

        {/* No artifacts */}
        {data && presentTabs.length === 0 && (
          <div className="empty-state" style={{ paddingTop: '80px' }}>
            <p className="empty-state-title">No portfolio content yet</p>
            <p className="empty-state-desc">The owner hasn't generated any career artifacts for this project.</p>
          </div>
        )}

        {/* Career tabs */}
        {data && presentTabs.length > 0 && (
          <section style={{ paddingTop: '32px' }}>
            {/* Tab bar — read-only, no generate button */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
              {presentTabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '10px 16px', fontSize: '13px', fontWeight: 500,
                    color: currentTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                    background: 'none', border: 'none',
                    borderBottom: currentTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: '-1px', cursor: 'pointer', outline: 'none',
                    transition: 'color 150ms ease',
                  }}
                  onMouseEnter={e => { if (currentTab !== tab) e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { if (currentTab !== tab) e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {ARTIFACT_LABELS[tab] ?? tab}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: '24px',
            }}>
              {currentArtifact && (
                <>
                  {currentTab === 'portfolio' && <PortfolioContent content={currentArtifact.content} />}
                  {currentTab === 'resume_bullets' && <ResumeBulletsContent content={currentArtifact.content} />}
                  {currentTab === 'interview_prep' && <InterviewPrepContent content={currentArtifact.content} />}
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '24px', textAlign: 'right', margin: '24px 0 0' }}>
                    Updated {new Date(currentArtifact.updated_at).toLocaleString()}
                  </p>
                </>
              )}
            </div>
          </section>
        )}

        {/* Diagrams section */}
        {data?.diagrams?.length > 0 && (
          <section style={{ padding: '40px 0', borderTop: '1px solid var(--border-subtle)', marginTop: '40px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 24px' }}>
              Architecture
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {data.diagrams.map(d => (
                <PublicDiagramPanel key={d.diagram_type} diagram={d} />
              ))}
            </div>
          </section>
        )}

        <PublicFooter username={username} />
      </div>
    </div>
  )
}
