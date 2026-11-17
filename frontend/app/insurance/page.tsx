import InsuranceDemo from '@/components/insurance/InsuranceDemo'

export const metadata = {
  title: 'Care & coverage explorer · Synthure',
  description: 'Explore how a fictional clinical note, care needs, and personal priorities connect to illustrative plan and provider choices.',
}

export default async function InsurancePage({ searchParams }: { searchParams: Promise<Partial<Record<'scenario' | 'plan' | 'priority' | 'visits' | 'budget' | 'distance' | 'language', string | string[]>>> }) {
  const params = await searchParams
  const scalar = (key: keyof typeof params) => typeof params[key] === 'string' ? params[key] as string : undefined
  const initialScenario = scalar('scenario'), initialPlan = scalar('plan')
  const initialPreferences = { priority: scalar('priority'), visits: scalar('visits'), budget: scalar('budget'), distance: scalar('distance'), language: scalar('language') }
  return <InsuranceDemo key={JSON.stringify([initialScenario, initialPlan, initialPreferences])} initialScenario={initialScenario} initialPlan={initialPlan} initialPreferences={initialPreferences} />
}
