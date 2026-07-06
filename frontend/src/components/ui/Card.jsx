import React from 'react'

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`bg-[#0A0A0A] border border-white/[0.08] rounded-2xl shadow-2xl backdrop-blur-md ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className = '', children, ...props }) {
  return (
    <div className={`flex flex-col space-y-1.5 p-6 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className = '', children, ...props }) {
  return (
    <h3 className={`text-lg font-semibold leading-none tracking-tight text-white ${className}`} {...props}>
      {children}
    </h3>
  )
}

export function CardDescription({ className = '', children, ...props }) {
  return (
    <p className={`text-sm text-white/60 ${className}`} {...props}>
      {children}
    </p>
  )
}

export function CardContent({ className = '', children, ...props }) {
  return (
    <div className={`p-6 pt-0 ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className = '', children, ...props }) {
  return (
    <div className={`flex items-center p-6 pt-0 ${className}`} {...props}>
      {children}
    </div>
  )
}
