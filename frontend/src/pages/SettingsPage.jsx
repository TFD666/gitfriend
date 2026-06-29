import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <Settings size={32} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
      <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
        Settings
      </h1>
      <p style={{ fontSize: '13px' }}>Settings coming soon.</p>
    </div>
  )
}
