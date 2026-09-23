"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Adaptação direta do primitivo: o Base UI 1.7 não responde a pointer
 * (thumb fixo) neste projeto, então a interação é o <input type="range">
 * nativo esticado sobre o track — clique, arraste e teclado nativos.
 */
function Slider({
  className,
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "value" | "onChange" | "min" | "max" | "step"> & {
  value: number[]
  onValueChange?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
}) {
  const current = value[0] ?? min
  const percent = max > min ? ((current - min) / (max - min)) * 100 : 0

  return (
    <div
      className={cn("relative flex w-full touch-none select-none items-center py-2", className)}
      data-slot="slider"
    >
      <div
        className="relative h-2 w-full grow overflow-hidden rounded-full bg-input/90"
        data-slot="slider-track"
      >
        <div
          className="h-full bg-primary"
          data-slot="slider-range"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className="pointer-events-none absolute h-4 w-6 -translate-x-1/2 rounded-full bg-white shadow-md ring-1 ring-black/10"
        data-slot="slider-thumb"
        style={{ left: `${percent}%` }}
      />
      <input
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        data-slot="slider-input"
        max={max}
        min={min}
        onChange={(event) => onValueChange?.([Number(event.target.value)])}
        step={step}
        type="range"
        value={current}
        {...props}
      />
    </div>
  )
}

export { Slider }
