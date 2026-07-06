import React from 'react'

export function Avatar({ src, alt, fallback, className = '', size = 'md' }) {
  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-12 h-12'
  }
  return (
    <div className={`relative flex shrink-0 overflow-hidden rounded-full border border-white/[0.08] ${sizes[size]} ${className}`}>
      {src ? (
        <img src={src} alt={alt} className="aspect-square h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-white/[0.05] text-xs font-semibold text-white/70">
          {fallback || alt?.substring(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  )
}
