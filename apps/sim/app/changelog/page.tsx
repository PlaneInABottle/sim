import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isPublicChangelogPageEnabled } from '@/lib/core/config/feature-flags'
import ChangelogContent from '@/app/changelog/components/changelog-content'

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Stay up-to-date with the latest features, improvements, and bug fixes in Sim.',
  openGraph: {
    title: 'Changelog',
    description: 'Stay up-to-date with the latest features, improvements, and bug fixes in Sim.',
    type: 'website',
  },
}

export default function ChangelogPage() {
  if (!isPublicChangelogPageEnabled) {
    notFound()
  }

  return <ChangelogContent />
}
