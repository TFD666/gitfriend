import Sidebar from './Sidebar'

export default function AppShell({ children }) {
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  )
}
