import Sidebar, { SidebarProvider } from './Sidebar'

export default function AppShell({ children }) {
  return (
    <SidebarProvider>
      <div style={{ display: 'flex', height: '100vh', background: 'transparent', overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
