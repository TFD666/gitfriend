import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal
export const DropdownMenuSub = DropdownMenuPrimitive.Sub
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export const DropdownMenuSubTrigger = React.forwardRef(({ className = "", inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={`flex cursor-default select-none items-center rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none hover:bg-white/[0.05] focus:bg-white/[0.05] data-[state=open]:bg-white/[0.05] ${
      inset ? "pl-8" : ""
    } ${className}`}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-3 w-3 opacity-60" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

export const DropdownMenuSubContent = React.forwardRef(({ className = "", ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={`z-50 min-w-[8rem] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0A0A0C] p-1 text-white shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ${className}`}
    {...props}
  >
    {/* Sub content items */}
  </DropdownMenuPrimitive.SubContent>
))
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

export const DropdownMenuContent = React.forwardRef(({ className = "", sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={`z-50 min-w-[8rem] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0A0A0C] p-1 text-white shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ${className}`}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

export const DropdownMenuItem = React.forwardRef(({ className = "", inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={`relative flex cursor-default select-none items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/70 outline-none hover:bg-white/[0.05] hover:text-white focus:bg-white/[0.05] focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-all ${
      inset ? "pl-8" : ""
    } ${className}`}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

export const DropdownMenuCheckboxItem = React.forwardRef(({ className = "", children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={`relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-xs font-medium text-white/70 outline-none hover:bg-white/[0.05] hover:text-white focus:bg-white/[0.05] focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-all ${className}`}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-3 w-3 text-white" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName

export const DropdownMenuRadioItem = React.forwardRef(({ className = "", children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={`relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-xs font-medium text-white/70 outline-none hover:bg-white/[0.05] hover:text-white focus:bg-white/[0.05] focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-all ${className}`}
    {...props}
  >
    <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current text-white" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

export const DropdownMenuLabel = React.forwardRef(({ className = "", inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={`px-2.5 py-1.5 text-xs font-semibold text-white/40 ${inset ? "pl-8" : ""} ${className}`}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

export const DropdownMenuSeparator = React.forwardRef(({ className = "", ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={`-mx-1 my-1 h-px bg-white/[0.06] ${className}`}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName
