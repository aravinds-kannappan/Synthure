// ── Shared text utilities ─────────────────────────────────────────────────────
// The old regex extractor, canned fallback reports, and dictionary lookups that
// lived here are gone. Extraction now runs as OpenMed models in the browser
// (lib/openmed.ts) and the pipeline in app/api/synthesize/route.ts reads real
// public artifacts via lib/knowledge.server.ts. There is no fallback path.

// Compatibility helper. Clinical source strings must retain signs, ranges,
// identifiers and punctuation exactly; style rules must never rewrite them.
export function dehyphen<T>(value: T): T {
  return value
}

export const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
