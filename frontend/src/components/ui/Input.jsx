import React from 'react'

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/[0.18] focus:ring-1 focus:ring-white/[0.18] transition-all duration-200 ${className}`}
      {...props}
    />
  )
}
