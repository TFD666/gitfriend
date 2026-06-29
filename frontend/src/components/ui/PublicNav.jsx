import { Link } from 'react-router-dom'
import logo from '../../assets/logo.png'

export default function PublicNav({ username }) {
  return (
    <nav style={{
      height: '48px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(9,9,11,0.9)',
      backdropFilter: 'blur(8px)',
      position: 'sticky', top: 0, zIndex: 50,
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        maxWidth: '760px', width: '100%', margin: '0 auto',
        padding: '0 24px', display: 'flex', alignItems: 'center',
      }}>
        <Link
          to={username ? `/u/${username}` : '/'}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
        >
          <img
            src={logo}
            alt="DevKit AI"
            style={{ width: '24px', height: '24px', borderRadius: '6px', mixBlendMode: 'screen' }}
          />
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>DevKit AI</span>
        </Link>
      </div>
    </nav>
  )
}
