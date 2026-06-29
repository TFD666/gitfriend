import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProject } from '../api/projects'
import { getMe } from '../api/auth'
import {
  getTeamRoster,
  inviteMember,
  removeMember,
  updateSharing,
} from '../api/team'
import { useProjectRole } from '../hooks/useProjectRole'
import ViewerBanner from '../components/ui/ViewerBanner'
import Badge from '../components/ui/Badge'
import { Users, UserMinus, ShieldAlert } from 'lucide-react'

function RoleBadge({ role }) {
  const configs = {
    owner:  { variant: 'accent',  label: 'owner' },
    editor: { variant: 'info',    label: 'editor' },
    viewer: { variant: 'neutral', label: 'viewer' },
  }
  const { variant, label } = configs[role] ?? { variant: 'neutral', label: role }
  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}

function StatusDot({ status }) {
  const color = status === 'active' ? 'var(--success)' : 'var(--warning)'
  return (
    <span
      style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        marginRight: '8px',
        flexShrink: 0,
      }}
      title={status}
    />
  )
}

function SharingToggles({ project, isOwner }) {
  const queryClient = useQueryClient()
  const [flags, setFlags] = useState({
    mentor_chat_shared: project.mentor_chat_shared,
    career_mode_shared: project.career_mode_shared,
    repo_health_shared: project.repo_health_shared,
    diagrams_shared: project.diagrams_shared ?? false,
    pr_review_shared: project.pr_review_shared ?? false,
  })
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const mutation = useMutation({
    mutationFn: (f) => updateSharing(project.id, f),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      setSaved(true)
      setSaveError(null)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err) => setSaveError(err.response?.data?.detail ?? err.message),
  })

  function toggle(key) {
    if (!isOwner) return
    const next = { ...flags, [key]: !flags[key] }
    setFlags(next)
    mutation.mutate(next)
  }

  const labels = {
    mentor_chat_shared: 'Mentor Chat',
    career_mode_shared: 'Career Mode',
    repo_health_shared: 'Repo Health',
    diagrams_shared:    'Diagrams',
    pr_review_shared:   'PR Review',
  }

  return (
    <div>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Feature sharing</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
        Control which features team members can access. Members also need the right role for write actions.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Object.entries(labels).map(([key, label]) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
            <button
              onClick={() => toggle(key)}
              disabled={!isOwner || mutation.isPending}
              style={{
                position: 'relative',
                width: '38px',
                height: '20px',
                borderRadius: '999px',
                background: flags[key] ? 'var(--accent)' : 'var(--bg-base)',
                border: '1px solid var(--border)',
                cursor: (!isOwner || mutation.isPending) ? 'not-allowed' : 'pointer',
                outline: 'none',
                transition: 'background 200ms ease, opacity 200ms ease',
                opacity: (!isOwner) ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: '2px',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: 'var(--text-primary)',
                  transform: flags[key] ? 'translateX(18px)' : 'translateX(0)',
                  transition: 'transform 200ms ease',
                }}
              />
            </button>
          </div>
        ))}
      </div>
      {saved && <p style={{ fontSize: '12px', color: 'var(--success)', marginTop: '12px', marginBottom: 0 }}>Saved changes successfully</p>}
      {saveError && <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '12px', marginBottom: 0 }}>{saveError}</p>}
      {!isOwner && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', marginBottom: 0 }}>Only the project owner can change sharing settings.</p>
      )}
    </div>
  )
}

function InviteForm({ projectId }) {
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('viewer')
  const [error, setError] = useState(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => inviteMember(projectId, username.trim(), role),
    onSuccess: () => {
      setUsername('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['team', projectId] })
    },
    onError: (err) => setError(err.response?.data?.detail ?? err.message),
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim()) return
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          placeholder="GitHub username"
          value={username}
          onChange={e => { setUsername(e.target.value); setError(null) }}
          className="input"
          style={{ flex: 1, height: '36px', padding: '6px 12px' }}
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="input"
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0 12px',
            fontSize: '13px',
            color: 'var(--text-primary)',
            outline: 'none',
            width: '110px',
            height: '36px',
          }}
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button
          type="submit"
          disabled={!username.trim() || mutation.isPending}
          className="btn-primary"
          style={{ padding: '0 16px', height: '36px', fontSize: '13px', flexShrink: 0 }}
        >
          {mutation.isPending ? 'Inviting…' : 'Invite'}
        </button>
      </div>
      {error && <p style={{ fontSize: '12px', color: 'var(--danger)', margin: '4px 0 0 0' }}>{error}</p>}
    </form>
  )
}

