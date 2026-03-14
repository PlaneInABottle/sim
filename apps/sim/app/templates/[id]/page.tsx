import { db } from '@sim/db'
import { templateCreators, templates } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isPublicTemplatesPagesEnabled } from '@/lib/core/config/feature-flags'
import { getBaseUrl } from '@/lib/core/utils/urls'
import TemplateDetails from '@/app/templates/[id]/template'

const logger = createLogger('TemplateMetadata')

function getUnavailableTemplateMetadata(): Metadata {
  return {
    title: 'Template Not Found',
    description: 'The requested template could not be found.',
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  }
}

async function getPublicTemplateMetadataRecord(id: string) {
  const result = await db
    .select({
      template: templates,
      creator: templateCreators,
    })
    .from(templates)
    .leftJoin(templateCreators, eq(templates.creatorId, templateCreators.id))
    .where(eq(templates.id, id))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  const [{ template, creator }] = result

  if (!isPublicTemplatesPagesEnabled || template.status !== 'approved') {
    return null
  }

  return {
    template,
    creator,
  }
}

/**
 * Generate dynamic metadata for template pages.
 * This provides OpenGraph images for social media sharing.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  try {
    const metadataRecord = await getPublicTemplateMetadataRecord(id)

    if (!metadataRecord) {
      return getUnavailableTemplateMetadata()
    }

    const { template, creator } = metadataRecord
    const baseUrl = getBaseUrl()

    const details = template.details as { tagline?: string; about?: string } | null
    const description = details?.tagline || 'AI workflow template on Sim'

    const hasOgImage = !!template.ogImageUrl
    const ogImageUrl = template.ogImageUrl || `${baseUrl}/logo/primary/rounded.png`

    return {
      title: template.name,
      description,
      openGraph: {
        title: template.name,
        description,
        type: 'website',
        url: `${baseUrl}/templates/${id}`,
        siteName: 'Sim',
        images: [
          {
            url: ogImageUrl,
            width: hasOgImage ? 1200 : 512,
            height: hasOgImage ? 630 : 512,
            alt: `${template.name} - Workflow Preview`,
          },
        ],
      },
      twitter: {
        card: hasOgImage ? 'summary_large_image' : 'summary',
        title: template.name,
        description,
        images: [ogImageUrl],
        creator: creator?.details
          ? ((creator.details as Record<string, unknown>).xHandle as string) || undefined
          : undefined,
      },
    }
  } catch (error) {
    logger.error('Failed to generate template metadata:', error)
    return getUnavailableTemplateMetadata()
  }
}

/**
 * Public template detail page for unauthenticated users.
 * Authenticated-user redirect is handled in templates/[id]/layout.tsx.
 */
export default function TemplatePage() {
  if (!isPublicTemplatesPagesEnabled) {
    notFound()
  }

  return <TemplateDetails />
}
