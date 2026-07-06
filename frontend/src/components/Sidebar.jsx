import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  BarChart2,
  Users,
  Settings,
  LogOut,
  Sun,
  Moon,
  ChevronDown,
  Globe
} from 'lucide-react'
import { getMe, logout } from '../api/auth'
import { getMyInvites } from '../api/team'
import { Avatar } from './ui/Avatar'

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

// Standalone Logo component placeholder. Switch inner items for GIF logo when needed.
export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2L2 9.5v13L16 30l14-7.5v-13L16 2zm11 19.3L16 26.8 5 20.8v-9.6l11-6 11 6v9.6z" fill="currentColor" className="text-white" />
        <path d="M16 8.5L7.5 13 16 17.5 24.5 13 16 8.5z" fill="currentColor" className="text-white opacity-80" />
      </svg>
      <span className="font-bold text-[14px] text-white tracking-tight">DevKit AI</span>
    </div>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe })
  const { data: invites = [] } = useQuery({
    queryKey: ['myInvites'],
    queryFn: getMyInvites,
    refetchInterval: 60_000,
  })
  const pendingCount = invites.length
  
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function handleThemeToggle() {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
  }

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear()
      navigate('/')
    },
  })

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Projects' },
    { to: '#analytics', icon: BarChart2, label: 'Analytics' },
    { to: '/invites', icon: Users, label: 'Team', badge: pendingCount },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ]

  return (
    <aside className="w-[160px] flex-shrink-0 bg-[#050505] border-r border-white/[0.05] flex flex-col h-screen sticky top-0 overflow-hidden z-20">
      {/* Brand Header */}
      <div className="h-12 flex items-center px-4 border-b border-white/[0.05] flex-shrink-0">
        <div className="cursor-pointer" onClick={() => navigate('/dashboard')}>
          <Logo />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-5 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isPlaceholder = item.to.startsWith('#')
          const isActive = location.pathname === item.to

          const content = (
            <div className="flex items-center gap-2.5">
              <item.icon size={16} className={isActive ? 'text-white' : 'text-white/40 group-hover:text-white/70 transition-colors'} />
              <span className="text-[13px] font-medium">{item.label}</span>
            </div>
          )

          if (isPlaceholder) {
            return (
              <button
                key={item.label}
                onClick={() => alert(`${item.label} feature is coming soon!`)}
                className="w-full flex items-center justify-between h-8 px-3 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.03] transition-all duration-150 group text-left"
              >
                {content}
              </button>
            )
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center justify-between h-8 px-3 rounded-lg transition-all duration-150 group ${
                  isActive
                    ? 'bg-white/[0.07] border border-white/[0.08] text-white'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/[0.03] border border-transparent'
                }`
              }
            >
              {content}
              {item.badge > 0 && (
                <span className="bg-white/10 text-white text-[9.5px] font-bold px-2 py-0.5 rounded-full border border-white/5">
                  {item.badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* User Section (Profile Card) */}
      <div className="p-3 border-t border-white/[0.05] flex-shrink-0 relative" ref={dropdownRef}>
        {me ? (
          <>
            {/* User Profile Card */}
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-white/[0.03] active:scale-[0.98] transition-all duration-150 text-left group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar
                  src={`https://github.com/${me.github_username}.png?size=64`}
                  alt={me.github_username}
                  size="sm"
                  className="ring-1 ring-white/10 group-hover:ring-white/20 transition-all flex-shrink-0"
                />
                <div className="min-w-0 leading-tight">
                  <div className="text-[12px] font-semibold text-white truncate">
                    {me.github_username}
                  </div>
                  <div className="text-[10px] text-white/35 truncate mt-0.5">GitHub user</div>
                </div>
              </div>
              <ChevronDown size={12} className={`text-white/35 flex-shrink-0 transition-all duration-150 ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute bottom-16 left-2 right-2 bg-[#0A0A0A] border border-white/[0.08] rounded-xl shadow-2xl p-2 z-30 flex flex-col space-y-0.5 backdrop-blur-md"
                >
                  <button
                    onClick={() => {
                      setDropdownOpen(false)
                      navigate(`/u/${me.github_username}`)
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors text-left"
                  >
                    <Globe size={14} />
                    <span>Public Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setDropdownOpen(false)
                      navigate('/settings')
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors text-left"
                  >
                    <Settings size={14} />
                    <span>Settings</span>
                  </button>

                  <button
                    onClick={handleThemeToggle}
                    className="flex items-center justify-between px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      {theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}
                      <span>Theme: {theme === 'light' ? 'Light' : 'Dark'}</span>
                    </div>
                    <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider bg-white/[0.05] px-1.5 py-0.5 rounded">
                      Toggle
                    </div>
                  </button>

                  <div className="h-[1px] bg-white/[0.06] my-1" />

                  <button
                    onClick={() => {
                      setDropdownOpen(false)
                      logoutMutation.mutate()
                    }}
                    disabled={logoutMutation.isPending}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors text-left disabled:opacity-40"
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <div className="h-10" />
        )}
      </div>
    </aside>
  )
}
