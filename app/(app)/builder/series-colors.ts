"use client"

import { useState } from "react"

/** Categorical slots in fixed order (validated: adjacent-pair CVD and normal-vision
 * separation pass on the light surface; lighter slots rely on the legend and table view). */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"]

/** Give each fund a slot, keeping existing funds' slots and filling new ones from the
 * lowest free slot. */
function assignSlots(prev: Record<string, number>, isins: string[]): Record<string, number> {
  const next: Record<string, number> = {}
  for (const isin of isins) if (isin in prev) next[isin] = prev[isin]
  for (const isin of isins) {
    if (isin in next) continue
    const used = new Set(Object.values(next))
    next[isin] = SERIES_COLORS.findIndex((_, i) => !used.has(i))
  }
  return next
}

/** Keep each fund's colour while others are added or removed: colour follows the fund.
 * Call it from a component that stays mounted across builder steps. */
export function useStableColors(isins: string[]): Map<string, string> {
  const key = isins.join(",")
  const [slots, setSlots] = useState(() => assignSlots({}, isins))
  const [prevKey, setPrevKey] = useState(key)
  let current = slots
  if (key !== prevKey) {
    // Adjusting state while rendering when a prop changes (React's documented pattern).
    current = assignSlots(slots, isins)
    setSlots(current)
    setPrevKey(key)
  }
  return new Map(isins.map((i) => [i, SERIES_COLORS[current[i]] ?? SERIES_COLORS[0]]))
}
