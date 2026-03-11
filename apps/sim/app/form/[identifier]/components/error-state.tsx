'use client'

import { useRouter } from 'next/navigation'
import { isHosted } from '@/lib/core/config/feature-flags'
import { BrandedButton } from '@/app/(auth)/components/branded-button'
import { StatusPageLayout } from '@/app/(auth)/components/status-page-layout'

interface FormErrorStateProps {
  error: string
}

export function FormErrorState({ error }: FormErrorStateProps) {
  const router = useRouter()

  return (
    <StatusPageLayout
      title='Form Unavailable'
      description={error}
      hideNav
      showSupportFooter={isHosted}
    >
      <BrandedButton onClick={() => router.push('/workspace')}>Return to Workspace</BrandedButton>
    </StatusPageLayout>
  )
}
