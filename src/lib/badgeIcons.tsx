'use client'

import {
  Award, Star, Trophy, Medal, Crown, Sparkles, ThumbsUp, Heart,
  Target, Zap, Flame, BookOpen,
} from 'lucide-react'

/* مجموعة أيقونات الأوسمة المتاحة (تُخزَّن بالاسم النصّي في badges.icon) */
export const BADGE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Award, Star, Trophy, Medal, Crown, Sparkles, ThumbsUp, Heart, Target, Zap, Flame, BookOpen,
}
export const ICON_NAMES = Object.keys(BADGE_ICONS)

/* لوحة ألوان الأوسمة — معدنية + مميزة (لتناسب اسم/نوع الوسام) */
export const BADGE_COLORS: { name: string; value: string }[] = [
  { name: 'ذهبي',   value: '#d4af37' },
  { name: 'فضّي',   value: '#9ca3af' },
  { name: 'برونزي', value: '#cd7f32' },
  { name: 'عنابي',  value: '#8a1538' },
  { name: 'أحمر',   value: '#dc2626' },
  { name: 'برتقالي', value: '#ea580c' },
  { name: 'كهرماني', value: '#f59e0b' },
  { name: 'أخضر',   value: '#16a34a' },
  { name: 'زمردي',  value: '#0d9488' },
  { name: 'أزرق',   value: '#2563eb' },
  { name: 'نيلي',   value: '#4f46e5' },
  { name: 'بنفسجي', value: '#7c3aed' },
  { name: 'وردي',   value: '#db2777' },
  { name: 'رمادي',  value: '#475569' },
]

export function BadgeIcon({ name, size = 18, className = '' }: { name: string; size?: number; className?: string }) {
  const Cmp = BADGE_ICONS[name] || Award
  return <Cmp size={size} className={className} />
}
