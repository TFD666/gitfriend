import { Link } from 'react-router-dom'

export default function PublicFooter({ username }) {
  return (
    <footer style={{
      padding: '24px 0',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Built with DevKit AI</span>
      {username && (
        <Link
          to={`/u/${username}`}
          style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}
          onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
          onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
        >
          ← Back to @{username}'s profile
        </Link>
      )}
    </footer>
  )
}
