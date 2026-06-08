import type { Metadata } from 'next'
import LegalShell, { type LegalContent } from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'شروط الاستخدام · نظام متابعة الخطط المدرسية',
  description: 'شروط وأحكام استخدام نظام متابعة الخطط المدرسية',
}

const AR: LegalContent = {
  title:   'شروط الاستخدام',
  updated: 'آخر تحديث: 8 يونيو 2026',
  intro:
    'تحكم هذه الشروط استخدامك لـ "نظام متابعة الخطط المدرسية". باستخدامك للنظام فإنك تقرّ بقبول هذه الشروط. إن لم توافق عليها فيرجى عدم استخدام النظام.',
  sections: [
    {
      h: 'طبيعة الخدمة',
      p: [
        'النظام أداة لمساعدة المدارس على بناء الخطط التطويرية، وتكليف المهام ومتابعتها، وإنتاج تقارير الاعتماد. يُقدَّم لأغراض إدارية وتعليمية داخل المدرسة.',
      ],
    },
    {
      h: 'الحساب والصلاحيات',
      p: [
        '• تُنشَأ الحسابات عبر مشرف النظام في المدرسة، وأنت مسؤول عن سرية بيانات دخولك.',
        '• يُمنع مشاركة الحساب أو استخدامه من قِبل غير صاحبه.',
        '• تُحدَّد صلاحية كل مستخدم حسب دوره، ولا يجوز محاولة تجاوزها أو الوصول لبيانات لا تخصّه.',
      ],
    },
    {
      h: 'الاستخدام المقبول',
      p: [
        '• استخدم النظام للأغراض المشروعة المتعلقة بعمل المدرسة فقط.',
        '• يُمنع إدخال محتوى مخالف للأنظمة أو ينتهك حقوق الآخرين.',
        '• يُمنع أي محاولة للإضرار بالنظام أو اختراقه أو تعطيل عمله أو الوصول غير المصرّح به.',
      ],
    },
    {
      h: 'ملكية المحتوى',
      p: [
        '• البيانات التي تُدخلها المدرسة تبقى ملكاً لها.',
        '• حقوق النظام نفسه (البرمجيات والتصميم) محفوظة لمزوّد الخدمة.',
      ],
    },
    {
      h: 'حدود المسؤولية',
      p: [
        '• نسعى لتوفير خدمة مستقرة وآمنة، لكن قد تحدث أعطال أو فترات صيانة.',
        '• لا يتحمّل مزوّد الخدمة مسؤولية فقدان بيانات ناتج عن سوء الاستخدام أو ظروف خارجة عن الإرادة، مع التزامنا ببذل العناية اللازمة والنسخ الاحتياطي.',
        'يُنصح بالاحتفاظ بنسخ من المستندات المهمة.',
      ],
    },
    {
      h: 'التعديلات وإيقاف الخدمة',
      p: [
        '• قد نحدّث هذه الشروط أو مزايا النظام من وقت لآخر، ويُعتبر استمرارك في الاستخدام موافقةً على التحديثات.',
        '• يحقّ لمشرف النظام تعطيل أي حساب يخالف هذه الشروط.',
      ],
    },
    {
      h: 'التواصل',
      p: [
        'لأي استفسار حول هذه الشروط، يُرجى التواصل مع مشرف النظام في مدرستك، أو عبر إدارة النظام.',
      ],
    },
  ],
}

const EN: LegalContent = {
  title:   'Terms of Use',
  updated: 'Last updated: June 8, 2026',
  intro:
    'These terms govern your use of the School Plan Tracking System. By using the system you acknowledge acceptance of these terms. If you do not agree, please do not use the system.',
  sections: [
    {
      h: 'Nature of the service',
      p: [
        'The system is a tool to help schools build developmental plans, assign and track tasks, and produce accreditation reports. It is provided for administrative and educational purposes within the school.',
      ],
    },
    {
      h: 'Account & permissions',
      p: [
        '• Accounts are created by your school’s system administrator; you are responsible for keeping your credentials confidential.',
        '• Sharing your account or using someone else’s is prohibited.',
        '• Each user’s permissions are role-based; attempting to bypass them or access data not belonging to you is prohibited.',
      ],
    },
    {
      h: 'Acceptable use',
      p: [
        '• Use the system only for lawful purposes related to school operations.',
        '• Do not enter content that violates regulations or infringes others’ rights.',
        '• Any attempt to harm, hack, disrupt, or gain unauthorized access to the system is prohibited.',
      ],
    },
    {
      h: 'Content ownership',
      p: [
        '• Data entered by the school remains the property of the school.',
        '• Rights to the system itself (software and design) are reserved to the service provider.',
      ],
    },
    {
      h: 'Limitation of liability',
      p: [
        '• We strive to provide a stable, secure service, but outages or maintenance windows may occur.',
        '• The provider is not liable for data loss caused by misuse or circumstances beyond control, while committing to due care and backups.',
        'Keeping copies of important documents is advised.',
      ],
    },
    {
      h: 'Changes & suspension',
      p: [
        '• We may update these terms or system features from time to time; continued use constitutes acceptance of updates.',
        '• The system administrator may suspend any account that violates these terms.',
      ],
    },
    {
      h: 'Contact',
      p: [
        'For any inquiry about these terms, please contact your school’s system administrator or the platform administration.',
      ],
    },
  ],
}

export default function TermsPage() {
  return (
    <LegalShell
      ar={AR} en={EN}
      otherHref="/privacy"
      otherLabelAr="سياسة الخصوصية ←"
      otherLabelEn="→ Privacy Policy"
    />
  )
}
