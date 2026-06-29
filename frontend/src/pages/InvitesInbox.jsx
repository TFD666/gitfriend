import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyInvites, acceptInvite, declineInvite } from '../api/team'
import Badge from '../components/ui/Badge'
import { Mail, Check, X, ShieldAlert } from 'lucide-react'

function RoleBadge({ role }) {
  const configs = {
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

function InviteRow({ invite }) {
  const queryClient = useQueryClient()

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(invite.team_member_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myInvites'] }),
  })

  const declineMutation = useMutation({
    mutationFn: () => declineInvite(invite.team_member_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myInvites'] }),
  })

  const isPending = acceptMutation.isPending || declineMutation.isPending
  const error = acceptMutation.error?.response?.data?.detail
    ?? declineMutation.error?.response?.data?.detail

  const formattedDate = new Date(invite.invited_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <li
      className="card"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        animation: 'row-in 200ms ease-out both',
      }}
    >
      <div style={{ display: 'flex', items: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {invite.github_repo_full_name}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <RoleBadge role={invite.role} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Invited on {formattedDate}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', items: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={() => declineMutation.mutate()}
            disabled={isPending}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <X size={13} />
            Decline
          </button>
          <button
            onClick={() => acceptMutation.mutate()}
            disabled={isPending}
            className="btn-primary"
            style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            {acceptMutation.isPending ? (
              <>
                <span style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  border: '2px solid currentColor', borderTopColor: 'transparent',
                  animation: 'spin 0.7s linear infinite', display: 'inline-block',
                }} />
                Accepting…
              </>
            ) : (
              <>
                <Check size={13} />
                Accept
              </>
            )}
          </button>
        </div>
      </div>
      {error && <p style={{ fontSize: '12px', color: 'var(--danger)', margin: 0 }}>{error}</p>}
    </li>
  )
}

export default function InvitesInbox() {
  const navigate = useNavigate()

  const { data: invites = [], isLoading, error } = useQuery({
    queryKey: ['myInvites'],
    queryFn: getMyInvites,
    refetchInterval: 30_000,
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      {/* Page Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          maxWidth: '640px', margin: '0 auto', padding: '12px 24px',
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
              Pending Invites
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.2 }}>
              Manage collaboration invitations
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: '640px', width: '100%', margin: '0 auto', padding: '24px 24px 48px' }}>
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <span style={{
              width: '20px', height: '20px', borderRadius: '50%',
              border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.8s linear infinite', display: 'inline-block',
            }} />
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: '12px' }}>
            <ShieldAlert size={40} style={{ color: 'var(--danger)' }} />
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>Failed to load invites</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '-8px' }}>
              {error.response?.data?.detail ?? error.message}
            </p>
          </div>
        )}

        {!isLoading && !error && invites.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <Mail size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No pending invites</p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
              You don't have any incoming repository invitations at the moment.
            </p>
          </div>
        )}

        {!isLoading && !error && invites.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {invites.map(invite => (
              <InviteRow key={invite.team_member_id} invite={invite} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
