'use client'
import { createClient } from './supabase/client'

export type RealtimeEvent = {
  event_type: string
  payload: Record<string, unknown>
  portal: string
  patient_id?: string
}

export function subscribeToPortalEvents(
  portal: string,
  orgId: string,
  onEvent: (event: RealtimeEvent) => void,
) {
  const supabase = createClient()
  const channel = supabase
    .channel(`portal:${portal}:${orgId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'realtime_events',
        filter: `portal=eq.${portal}`,
      },
      (payload) => {
        onEvent(payload.new as RealtimeEvent)
      },
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
