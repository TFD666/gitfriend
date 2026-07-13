import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { ChevronDown, Check } from "lucide-react"

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value
export const SelectGroup = SelectPrimitive.Group

export const SelectTrigger = React.forwardRef(({ className = "", children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={`inline-flex h-8 items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white placeholder:text-white/40 hover:bg-white/[0.06] hover:border-white/[0.13] focus:outline-none focus:border-white/[0.2] disabled:cursor-not-allowed disabled:opacity-50 transition-all ${className}`}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-3 w-3 opacity-50 ml-1.5 flex-shrink-0" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

export const SelectContent = React.forwardRef(({ className = "", children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={`relative z-50 min-w-[8rem] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0A0A0C] text-white shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ${
        position === "popper"
          ? "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1"
          : ""
      } ${className}`}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={`p-1 ${
          position === "popper"
            ? "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
            : ""
        }`}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

export const SelectItem = React.forwardRef(({ className = "", children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={`relative flex w-full cursor-default select-none items-center rounded-lg py-1.5 pl-7 pr-2.5 text-xs font-medium text-white/70 outline-none hover:bg-white/[0.05] hover:text-white focus:bg-white/[0.05] focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-all ${className}`}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3 w-3 text-white" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName
