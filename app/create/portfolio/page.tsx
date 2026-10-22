'use client'

import { PortfolioView } from '@/components/creator/portfolio-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { badges } = useAppState()
  return <PortfolioView badges={badges} />
}
