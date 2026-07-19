import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProject } from '../api/projects'
import { getMe } from '../api/auth'
import {
  getTeamRoster,
  inviteMember,
  removeMember,
  updateMemberRole,
  updateSharing,
} from '../api/team'
import { useProjectRole } from '../hooks/useProjectRole'
import ViewerBanner from '../components/ui/ViewerBanner'
import Badge from '../components/ui/Badge'
import { Users, Trash2, ShieldAlert, Plus, Send, UserCheck } from 'lucide-react'

function RoleBadge({ role }) {
  const configs = {
    owner:  { variant: 'accent',  label: 'Owner' },
    editor: { variant: 'info',    label: 'Editor' },
    viewer: { variant: 'neutral', label: 'Viewer' },
  }
  const { variant, label } = configs[role] ?? { variant: 'neutral', label: role }
  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}

function UserAvatar({ username }) {
  const initial = (username || '?')[0].toUpperCase()
  return (
    <div
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: '#18181b',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '13px',
        fontWeight: 600,
        color: '#ffffff',
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
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

  const features = [
    {
      key: 'mentor_chat_shared',
      label: 'Mentor Chat',
      desc: 'Allow access to AI mentor conversations',
    },
    {
      key: 'career_mode_shared',
      label: 'Career Mode',
      desc: 'Allow access to career guidance features',
    },
    {
      key: 'repo_health_shared',
      label: 'Repo Health',
      desc: 'Allow access to repository health insights',
    },
    {
      key: 'diagrams_shared',
      label: 'Diagrams',
      desc: 'Allow access to diagrams and visualizations',
    },
    {
      key: 'pr_review_shared',
      label: 'PR Review',
      desc: 'Allow access to PR review features',
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>Feature Sharing</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Control which features team members can access and their permissions.
          </p>
        </div>
        <button
          onClick={() => alert('Role management options coming soon!')}
          style={{
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          <UserCheck size={14} />
          Manage roles
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {features.map(({ key, label, desc }) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, width: '120px' }}>{label}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{desc}</span>
            </div>
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
                flexShrink: 0,
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
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          placeholder="Enter GitHub username"
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
          style={{
            background: '#ffffff',
            color: '#000000',
            fontWeight: 600,
            fontSize: '13px',
            padding: '0 16px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            cursor: (!username.trim() || mutation.isPending) ? 'not-allowed' : 'pointer',
            opacity: (!username.trim() || mutation.isPending) ? 0.6 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
            transition: 'background 150ms ease, opacity 150ms ease',
          }}
        >
          <Send size={13} />
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

  const removeMutation = useMutation({
    mutationFn: () => removeMember(projectId, member.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', projectId] }),
  })

  const roleMutation = useMutation({
    mutationFn: (newRole) => updateMemberRole(projectId, member.id, newRole),
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <UserAvatar username={member.user.github_username} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {member.user.github_username}
            </span>
            {isSelf && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(you)</span>}
            <RoleBadge role={member.role} />
            {member.status === 'pending' && (
              <span style={{ fontSize: '11px', color: 'var(--warning)', fontStyle: 'italic' }}>invite pending</span>
            )}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>
            {member.user.github_username}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <select
          value={member.role}
          disabled={!isOwner || isSelf || roleMutation.isPending}
          onChange={(e) => roleMutation.mutate(e.target.value)}
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '4px 10px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            outline: 'none',
            cursor: (!isOwner || isSelf || roleMutation.isPending) ? 'default' : 'pointer',
            opacity: (!isOwner || isSelf) ? 0.7 : 1,
          }}
        >
          <option value="owner">Owner</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>

        {canRemove && (
          <button
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="btn-ghost"
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            <Trash2 size={13} />
            {isSelf && !isOwner ? 'Leave' : 'Remove'}
          </button>
        )}
      </div>
    </li>
  )
}

export default function TeamSettings() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const role = useProjectRole(projectId)
  const isViewer = role === 'viewer'
  const [showInviteForm, setShowInviteForm] = useState(false)

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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Users size={16} style={{ color: 'var(--text-secondary)' }} />
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Team Members</h2>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                Manage who has access to this project
              </p>
            </div>

            {isOwner && (
              <button
                onClick={() => setShowInviteForm(prev => !prev)}
                style={{
                  background: '#ffffff',
                  color: '#000000',
                  fontWeight: 600,
                  fontSize: '13px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                }}
              >
                <Plus size={14} />
                Invite collaborator
              </button>
            )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <UserAvatar username={roster?.owner?.github_username} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {roster?.owner?.github_username}
                    </span>
                    {isOwner && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(you)</span>}
                    <RoleBadge role="owner" />
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>
                    {roster?.owner?.github_username}
                  </span>
                </div>
              </div>
              <select
                disabled
                value="owner"
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '4px 10px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  opacity: 0.7,
                  cursor: 'not-allowed',
                }}
              >
                <option value="owner">Owner</option>
              </select>
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

          {/* Invite form — owner only, collapsible */}
          {isOwner && showInviteForm && (
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
