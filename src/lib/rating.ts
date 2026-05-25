/* ══════════════════════════════════════════════════
   مساعد التقييم الخماسي — يُستخدم في كل أنحاء التطبيق
══════════════════════════════════════════════════ */

export const RATING_LABELS = {
  5: { label: 'ممتاز',    icon: '🌟', stars: '★★★★★', color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', ring: 'ring-emerald-400', dot: 'bg-emerald-500' },
  4: { label: 'جيد جداً', icon: '⭐', stars: '★★★★☆', color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200',    ring: 'ring-blue-400',    dot: 'bg-blue-500'    },
  3: { label: 'جيد',      icon: '✅', stars: '★★★☆☆', color: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200',  ring: 'ring-violet-400',  dot: 'bg-violet-500'  },
  2: { label: 'مقبول',    icon: '⚠️', stars: '★★☆☆☆', color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   ring: 'ring-amber-400',   dot: 'bg-amber-500'   },
  1: { label: 'ضعيف',     icon: '❌', stars: '★☆☆☆☆', color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     ring: 'ring-red-400',     dot: 'bg-red-500'     },
} as const

export type RatingValue = 1 | 2 | 3 | 4 | 5

/** من متوسط رقمي → بيانات التقدير اللفظي */
export function getRatingInfo(avg: number) {
  if (avg >= 4.5) return RATING_LABELS[5]
  if (avg >= 3.5) return RATING_LABELS[4]
  if (avg >= 2.5) return RATING_LABELS[3]
  if (avg >= 1.5) return RATING_LABELS[2]
  return RATING_LABELS[1]
}

/** حساب متوسط مصفوفة تقييمات (يتجاهل القيم الفارغة) */
export function calcAvgRating(ratings: (number | null | undefined)[]): number | null {
  const valid = ratings.filter((r): r is number => r != null && r >= 1 && r <= 5)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

/** حساب متوسط تقييمات شجرة العقد بشكل تعاودي */
export function calcNodeRating(node: any): number | null {
  if (!node.children || node.children.length === 0) {
    // عقدة ورقية: متوسط تقييمات المهام
    const ratings = (node.tasks || []).map((t: any) => t.rating).filter((r: any) => r != null)
    return calcAvgRating(ratings)
  }
  // عقدة وسيطة: متوسط تقييمات الأبناء
  const childRatings = node.children.map(calcNodeRating).filter((r: any) => r != null)
  return calcAvgRating(childRatings)
}