function MemberRow({ member, isOwner, currentUserId, projectId }) {
  const queryClient = useQueryClient()
  const isSelf = member.user.id === currentUserId
  const canRemove = isOwner || isSelf

  const mutation = useMutation({
    mutationFn: () => removeMember(projectId, member.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', projectId] }),
  })

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background 150ms ease',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <StatusDot status={member.status} />
        <span className="mono" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.user.github_username}
        </span>
        {isSelf && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(you)</span>}
        <RoleBadge role={member.role} />
        {member.status === 'pending' && (
          <span style={{ fontSize: '11px', color: 'var(--warning)', fontStyle: 'italic' }}>invite pending</span>
        )}
      </div>
      {canRemove && (
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn-ghost"
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            color: 'var(--danger)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <UserMinus size={13} />
          {isSelf && !isOwner ? 'Leave' : 'Remove'}
        </button>
      )}
    </li>
  )
}

export default function TeamSettings() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const role = useProjectRole(projectId)
  const isViewer = role === 'viewer'

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe })
  const { data: project, isLoading: projLoading, error: projError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
  })
  const { data: roster, isLoading: rosterLoading, error: rosterError } = useQuery({
    queryKey: ['team', projectId],
    queryFn: () => getTeamRoster(projectId),
    enabled: !!projectId,
  })

  const isLoading = projLoading || rosterLoading
  const error = projError || rosterError

  const isOwner = me && project ? String(project.user_id) === String(me.id) : false

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          border: '2px solid var(--border)',
          borderTopColor: 'var(--accent)',
          animation: 'spin 0.8s linear infinite',
          display: 'inline-block',
        }} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '12px' }}>
        <ShieldAlert size={40} style={{ color: 'var(--danger)' }} />
        <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>Failed to load team data</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '-8px' }}>
          {error.response?.data?.detail ?? error.message}
        </p>
        <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      {/* Viewer banner */}
      {isViewer && <ViewerBanner />}

      {/* Page Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          maxWidth: '720px', margin: '0 auto', padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ fontSize: '13px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            ← Dashboard
          </button>
          <span style={{ color: 'var(--border)', fontSize: '12px' }}>/</span>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Team
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.2 }}>
              Manage collaborators and sharing settings
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: '720px', width: '100%', margin: '0 auto', padding: '24px 24px 48px' }}>
        {/* Members Roster Card */}
        <div
          className="card"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Users size={16} style={{ color: 'var(--text-secondary)' }} />
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Team Members</h2>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 -20px', borderTop: '1px solid var(--border-subtle)' }}>
            {/* Owner row */}
            <li
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block', marginRight: '8px' }} />
                <span className="mono" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {roster?.owner?.github_username}
                </span>
                {isOwner && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(you)</span>}
                <RoleBadge role="owner" />
              </div>
            </li>

            {/* Team members list */}
            {roster?.members?.length === 0 ? (
              <li style={{ padding: '20px 16px', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                No team members yet.
              </li>
            ) : (
              roster?.members?.map(m => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isOwner={isOwner}
                  currentUserId={me?.id}
                  projectId={projectId}
                />
              ))
            )}
          </ul>

          {/* Invite form — owner only */}
          {isOwner && (
            <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>Invite Collaborator</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>Send an invitation link to a collaborator by GitHub username.</p>
              <InviteForm projectId={projectId} />
            </div>
          )}
        </div>

        {/* Sharing toggles */}
        {project && (
          <div
            className="card"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
            }}
          >
            <SharingToggles project={project} isOwner={isOwner} />
          </div>
        )}
      </main>
    </div>
  )
}
