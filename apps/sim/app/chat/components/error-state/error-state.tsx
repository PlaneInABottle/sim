'use client'

import { useRouter } from 'next/navigation'
import { isHosted } from '@/lib/core/config/feature-flags'
import { BrandedButton } from '@/app/(auth)/components/branded-button'
import { StatusPageLayout } from '@/app/(auth)/components/status-page-layout'

interface ChatErrorStateProps {
  error: string
}

export function ChatErrorState({ error }: ChatErrorStateProps) {
  const router = useRouter()

  return (
    <StatusPageLayout
      title='Chat Unavailable'
      description={error}
      hideNav={!isHosted}
      showSupportFooter={isHosted}
    >
      <BrandedButton onClick={() => router.push('/workspace')}>Return to Workspace</BrandedButton>
    </StatusPageLayout>
  )
}
