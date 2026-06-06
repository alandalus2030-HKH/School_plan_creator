/* ════════════════════════════════════════════
   صلاحيات النظام — مرجع مركزي
   ════════════════════════════════════════════ */

// icon = اسم مكوّن Lucide المقابل (يُستورد حسب الحاجة)
export const ALL_PERMISSIONS = [
  { code: 'manage_users',          label: 'إدارة المستخدمين',      icon: 'Users'          },
  { code: 'manage_teams',          label: 'إدارة الفرق',           icon: 'UsersRound'     },
  { code: 'manage_plans',          label: 'إدارة الخطط والمحاور',  icon: 'ClipboardList'  },
  { code: 'manage_tasks',          label: 'إدارة المهام',          icon: 'CircleCheckBig' },
  { code: 'view_tasks',            label: 'عرض المهام',            icon: 'Eye'            },
  { code: 'view_reports',          label: 'عرض التقارير',          icon: 'ChartNoAxesColumn' },
  { code: 'manage_settings',       label: 'إدارة الإعدادات',       icon: 'Settings'       },
  { code: 'manage_roles',          label: 'إدارة الأدوار',         icon: 'Crown'          },
  { code: 'receive_notifications', label: 'استقبال الإشعارات',     icon: 'Bell'           },
  { code: 'rate_tasks',            label: 'تقييم المهام',          icon: 'Star'           },
] as const

export type PermissionCode = typeof ALL_PERMISSIONS[number]['code']

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
