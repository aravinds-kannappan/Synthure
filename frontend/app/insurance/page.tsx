import InsuranceDemo from '@/components/insurance/InsuranceDemo'

export const metadata = {
  title: 'Care & coverage explorer · Synthure',
  description: 'Explore how a fictional clinical note, care needs, and personal priorities connect to illustrative plan and provider choices.',
}

export default async function InsurancePage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const params = await searchParams
  return <InsuranceDemo initialScenario={params.scenario} />
}
