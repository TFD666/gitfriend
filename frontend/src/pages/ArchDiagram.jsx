import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import mermaid from 'mermaid'
import { GitBranch, Sparkles, RefreshCw, Clock, Copy, AlertCircle } from 'lucide-react'
import { getDiagrams, generateDiagram } from '../api/diagrams'
import { useProjectRole } from '../hooks/useProjectRole'
import ViewerBanner from '../components/ui/ViewerBanner'

// Mermaid initialization — unchanged from original
mermaid.initialize({ startOnLoad: false, theme: 'default' })

const COOLDOWN_MINUTES = 10

// ---------------------------------------------------------------------------
// Utilities (logic unchanged, timeAgo is display-only addition)
// ---------------------------------------------------------------------------

function minutesAgo(isoString) {
  if (!isoString) return null
  return (Date.now() - new Date(isoString)) / 60_000
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString()
}

function timeAgo(iso) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Page-scoped styles (grid breakpoint + panel animations)
// ---------------------------------------------------------------------------

const PAGE_STYLES = `
  @keyframes panel-in-left {
    from { opacity: 0; transform: translateX(-12px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes panel-in-right {
    from { opacity: 0; transform: translateX(12px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes content-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .arch-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  @media (max-width: 900px) {
    .arch-grid { grid-template-columns: 1fr; }
  }
`

// ---------------------------------------------------------------------------
// Mermaid renderer — logic unchanged, wrapper restyled
// ---------------------------------------------------------------------------

function MermaidDiagram({ source, diagramType }) {
  const ref = useRef(null)
  const [renderError, setRenderError] = useState(null)

  useEffect(() => {
    if (!source || !ref.current) return
    setRenderError(null)
    const id = `mermaid-${diagramType}-${Date.now()}`
    mermaid.render(id, source)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg
      })
      .catch((err) => {
        setRenderError(String(err))
      })
  }, [source, diagramType])

  if (renderError) {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--danger)', marginBottom: '8px' }}>
          Diagram render error — source may be malformed.
        </p>
        <pre style={{
          fontSize: '11px', color: 'var(--text-muted)', textAlign: 'left',
          overflowX: 'auto', maxHeight: '128px', margin: 0,
          background: 'var(--bg-base)', padding: '8px', borderRadius: 'var(--radius-sm)',
        }}>{source}</pre>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      style={{ overflowX: 'auto' }}
      // SVG fills panel width, height auto
    />
  )
}

// ---------------------------------------------------------------------------
// Panel meta config
// ---------------------------------------------------------------------------

const PANEL_META = {
  system_architecture: {
    title: 'System Architecture',
    description: 'Layers: frontend, backend, DB, external APIs — inferred from indexed files.',
  },
  dependency_graph: {
    title: 'Dependency Graph',
    description: 'Internal file/module import relationships extracted from chunk content.',
  },
}

// ---------------------------------------------------------------------------
// Single diagram panel
// ---------------------------------------------------------------------------

