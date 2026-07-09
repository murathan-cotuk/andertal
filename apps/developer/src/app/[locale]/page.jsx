'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'

export default function IndexPage() {
  const router = useRouter()
  const locale = useLocale()

  useEffect(() => {
    const token = typeof window !== 'undefined' && localStorage.getItem('dev_token')
    router.replace(token ? `/${locale}/dashboard` : `/${locale}/login`)
  }, [locale, router])

  return null
}
