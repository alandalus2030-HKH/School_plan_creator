/* ════════════════════════════════════════════
   صلاحيات النظام — مرجع مركزي
   ════════════════════════════════════════════ */

// icon = اسم مكوّن Lucide المقابل (يُستورد حسب الحاجة)
export const ALL_PERMISSIONS = [
  // المستخدمون والفِرق
  { code: 'manage_users',          label: 'إدارة المستخدمين',          icon: 'Users'          },
  { code: 'manage_teams',          label: 'إدارة الفرق',               icon: 'UsersRound'     },
  // الخطط
  { code: 'manage_plans',          label: 'إدارة الخطط والمحاور',      icon: 'ClipboardList'  },
  { code: 'approve_plans',         label: 'اعتماد الخطط',              icon: 'BadgeCheck'     },
  // المهام
  { code: 'manage_tasks',          label: 'إدارة المهام',              icon: 'CircleCheckBig' },
  { code: 'view_tasks',            label: 'عرض المهام',                icon: 'Eye'            },
  { code: 'rate_tasks',            label: 'تقييم جودة المهام',         icon: 'Star'           },
  // الأدلة
  { code: 'manage_evidence',       label: 'إضافة/تعديل/حذف الأدلة',    icon: 'Paperclip'      },
  { code: 'review_evidence',       label: 'اعتماد/رفض الأدلة',         icon: 'BadgeCheck'     },
  { code: 'view_evidence',         label: 'خزانة الأدلة',              icon: 'FolderOpen'     },
  // المتابعة والتقارير
  { code: 'view_reports',          label: 'عرض التقارير',              icon: 'ChartNoAxesColumn' },
  { code: 'view_aggregate',        label: 'عرض لوحة التجميع',          icon: 'Layers'         },
  // الاجتماعات
  { code: 'manage_meetings',       label: 'إدارة الاجتماعات',          icon: 'CalendarDays'   },
  // الأوسمة
  { code: 'manage_badges',         label: 'إنشاء وإدارة الأوسمة',      icon: 'Award'          },
  { code: 'grant_badges',          label: 'منح الأوسمة',               icon: 'Gift'           },
  // النظام
  { code: 'manage_settings',       label: 'إدارة الإعدادات',           icon: 'Settings'       },
  { code: 'manage_roles',          label: 'إدارة الأدوار',             icon: 'Crown'          },
  // عام
  { code: 'receive_notifications', label: 'استقبال الإشعارات',         icon: 'Bell'           },
] as const

export type PermissionCode = typeof ALL_PERMISSIONS[number]['code']

/** تجميع الصلاحيات تحت عناوين رئيسية (لتنظيم واجهة الأدوار) */
export const PERMISSION_GROUPS: { title: string; codes: string[] }[] = [
  { title: 'المستخدمون والفِرق',   codes: ['manage_users', 'manage_teams'] },
  { title: 'الخطط',                 codes: ['manage_plans', 'approve_plans'] },
  { title: 'المهام',                codes: ['manage_tasks', 'view_tasks', 'rate_tasks'] },
  { title: 'الأدلة',                codes: ['manage_evidence', 'review_evidence', 'view_evidence'] },
  { title: 'المتابعة والتقارير',    codes: ['view_reports', 'view_aggregate'] },
  { title: 'الاجتماعات',            codes: ['manage_meetings'] },
  { title: 'الأوسمة',               codes: ['manage_badges', 'grant_badges'] },
  { title: 'النظام والصلاحيات',     codes: ['manage_settings', 'manage_roles'] },
  { title: 'عام',                   codes: ['receive_notifications'] },
]

/** هل يملك الدور صلاحية معينة؟ */
export function hasPermission(
  permissions: string[],
  permission: PermissionCode
): boolean {
  return permissions.includes('all') || permissions.includes(permission)
}

/** ألوان الشارات الافتراضية */
export const ROLE_BADGE_COLORS: Record<string, string> = {
  super_admin:  'bg-violet-100 text-violet-700',
  school_admin: 'bg-indigo-100 text-indigo-700',
  supervisor:   'bg-blue-100   text-blue-700',
  teacher:      'bg-green-100  text-green-700',
  staff:        'bg-slate-100  text-slate-600',
}

export const ROLE_COLORS_PALETTE = [
  '#8a1538', '#6f1029', '#a83356', '#c25c74',
  '#d98ea0', '#5a0d22', '#46091a', '#2563eb', '#6b7280',
]
