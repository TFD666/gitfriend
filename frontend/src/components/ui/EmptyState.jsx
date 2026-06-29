export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={32} />
        </div>
      )}
      <p className="empty-state-title" style={{ color: 'var(--text-primary)' }}>{title}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  )
}
