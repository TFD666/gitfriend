import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, MessageSquare, ArrowUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import client, { API_BASE } from '../api/client'
import { summarizeFile, summarizePR } from '../api/summarize'
import { useProjectRole } from '../hooks/useProjectRole'
import { getProject } from '../api/projects'
import { getMe } from '../api/auth'

const SUGGESTIONS = [
  'How does authentication work?',
  'What does the main entry point do?',
  'List all API endpoints',
]

// ---------------------------------------------------------------------------
// Citation chips — message-level, clickable, expand inline (logic unchanged)
// ---------------------------------------------------------------------------

function CitationChips({ citations, projectId }) {
  const [activeIdx, setActiveIdx] = useState(null)
  const [summaries, setSummaries] = useState({})

  if (!citations?.length) return null

  async function handleChipClick(citation, idx) {
    if (activeIdx === idx) { setActiveIdx(null); return }
    setActiveIdx(idx)
    const key = citation.file_path
    if (summaries[key]?.text) return
    setSummaries(prev => ({ ...prev, [key]: { loading: true, text: null, error: null } }))
    try {
      const result = await summarizeFile(projectId, citation.file_path)
      setSummaries(prev => ({ ...prev, [key]: { loading: false, text: result.summary, error: null } }))
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      setSummaries(prev => ({ ...prev, [key]: { loading: false, text: null, error: msg } }))
    }
  }

  const activeCitation = activeIdx !== null ? citations[activeIdx] : null
  const activeState = activeCitation ? summaries[activeCitation.file_path] : null

  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {citations.map((c, i) => (
          <button
            key={i}
            onClick={() => handleChipClick(c, i)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 8px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${activeIdx === i ? 'var(--accent)' : 'var(--accent-dim)'}`,
              background: activeIdx === i ? 'var(--accent)' : 'var(--accent-subtle)',
              color: activeIdx === i ? 'var(--text-inverse)' : 'var(--accent)',
              fontFamily: 'Geist Mono, monospace', fontSize: '11px',
              cursor: 'pointer', transition: 'all 150ms ease',
              animation: 'chip-in 200ms ease-out both',
              animationDelay: `${i * 50}ms`,
            }}
          >
            ↳ {c.file_path}
          </button>
        ))}
      </div>
      {activeCitation && (
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)', paddingTop: '4px' }}>
          {activeState?.loading && (
            <span style={{ color: 'var(--text-muted)' }}>Summarizing…</span>
          )}
          {activeState?.error && (
            <span style={{ color: 'var(--danger)' }}>Failed: {activeState.error}</span>
          )}
          {activeState?.text && activeState.text}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PR summary panel — moved to context panel, accepts disabled prop
// ---------------------------------------------------------------------------

function PRSummaryPanel({ projectId, disabled }) {
  const [prNumber, setPrNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const num = parseInt(prNumber, 10)
    if (!num) return
    setLoading(true); setError(null); setSummary(null)
    try {
      const result = await summarizePR(projectId, num)
      setSummary(result.summary)
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
        PR Review
      </div>
      <form onSubmit={handleSubmit}>
        <input
          type="number"
          min="1"
          placeholder="PR number"
          value={prNumber}
          onChange={e => setPrNumber(e.target.value)}
          disabled={disabled || loading}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', padding: '8px 12px',
            fontSize: '13px', color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
            outline: 'none', opacity: disabled ? 0.5 : 1,
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'var(--border-focus)'
            e.target.style.boxShadow = '0 0 0 2px rgba(124,106,245,0.15)'
          }}
          onBlur={e => {
            e.target.style.borderColor = 'var(--border)'
            e.target.style.boxShadow = 'none'
          }}
        />
        <button
          type="submit"
          disabled={disabled || !prNumber || loading}
          className="btn-primary"
          style={{ width: '100%', marginTop: '8px', padding: '7px 14px', fontSize: '13px', cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Summarizing…' : 'Summarize'}
        </button>
      </form>
      {error && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger)', lineHeight: 1.4 }}>
          Failed: {error}
        </div>
      )}
      {summary && (
        <div style={{
          marginTop: '10px', maxHeight: '200px', overflowY: 'auto',
          fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5,
          padding: '8px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}>
          {summary}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Streaming indicator — pulsing dots (replaces old TypingIndicator)
// ---------------------------------------------------------------------------

function StreamingDots() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start', gap: '10px' }}>
      {/* DK avatar */}
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
        background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Geist Mono, monospace', fontSize: '11px', color: 'var(--accent)',
      }}>
        DK
      </div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: '18px 18px 18px 4px', padding: '14px 16px',
        display: 'flex', gap: '5px', alignItems: 'center',
      }}>
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            style={{
              display: 'block', width: '6px', height: '6px', borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'dot-pulse 1s ease-in-out infinite',
              animationDelay: `${delay}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Context panel — citations sidebar (session-wide unique files)
// ---------------------------------------------------------------------------

function ContextPanel({ projectId, repoName, messages, canWrite }) {
  const [fileSummaries, setFileSummaries] = useState({})
  const [activeFile, setActiveFile] = useState(null)

  // Derive unique cited file paths from all messages in session
  const citedFiles = [...new Set(
    messages
      .filter(m => m.role === 'assistant' && m.citations?.length)
      .flatMap(m => m.citations.map(c => c.file_path))
  )]

  async function handleFileClick(filePath) {
    if (activeFile === filePath) { setActiveFile(null); return }
    setActiveFile(filePath)
    if (fileSummaries[filePath]?.text) return
    setFileSummaries(prev => ({ ...prev, [filePath]: { loading: true, text: null, error: null } }))
    try {
      const result = await summarizeFile(projectId, filePath)
      setFileSummaries(prev => ({ ...prev, [filePath]: { loading: false, text: result.summary, error: null } }))
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      setFileSummaries(prev => ({ ...prev, [filePath]: { loading: false, text: null, error: msg } }))
    }
  }

  return (
    <aside style={{
      width: '280px', flexShrink: 0,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Section 1 — Project info */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {repoName}
          </span>
          <span className="badge badge-success" style={{ fontSize: '10px' }}>Ready</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Mentor Chat
        </div>
      </div>

      {/* Section 2 — Citations this session */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0, maxHeight: '280px', overflowY: 'auto',
      }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
          Files Referenced
        </div>
        {citedFiles.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            No files cited yet — ask a question to get started
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {citedFiles.map(fp => (
              <div key={fp}>
                <button
                  onClick={() => handleFileClick(fp)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'Geist Mono, monospace', fontSize: '12px',
                    color: activeFile === fp ? 'var(--accent-hover)' : 'var(--accent)',
                    transition: 'color 150ms ease',
                  }}
                >
                  ↳ {fp}
                </button>
                {activeFile === fp && (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5, paddingBottom: '6px' }}>
                    {fileSummaries[fp]?.loading && <span style={{ color: 'var(--text-muted)' }}>Summarizing…</span>}
                    {fileSummaries[fp]?.error && <span style={{ color: 'var(--danger)' }}>{fileSummaries[fp].error}</span>}
                    {fileSummaries[fp]?.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3 — PR Summary panel */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PRSummaryPanel projectId={projectId} disabled={!canWrite} />
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Keyframe styles (injected once)
// ---------------------------------------------------------------------------

const ANIM_STYLES = `
@keyframes msg-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes chip-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dot-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50%       { opacity: 1;   transform: scale(1.2); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
`

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MentorChat() {
  const { projectId } = useParams()
  const role = useProjectRole(projectId)
  const canWrite = role === 'owner' || role === 'editor'

  const { data: project } = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId) })
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe })

  // "owner/repo" → "repo"
  const repoName = project?.github_repo_full_name?.split('/')[1] ?? projectId
  const userInitial = me?.github_username?.[0]?.toUpperCase() ?? '?'

  const [messages, setMessages] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Load persisted chat history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const { data } = await client.get(`/api/v1/chat/${projectId}/history`)
        setMessages(data.map(m => ({ role: m.role, content: m.content, citations: m.citations ?? [] })))
      } catch {
        // Non-fatal — start with empty history if fetch fails
      } finally {
        setHistoryLoading(false)
      }
    }
    loadHistory()
  }, [projectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  // Auto-grow textarea
  function handleTextareaChange(e) {
    setQuestion(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  async function submit(text) {
    const q = (text ?? question).trim()
    if (!q || isStreaming) return

    setQuestion('')
    if (inputRef.current) { inputRef.current.style.height = 'auto' }
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setIsStreaming(true)

    try {
      const resp = await fetch(`${API_BASE}/api/v1/chat/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: q }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.detail ?? resp.statusText}`, citations: [] }])
        return
      }

      setMessages(prev => [...prev, { role: 'assistant', content: '', citations: [] }])

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamDone = false

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let parsed
          try { parsed = JSON.parse(line.slice(6)) } catch { continue }

          if (parsed.done) { streamDone = true; break }

          if (parsed.error) {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              return [...prev.slice(0, -1), { ...last, content: `Error: ${parsed.error}` }]
            })
            streamDone = true; break
          }

          if (parsed.citations) {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              return [...prev.slice(0, -1), { ...last, citations: parsed.citations }]
            })
            continue
          }

          if (parsed.delta !== undefined) {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              return [...prev.slice(0, -1), { ...last, content: last.content + parsed.delta }]
            })
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, citations: [] }])
    } finally {
      setIsStreaming(false)
      inputRef.current?.focus()
    }
  }

  const showStreamingDots =
    isStreaming && messages.length > 0 && messages[messages.length - 1].content === ''

  return (
    <>
      <style>{ANIM_STYLES}</style>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>

        {/* ── Context panel ──────────────────────────────────────── */}
        <ContextPanel projectId={projectId} repoName={repoName} messages={messages} canWrite={canWrite} />

        {/* ── Chat panel ─────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Sticky header */}
          <header style={{
            height: '56px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(8px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Link
                to="/dashboard"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <ArrowLeft size={14} />
                Dashboard
              </Link>
              <span style={{ color: 'var(--border)', fontSize: '12px' }}>/</span>
              <span className="mono" style={{ fontSize: '13px' }}>{repoName}</span>
            </div>
            {role === 'viewer' && (
              <span className="badge badge-neutral">Read only</span>
            )}
          </header>

          {/* Scrollable message list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {historyLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '64px' }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  border: '2px solid var(--accent)', borderTopColor: 'transparent',
                  animation: 'spin 0.7s linear infinite',
                }} />
              </div>
            )}

            {/* Empty state */}
            {!historyLoading && messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px', paddingBottom: '48px' }}>
                <MessageSquare size={32} style={{ color: 'var(--text-muted)' }} />
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Ask anything about your codebase
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  {canWrite ? 'Try one of these to get started:' : 'No messages yet — read-only access'}
                </div>
                {canWrite && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '400px' }}>
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => submit(s)}
                        style={{
                          textAlign: 'left', padding: '8px 14px',
                          background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                          borderRadius: '20px', fontSize: '13px', color: 'var(--text-secondary)',
                          cursor: 'pointer', transition: 'border-color 150ms ease, color 150ms ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-focus)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-start', gap: '10px',
                  animation: 'msg-in 200ms ease-out both',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                  background: msg.role === 'user' ? 'var(--accent-dim)' : 'var(--accent-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Geist Mono, monospace', fontSize: '11px',
                  color: msg.role === 'user' ? 'var(--text-inverse)' : 'var(--accent)',
                }}>
                  {msg.role === 'user' ? userInitial : 'DK'}
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth: msg.role === 'user' ? '70%' : '80%',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  padding: msg.role === 'user' ? '12px 16px' : '16px',
                  fontSize: '14px', lineHeight: 1.6,
                  color: msg.role === 'user' ? 'var(--text-inverse)' : 'var(--text-primary)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.content}
                  {msg.role === 'assistant' && msg.citations?.length > 0 && (
                    <CitationChips citations={msg.citations} projectId={projectId} />
                  )}
                </div>
              </div>
            ))}

            {showStreamingDots && <StreamingDots />}
            <div ref={bottomRef} />
          </div>

          {/* Pinned input bar */}
          {canWrite ? (
            <div style={{
              flexShrink: 0, padding: '16px 32px',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--bg-base)',
            }}>
              <div style={{
                position: 'relative',
                background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                borderRadius: '12px', display: 'flex', alignItems: 'flex-end',
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
              }}
                onFocusCapture={e => {
                  e.currentTarget.style.borderColor = 'var(--border-focus)'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(124,106,245,0.15)'
                }}
                onBlurCapture={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <textarea
                  ref={inputRef}
                  value={question}
                  onChange={handleTextareaChange}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
                  }}
                  placeholder="Ask anything about your codebase…"
                  disabled={isStreaming}
                  rows={1}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)',
                    resize: 'none', lineHeight: 1.5, minHeight: '44px', maxHeight: '120px',
                    fontFamily: 'Geist, system-ui, sans-serif',
                  }}
                />
                <button
                  onClick={() => submit()}
                  disabled={!question.trim() || isStreaming}
                  style={{
                    margin: '6px', padding: '6px 8px', flexShrink: 0,
                    background: question.trim() && !isStreaming ? 'var(--accent)' : 'var(--bg-overlay)',
                    border: 'none', borderRadius: '8px', cursor: question.trim() && !isStreaming ? 'pointer' : 'not-allowed',
                    opacity: question.trim() && !isStreaming ? 1 : 0.4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 150ms ease, opacity 150ms ease',
                  }}
                >
                  <ArrowUp size={16} color="var(--text-primary)" />
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              flexShrink: 0, padding: '10px 32px',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--warning-subtle)',
              fontSize: '12px', color: 'var(--warning)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              ⚠ Read-only — viewer access. Contact the project owner to request editor access.
            </div>
          )}

        </div>
      </div>
    </>
  )
}
