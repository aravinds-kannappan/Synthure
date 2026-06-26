'use client'

import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react'
import type { ExtractionResult } from '@/lib/synthure'
import {
  initEncounter, derive, reducer,
  type EncounterState, type EncAction, type Derived,
} from '@/lib/encounter'

interface EncounterCtx {
  state: EncounterState
  d: Derived
  dispatch: (a: EncAction) => void
}

const Ctx = createContext<EncounterCtx | null>(null)

export function EncounterProvider({ extraction, children }: { extraction: ExtractionResult; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, extraction, initEncounter)
  const d = useMemo(() => derive(state), [state])
  const value = useMemo(() => ({ state, d, dispatch }), [state, d])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEncounter(): EncounterCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEncounter must be used within EncounterProvider')
  return v
}
