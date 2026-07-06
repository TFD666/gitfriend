import React from 'react'

export function Separator({
  orientation = 'horizontal',
  className = '',
  ...props
}) {
  return (
    <div
      className={`bg-white/[0.08] shrink-0 ${
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'w-[1px] h-full'
      } ${className}`}
      {...props}
    />
  )
}
