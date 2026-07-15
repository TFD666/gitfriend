import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect, createContext, useContext } from 'react'
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
  ChevronLeft,
  ChevronRight,
  Globe
} from 'lucide-react'
import { getMe, logout } from '../api/auth'
import { getMyInvites } from '../api/team'
import { Avatar } from './ui/Avatar'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/Tooltip'

// ── Sidebar Context & Provider ───────────────────────────────────────────────

export const SidebarContext = createContext(null)

export function SidebarProvider({ children }) {
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem('sidebar_open')
    return saved !== null ? saved === 'true' : true
  })

  useEffect(() => {
    localStorage.setItem('sidebar_open', String(open))
  }, [open])

  const toggleSidebar = () => setOpen(prev => !prev)

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggleSidebar }}>
      <TooltipProvider delayDuration={0} disableHoverableContent={true}>
        {children}
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Nav Items ────────────────────────────────────────────────────────────────

function SidebarNavItem({ item, open, isActive }) {
  const content = (
    <div className={`flex items-center ${open ? 'gap-2.5' : 'justify-center w-full'}`}>
      <item.icon size={16} className={isActive ? 'text-white' : 'text-white/40 group-hover:text-white/70 transition-colors'} />
      <AnimatePresence initial={false}>
        {open && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15 }}
            className="text-[13px] font-medium truncate"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )

  const navLink = (
    <NavLink
      to={item.to}
      className={
        `flex items-center ${open ? 'justify-between px-3' : 'justify-center px-0 w-8 h-8 mx-auto'} h-8 rounded-lg transition-all duration-200 group relative ${
          isActive
            ? 'bg-white/[0.07] border border-white/[0.08] text-white'
            : 'text-white/40 hover:text-white/80 hover:bg-white/[0.03] border border-transparent'
        }`
      }
    >
      {content}
      {open && item.badge > 0 && (
        <span className="bg-white/10 text-white text-[9.5px] font-bold px-2 py-0.5 rounded-full border border-white/5 flex-shrink-0">
          {item.badge}
        </span>
      )}
    </NavLink>
  )

  if (!open) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {navLink}
        </TooltipTrigger>
        <TooltipContent side="right">
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return navLink
}

function SidebarNavPlaceholder({ item, open }) {
  const content = (
    <div className={`flex items-center ${open ? 'gap-2.5' : 'justify-center w-full'}`}>
      <item.icon size={16} className="text-white/40 group-hover:text-white/70 transition-colors" />
      <AnimatePresence initial={false}>
        {open && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15 }}
            className="text-[13px] font-medium truncate"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )

  const buttonElement = (
    <button
      onClick={() => alert(`${item.label} feature is coming soon!`)}
      className={`flex items-center ${open ? 'justify-between px-3' : 'justify-center px-0 w-8 h-8 mx-auto'} h-8 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.03] transition-all duration-200 group text-left`}
    >
      {content}
    </button>
  )

  if (!open) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {buttonElement}
        </TooltipTrigger>
        <TooltipContent side="right">
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return buttonElement
}

// ── Sidebar Component ────────────────────────────────────────────────────────

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { open, toggleSidebar } = useSidebar()
  
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
    <aside
      className="flex-shrink-0 bg-black border-r border-white/[0.04] flex flex-col h-screen sticky top-0 overflow-visible z-20"
      style={{
        width: open ? '160px' : '56px',
        transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Brand Header */}
      <div 
        className="h-[52px] flex items-center border-b border-white/[0.02] flex-shrink-0 relative overflow-visible"
      >
        <button
          onClick={toggleSidebar}
          aria-label={open ? 'Collapse Sidebar' : 'Expand Sidebar'}
          className={`text-white/40 hover:text-white hover:bg-white/[0.05] rounded-lg transition-all duration-200 active:scale-95 flex-shrink-0 absolute top-1/2 -translate-y-1/2 z-30 ${
            open
              ? 'p-1.5 left-3'
              : 'p-1 left-[46px] bg-[#050505] border border-white/[0.08] hover:bg-white/[0.12] shadow-lg rounded-full'
          }`}
        >
          {open ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        <div 
          className={`flex items-center min-w-0 cursor-pointer transition-all duration-200 ${
            open ? 'pl-10 gap-2 justify-start' : 'pl-0 w-full justify-center'
          }`} 
          onClick={() => navigate('/dashboard')}
        >
          {/* Logo icon */}
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0 text-white">
            <path d="M16 2L2 9.5v13L16 30l14-7.5v-13L16 2zm11 19.3L16 26.8 5 20.8v-9.6l11-6 11 6v9.6z" fill="currentColor" />
            <path d="M16 8.5L7.5 13 16 17.5 24.5 13 16 8.5z" fill="currentColor" className="opacity-80" />
          </svg>
          {open && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className="font-bold text-[13.5px] text-white tracking-tight truncate"
            >
              DevKit AI
            </motion.span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-5 ${open ? 'px-2' : 'px-1'} space-y-1 overflow-y-auto`}>
        {navItems.map((item) => {
          const isPlaceholder = item.to.startsWith('#')
          const isActive = location.pathname === item.to

          if (isPlaceholder) {
            return (
              <SidebarNavPlaceholder
                key={item.label}
                item={item}
                open={open}
              />
            )
          }

          return (
            <SidebarNavItem
              key={item.to}
              item={item}
              open={open}
              isActive={isActive}
            />
          )
        })}
      </nav>

      {/* User Section (Profile Card) */}
      <div className={`border-t border-white/[0.02] flex-shrink-0 relative ${open ? 'p-3' : 'py-3 px-1'}`} ref={dropdownRef}>
        {me ? (
          <>
            {/* User Profile Card */}
            {open ? (
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
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-8 h-8 rounded-lg hover:bg-white/[0.03] active:scale-[0.98] transition-all duration-150 flex items-center justify-center mx-auto p-0 group"
                  >
                    <Avatar
                      src={`https://github.com/${me.github_username}.png?size=64`}
                      alt={me.github_username}
                      size="sm"
                      className="ring-1 ring-white/10 group-hover:ring-white/20 transition-all flex-shrink-0"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {me.github_username}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Dropdown Menu */}
            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className={`absolute z-30 flex flex-col space-y-0.5 bg-[#0A0A0A] border border-white/[0.08] rounded-xl shadow-2xl p-2 backdrop-blur-md ${
                    open ? 'bottom-16 left-2 right-2' : 'bottom-2 left-[60px] w-48'
                  }`}
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
                      {open ? (
                        <span>Theme: {theme === 'light' ? 'Light' : 'Dark'}</span>
                      ) : (
                        <span>Theme</span>
                      )}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider bg-white/[0.05] px-1.5 py-0.5 rounded flex-shrink-0">
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
          <div className={open ? 'h-10' : 'h-8'} />
        )}
      </div>
    </aside>
  )
}
