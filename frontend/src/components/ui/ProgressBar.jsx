import { useEffect, useState } from 'react'

export default function ProgressBar({ loading }) {
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (loading) {
      setVisible(true)
      setWidth(0)
      const t = setTimeout(() => setWidth(70), 50)
      return () => clearTimeout(t)
    } else {
      setWidth(100)
      const t = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(t)
    }
  }, [loading])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        zIndex: 9999,
        background: 'var(--bg-subtle)',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          background: 'var(--accent)',
          transition: loading ? 'width 600ms ease' : 'width 200ms ease',
        }}
      />
    </div>
  )
}