function DiagramPanel({ diagramType, artifact, status, lastAt, canGenerate, panelIndex }) {
  const { projectId } = useParams()
  const queryClient = useQueryClient()
  const [copyDone, setCopyDone] = useState(false)
  const [genError, setGenError] = useState(null)

  const { title } = PANEL_META[diagramType]

  const elapsed = minutesAgo(lastAt)
  const onCooldown = !!(elapsed !== null && elapsed < COOLDOWN_MINUTES && status !== 'generating')
  const remainingMinutes = onCooldown ? Math.ceil(COOLDOWN_MINUTES - elapsed) : 0

  const isGenerating = status === 'generating'
  const isFailed = status === 'failed'

  const mutation = useMutation({
    mutationFn: () => generateDiagram(projectId, diagramType),
    onSuccess: () => {
      setGenError(null)
      queryClient.invalidateQueries({ queryKey: ['diagrams', projectId] })
    },
    onError: (err) => {
      setGenError(err?.response?.data?.detail ?? 'Failed to queue generation.')
    },
  })

  function handleCopy() {
    if (!artifact?.mermaid_source) return
    navigator.clipboard.writeText(artifact.mermaid_source).then(() => {
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 2000)
    })
  }

  const generateDisabled = isGenerating || onCooldown || mutation.isPending

  // Hover border: only when diagram exists
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${hovered && artifact ? 'var(--border-focus)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        transition: 'border-color 150ms ease',
        animation: panelIndex === 0
          ? 'panel-in-left 300ms ease-out 100ms both'
          : 'panel-in-right 300ms ease-out 100ms both',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Panel header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
      }}>
        {/* Left: icon + title + meta */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
          <GitBranch
            size={16}
            style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {title}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              AI-generated{lastAt ? ` · last run ${timeAgo(lastAt)}` : ''}
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* Copy source — available to all roles when diagram exists */}
          {artifact && (
            <button
              onClick={handleCopy}
              className="btn-ghost"
              style={{
                padding: '4px 10px', fontSize: '12px',
                color: copyDone ? 'var(--success)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <Copy size={12} />
              {copyDone ? 'Copied ✓' : 'Copy'}
            </button>
          )}

          {/* Generate / Regenerate / Cooldown / Generating — owner/editor only */}
          {canGenerate && (
            isGenerating || mutation.isPending ? (
              <button disabled className="btn-secondary" style={{
                padding: '4px 10px', fontSize: '12px',
                display: 'flex', alignItems: 'center', gap: '4px',
                opacity: 0.6, cursor: 'not-allowed',
              }}>
                <span style={{
                  width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0,
                  border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                  animation: 'spin 0.8s linear infinite', display: 'inline-block',
                }} />
                Generating…
              </button>
            ) : onCooldown ? (
              <button disabled className="btn-secondary" style={{
                padding: '4px 10px', fontSize: '12px',
                display: 'flex', alignItems: 'center', gap: '4px',
                opacity: 0.5, cursor: 'not-allowed',
              }}>
                <Clock size={12} />
                Wait {remainingMinutes}m
              </button>
            ) : artifact ? (
              <button
                onClick={() => mutation.mutate()}
                disabled={generateDisabled}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} />
                Regenerate
              </button>
            ) : (
              <button
                onClick={() => mutation.mutate()}
                disabled={generateDisabled}
                className="btn-primary"
                style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Sparkles size={12} />
                Generate
              </button>
            )
          )}
        </div>
      </div>

      {/* Error from mutation */}
      {genError && (
        <div style={{ padding: '6px 20px', fontSize: '12px', color: 'var(--danger)', borderBottom: '1px solid var(--border-subtle)' }}>
          {genError}
        </div>
      )}

      {/* Diagram content area */}
      <div style={{
        padding: '20px', minHeight: '320px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flex: 1,
      }}>
        {/* Generating skeleton */}
        {(isGenerating || mutation.isPending) && !artifact && (
          <div style={{ width: '100%', animation: 'content-fade-in 300ms ease-out both' }}>
            <div style={{
              width: '100%', height: '280px',
              background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)',
              animation: 'pulse-skeleton 1.5s ease-in-out infinite',
              marginBottom: '10px',
            }} />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
              Generating diagram…
            </p>
          </div>
        )}

        {/* Failed state */}
        {isFailed && !isGenerating && !artifact && (
          <div className="empty-state" style={{ padding: '24px', animation: 'content-fade-in 300ms ease-out both' }}>
            <AlertCircle size={24} style={{ color: 'var(--danger)' }} />
            <p className="empty-state-title" style={{ margin: 0, fontSize: '14px' }}>Generation failed</p>
            {canGenerate && (
              <button
                onClick={() => mutation.mutate()}
                disabled={generateDisabled}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: '13px', color: 'var(--danger)', textDecoration: 'underline',
                  marginTop: '4px',
                }}
              >
                Try again →
              </button>
            )}
          </div>
        )}

        {/* Never generated */}
        {!isGenerating && !isFailed && !artifact && !mutation.isPending && (
          <div className="empty-state" style={{ padding: '24px', animation: 'content-fade-in 300ms ease-out both' }}>
            <GitBranch size={32} className="empty-state-icon" />
            <p className="empty-state-title" style={{ margin: 0 }}>
              {canGenerate ? 'No diagram yet' : 'No diagram generated yet'}
            </p>
            <p className="empty-state-desc" style={{ margin: 0 }}>
              {canGenerate
                ? `Generate to see your ${diagramType === 'system_architecture' ? 'system architecture' : 'dependency graph'}`
                : 'Contact the project owner to generate diagrams.'}
            </p>
            {canGenerate && (
              <button
                onClick={() => mutation.mutate()}
                disabled={generateDisabled}
                className="btn-primary"
                style={{ marginTop: '4px', fontSize: '12px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={12} />
                Generate →
              </button>
            )}
          </div>
        )}

        {/* Diagram rendered */}
        {!isGenerating && artifact && (
          <div
            key={artifact.updated_at ?? artifact.generated_at}
            style={{
              background: 'var(--bg-base)', borderRadius: 'var(--radius-md)',
              padding: '16px', width: '100%',
              maxHeight: '480px', overflowY: 'auto',
              animation: 'content-fade-in 400ms ease-out both',
            }}
          >
            <MermaidDiagram source={artifact.mermaid_source} diagramType={diagramType} />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ArchDiagram() {
  const { projectId } = useParams()
  const role = useProjectRole(projectId)
  const canGenerate = role === 'owner' || role === 'editor'

  const { data, isLoading } = useQuery({
    queryKey: ['diagrams', projectId],
    queryFn: () => getDiagrams(projectId),
    refetchInterval: (query) => {
      const d = query.state.data
      if (!d) return false
      const generating =
        d.diagram_system_status === 'generating' ||
        d.diagram_dependency_status === 'generating'
      return generating ? 3000 : false
    },
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <style>{PAGE_STYLES}</style>

      {/* Sticky header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          maxWidth: '1100px', margin: '0 auto', padding: '12px 32px',
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
              Architecture
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.2 }}>
              AI-generated system diagrams from your indexed codebase
            </div>
          </div>
        </div>
      </header>

      {/* Viewer banner */}
      {role === 'viewer' && <ViewerBanner />}

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 32px' }}>
        {/* Initial loading */}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <span style={{
              width: '20px', height: '20px', borderRadius: '50%',
              border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.8s linear infinite', display: 'inline-block',
            }} />
          </div>
        )}

        {/* Two-panel grid (shown even while loading — panels show empty state) */}
        {!isLoading && (
          <div className="arch-grid">
            <DiagramPanel
              diagramType="system_architecture"
              artifact={data?.system_architecture ?? null}
              status={data?.diagram_system_status ?? null}
              lastAt={data?.last_diagram_system_at ?? null}
              canGenerate={canGenerate}
              panelIndex={0}
            />
            <DiagramPanel
              diagramType="dependency_graph"
              artifact={data?.dependency_graph ?? null}
              status={data?.diagram_dependency_status ?? null}
              lastAt={data?.last_diagram_dependency_at ?? null}
              canGenerate={canGenerate}
              panelIndex={1}
            />
          </div>
        )}
      </main>
    </div>
  )
}
