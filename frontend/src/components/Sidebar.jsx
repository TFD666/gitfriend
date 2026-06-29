import { NavLink, useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Bell,
  Globe,
  Settings,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react'
import { getMe, logout } from '../api/auth'
import { getMyInvites } from '../api/team'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Projects' },
]

function getStoredTheme() {
  return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem('theme', theme)
}

export default function Sidebar() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe })
  const { data: invites = [] } = useQuery({
    queryKey: ['myInvites'],
    queryFn: getMyInvites,
    refetchInterval: 60_000,
  })
  const pendingCount = invites.length

  const [theme, setTheme] = useState(getStoredTheme)

  function handleThemeChange(next) {
    setTheme(next)
    applyTheme(next)
  }

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear()
      navigate('/')
    },
  })

  return (
    <aside
      style={{
        width: '220px',
        flexShrink: 0,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={logo} alt="DevKit AI" style={{ height: '36px', width: '36px', borderRadius: '10px', mixBlendMode: 'screen' }} />
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>DevKit AI</span>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {/* Top-level pages */}
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              height: '36px',
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              fontWeight: 500,
              textDecoration: 'none',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              background: isActive ? 'var(--accent-subtle)' : 'transparent',
              transition: 'background 150ms ease, color 150ms ease',
            })}
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}

        {/* Tools group */}
        <div style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          padding: '16px 12px 4px',
        }}>
          Tools
        </div>

        {/* Invites */}
        <NavLink
          to="/invites"
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '36px',
            padding: '0 12px',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            fontWeight: 500,
            textDecoration: 'none',
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            background: isActive ? 'var(--accent-subtle)' : 'transparent',
            transition: 'background 150ms ease, color 150ms ease',
          })}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={15} />
            Invites
          </span>
          {pendingCount > 0 && (
            <span className="badge badge-accent" style={{ fontSize: '10px', padding: '1px 5px' }}>
              {pendingCount}
            </span>
          )}
        </NavLink>

        {/* Public Profile */}
        {me && (
          <NavLink
            to={`/u/${me.github_username}`}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              height: '36px',
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              fontWeight: 500,
              textDecoration: 'none',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              background: isActive ? 'var(--accent-subtle)' : 'transparent',
              transition: 'background 150ms ease, color 150ms ease',
            })}
          >
            <Globe size={15} />
            Public Profile
          </NavLink>
        )}
      </nav>

      {/* User section */}
      <div
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '12px',
          flexShrink: 0,
        }}
      >
        {me ? (
          <>
            {/* Avatar + username */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <img
                src={`https://github.com/${me.github_username}.png?size=64`}
                alt={me.github_username}
                width="32"
                height="32"
                style={{
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {me.github_username}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GitHub user</div>
              </div>
            </div>

            {/* Theme toggle */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Theme</div>
              <div
                style={{
                  display: 'flex',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '2px',
                  gap: '2px',
                }}
              >
                {(['light', 'dark']).map(t => (
                  <button
                    key={t}
                    id={`theme-toggle-${t}`}
                    onClick={() => handleThemeChange(t)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '4px 6px',
                      fontSize: '11px',
                      fontWeight: 500,
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: 'calc(var(--radius-md) - 2px)',
                      transition: 'background 150ms ease, color 150ms ease',
                      background: theme === t ? 'var(--accent-subtle)' : 'transparent',
                      color: theme === t ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {t === 'light' ? <Sun size={11} /> : <Moon size={11} />}
                    {t === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions row */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className="btn-ghost"
                style={{ flex: 1, padding: '4px 8px', fontSize: '11px', justifyContent: 'center' }}
                onClick={() => navigate('/settings')}
              >
                <Settings size={12} /> Settings
              </button>
              <button
                id="sign-out-btn"
                className="btn-ghost"
                style={{ flex: 1, padding: '4px 8px', fontSize: '11px', justifyContent: 'center' }}
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '' }}
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          </>
        ) : (
          <div style={{ height: '80px' }} />
        )}
      </div>
    </aside>
  )
}
