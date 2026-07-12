import React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = React.forwardRef(({ className = '', sideOffset = 8, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={`z-50 px-2.5 py-1 text-[11px] font-medium bg-[#0A0A0C] border border-white/[0.08] text-white rounded-md shadow-md whitespace-nowrap pointer-events-none select-none ${className}`}
      {...props}
    >
      {children}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
))

TooltipContent.displayName = TooltipPrimitive.Content.displayName
