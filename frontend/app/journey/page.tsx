import JourneyStory from '@/components/story/JourneyStory'

export const metadata = {
  title: 'Follow the note · Synthure',
  description: 'An interactive visual walkthrough of one synthetic clinical note becoming a connected care journey.',
}

export default async function JourneyPage({ searchParams }: { searchParams?: Promise<{ scenario?: string }> }) {
  const params = await searchParams
  return <JourneyStory initialScenario={params?.scenario} />
}
