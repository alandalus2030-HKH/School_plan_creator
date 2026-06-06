'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type Crumb = {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: Crumb[]
}

/**
 * Breadcrumb — مسار التنقل الهرمي
 * استخدام:
 *   <Breadcrumb items={[
 *     { label: 'الخطط', href: '/dashboard/plans' },
 *     { label: 'خطة 2025', href: '/dashboard/plans/xyz' },
 *     { label: 'محور الحوكمة' },
 *   ]} />
 */
export default function Breadcrumb({ items }: BreadcrumbProps) {
  if (!items || items.length === 0) return null

  return (
    <nav aria-label="مسار التنقل" className="flex items-center gap-1 text-xs text-slate-400 flex-wrap mb-4">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronLeft size={12} className="text-slate-300 flex-shrink-0" />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-violet-700 transition-colors hover:underline underline-offset-2 max-w-[140px] truncate">
                {item.label}
              </Link>
            ) : (
              <span className={`max-w-[180px] truncate ${isLast ? 'text-slate-700 font-medium' : ''}`}>
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
