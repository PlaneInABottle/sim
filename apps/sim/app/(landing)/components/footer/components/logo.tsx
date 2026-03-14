import Image from 'next/image'
import Link from 'next/link'
import { isPublicLandingPageEnabled } from '@/lib/core/config/feature-flags'

export default function Logo() {
  const logoImage = (
    <Image
      src='/logo/b&w/text/b&w.svg'
      alt='Sim - Workflows for LLMs'
      width={49.78314}
      height={24.276}
      priority
      quality={90}
    />
  )

  if (!isPublicLandingPageEnabled) {
    return <div aria-label='Sim home'>{logoImage}</div>
  }

  return (
    <Link href='/' aria-label='Sim home'>
      {logoImage}
    </Link>
  )
}
