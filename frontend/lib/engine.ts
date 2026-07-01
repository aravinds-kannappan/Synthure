// ── Shared text utilities ─────────────────────────────────────────────────────
// The old regex extractor, canned fallback reports, and dictionary lookups that
// lived here are gone. Extraction now runs as OpenMed models in the browser
// (lib/openmed.ts) and the pipeline in app/api/synthesize/route.ts reads real
// public artifacts via lib/knowledge.server.ts. There is no fallback path.

// ── Hyphen / dash sanitizer ─────────────────────────────────────────────────
// The product copy and every generated report must contain no hyphens or dashes.
export function dehyphen<T>(value: T): T {
  if (typeof value === 'string') {
    return value
      .replace(/[‐-―−]/g, ', ') // figure/en/em dashes + minus
      .replace(/\s-\s/g, ', ')
      .replace(/([A-Za-z0-9])-([A-Za-z0-9])/g, '$1 $2')
      .replace(/\s+,/g, ',')
      .replace(/,\s*,/g, ',')
      .replace(/\s{2,}/g, ' ') as unknown as T
  }
  if (Array.isArray(value)) return value.map((v) => dehyphen(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = dehyphen(v)
    return out as T
  }
  return value
}

export const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
