import React from 'react'

export function Button({
  className = '',
  children,
  variant = 'primary',
  size = 'default',
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]'
  
  const variants = {
    primary: 'bg-white text-black hover:bg-white/90 shadow-md font-semibold',
    secondary: 'bg-white/[0.04] border border-white/[0.08] text-white hover:bg-white/[0.08] hover:border-white/[0.12]',
    outline: 'bg-transparent border border-white/[0.08] text-white hover:bg-white/[0.05] hover:border-white/[0.12]',
    ghost: 'text-white/65 hover:text-white hover:bg-white/[0.05]',
    danger: 'bg-rose-500 text-white hover:bg-rose-600 shadow-md shadow-rose-950/20'
  }

  const sizes = {
    default: 'h-10 px-5 py-2 text-sm rounded-full',
    sm: 'h-8 px-3.5 py-1.5 text-xs rounded-full',
    lg: 'h-12 px-6 py-3 text-base rounded-full',
    icon: 'h-10 w-10 rounded-full'
  }

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
