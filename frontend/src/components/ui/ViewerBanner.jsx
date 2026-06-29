export default function ViewerBanner() {
  return (
    <div
      style={{
        height: '32px',
        background: 'var(--warning-subtle)',
        borderBottom: '1px solid var(--warning)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '16px',
        fontSize: '12px',
        color: 'var(--warning)',
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      ⚠ Read-only — viewer access. Contact the project owner to request editor access.
    </div>
  )
}
