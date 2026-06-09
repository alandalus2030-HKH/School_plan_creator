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

export function BadgeIcon({ name, size = 18, className = '' }: { name: string; size?: number; className?: string }) {
  const Cmp = BADGE_ICONS[name] || Award
  return <Cmp size={size} className={className} />
}
