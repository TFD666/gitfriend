import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ToastProvider } from './components/ui/Toast'
import AppShell from './components/AppShell'
import Auth from './pages/Auth'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import MentorChat from './pages/MentorChat'
import CareerMode from './pages/CareerMode'
import PublicProfile from './pages/PublicProfile'
import PublicProject from './pages/PublicProject'
import RepoHealth from './pages/RepoHealth'
import ArchDiagram from './pages/ArchDiagram'
import TeamSettings from './pages/TeamSettings'
import InvitesInbox from './pages/InvitesInbox'
import PRReview from './pages/PRReview'
import SettingsPage from './pages/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function AuthenticatedLayout({ children }) {
  return <AppShell>{children}</AppShell>
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={{ display: 'contents' }}
      >
        <Routes location={location}>
            {/* Landing / auth — no shell */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth/callback" element={<Auth />} />

            {/* Authenticated routes — inside AppShell */}
            <Route path="/dashboard" element={<AuthenticatedLayout><Dashboard /></AuthenticatedLayout>} />
            <Route path="/mentor/:projectId" element={<AuthenticatedLayout><MentorChat /></AuthenticatedLayout>} />
            <Route path="/career/:projectId" element={<AuthenticatedLayout><CareerMode /></AuthenticatedLayout>} />
            <Route path="/health/:projectId" element={<AuthenticatedLayout><RepoHealth /></AuthenticatedLayout>} />
            <Route path="/diagram/:projectId" element={<AuthenticatedLayout><ArchDiagram /></AuthenticatedLayout>} />
            <Route path="/pr-review/:projectId" element={<AuthenticatedLayout><PRReview /></AuthenticatedLayout>} />
            <Route path="/team/:projectId" element={<AuthenticatedLayout><TeamSettings /></AuthenticatedLayout>} />
            <Route path="/invites" element={<AuthenticatedLayout><InvitesInbox /></AuthenticatedLayout>} />
            <Route path="/settings" element={<AuthenticatedLayout><SettingsPage /></AuthenticatedLayout>} />

            {/* Public routes — no shell */}
            <Route path="/u/:username" element={<PublicProfile />} />
            <Route path="/u/:username/:slug" element={<PublicProject />} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
