// Runs the agent red team headlessly, prints a per attack report, writes the
// catch rate to data/redteam.json for the eval source of truth, and returns
// false if any attack slipped past its defense. Wired to `npm run redteam-agents`.

import { writeFileSync } from 'fs'
import { runAgentRedTeam } from './redteam.agents'

export function runRedTeamHarness(): boolean {
  const r = runAgentRedTeam()
  for (const res of r.results) {
    const flags = res.firedFlags.join(', ') || 'none'
    console.log(`  [${res.caught ? 'catch' : 'MISS '}] ${res.category.padEnd(16)} ${res.id.padEnd(30)} -> ${res.decision}  flags=[${flags}]`)
  }
  console.log(`\nAgent red team: ${r.caught}/${r.total} attacks caught (${Math.round(r.rate * 100)} percent).`)
  const cats = Object.entries(r.byCategory).map(([c, v]) => `${c} ${v.caught}/${v.total}`).join(' · ')
  console.log(cats)
  try {
    writeFileSync('data/redteam.json', JSON.stringify({ total: r.total, caught: r.caught, rate: Number(r.rate.toFixed(4)), byCategory: r.byCategory }, null, 2) + '\n')
    console.log('wrote data/redteam.json')
  } catch (e) {
    console.log('could not write data/redteam.json:', e)
  }
  return r.caught === r.total
}
