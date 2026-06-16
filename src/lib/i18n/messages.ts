/* ════════════════════════════════════════════════════════════
   قاموس الترجمة (ar / en) — أساس i18n الخفيف.
   النمط لكل كود جديد: const t = useT(); t('common.save')
   - أضف المفاتيح هنا تحت مجموعات منطقية (common/nav/tasks/...).
   - المفتاح المفقود يرجع كما هو (fallback) فلا ينكسر شيء أثناء الترحيل التدريجي.
   - الاستيفاء: t('msg.hello', { name }) مع "...{name}..." في النص.
   ════════════════════════════════════════════════════════════ */

export type Locale = 'ar' | 'en'

export const messages: Record<Locale, Record<string, string>> = {
  ar: {
    /* عام */
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.add': 'إضافة',
    'common.search': 'بحث...',
    'common.loading': 'جارٍ التحميل...',
    'common.close': 'إغلاق',
    'common.confirm': 'تأكيد',
    'common.print': 'طباعة',
    'common.export': 'تصدير',
    'common.all': 'الكل',
    'common.none': '—',
    'common.yes': 'نعم',
    'common.no': 'لا',
    /* التنقّل */
    'nav.dashboard': 'لوحة التحكم',
    'nav.myTasks': 'مهامي',
    'nav.plans': 'الخطط',
    'nav.allTasks': 'كل المهام',
    'nav.teams': 'الفرق',
    'nav.reports': 'التقارير',
    'nav.aggregate': 'لوحة التجميع',
    'nav.evidence': 'خزانة الأدلة',
    'nav.meetings': 'الاجتماعات',
    'nav.users': 'المستخدمون',
    'nav.badges': 'الأوسمة',
    'nav.settings': 'الإعدادات',
    'nav.help': 'المساعدة',
    'nav.profile': 'ملفي الشخصي',
  },
  en: {
    /* common */
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.search': 'Search...',
    'common.loading': 'Loading...',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.print': 'Print',
    'common.export': 'Export',
    'common.all': 'All',
    'common.none': '—',
    'common.yes': 'Yes',
    'common.no': 'No',
    /* nav */
    'nav.dashboard': 'Dashboard',
    'nav.myTasks': 'My Tasks',
    'nav.plans': 'Plans',
    'nav.allTasks': 'All Tasks',
    'nav.teams': 'Teams',
    'nav.reports': 'Reports',
    'nav.aggregate': 'Aggregate',
    'nav.evidence': 'Evidence',
    'nav.meetings': 'Meetings',
    'nav.users': 'Users',
    'nav.badges': 'Badges',
    'nav.settings': 'Settings',
    'nav.help': 'Help',
    'nav.profile': 'My Profile',
  },
}
