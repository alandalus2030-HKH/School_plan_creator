import type { Metadata } from 'next'
import LegalShell, { type LegalContent } from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'سياسة الخصوصية · نظام متابعة الخطط المدرسية',
  description: 'سياسة الخصوصية وحماية البيانات في نظام متابعة الخطط المدرسية',
}

const AR: LegalContent = {
  title:   'سياسة الخصوصية',
  updated: 'آخر تحديث: 8 يونيو 2026',
  intro:
    'نلتزم في "نظام متابعة الخطط المدرسية" بحماية خصوصية بياناتك. توضّح هذه السياسة البيانات التي نجمعها، وكيف نستخدمها ونحفظها، وحقوقك تجاهها. باستخدامك للنظام فإنك توافق على ما ورد فيها.',
  sections: [
    {
      h: 'البيانات التي نجمعها',
      p: [
        '• بيانات الحساب: الاسم، البريد الإلكتروني، اسم المستخدم، الدور الوظيفي، والمدرسة التابع لها.',
        '• بيانات العمل: الخطط والمحاور والمهام ومؤشرات الأداء والأدلة والتعليقات التي تُنشئها داخل النظام.',
        '• بيانات تقنية محدودة: سجلّات الدخول والنشاط لأغراض الأمان وتحسين الخدمة.',
        'لا نجمع بيانات حسّاسة لا علاقة لها بعمل المدرسة، ولا نطلب بيانات مالية.',
      ],
    },
    {
      h: 'كيف نستخدم البيانات',
      p: [
        '• تشغيل النظام وتمكينك من بناء الخطط ومتابعة المهام وإنتاج التقارير.',
        '• إرسال الإشعارات والتذكيرات المتعلقة بمهامك واجتماعاتك.',
        '• تحسين الأداء والأمان واكتشاف الأخطاء.',
        'لا نبيع بياناتك ولا نشاركها مع أطراف خارجية لأغراض تسويقية.',
      ],
    },
    {
      h: 'حفظ البيانات وحمايتها',
      p: [
        '• تُحفظ البيانات في قاعدة بيانات آمنة (Supabase) مع عزل صارم بين بيانات كل مدرسة عبر سياسات أمان على مستوى الصفوف (RLS).',
        '• الوصول للبيانات مقيّد بالصلاحيات؛ كل مستخدم يرى ما تسمح به صلاحياته فقط.',
        '• تُنقل البيانات عبر اتصال مشفّر (HTTPS).',
      ],
    },
    {
      h: 'مشاركة البيانات',
      p: [
        '• ضمن المدرسة الواحدة: تُشارَك بيانات العمل بين أعضاء الفريق حسب الصلاحيات (مثل تكليف المهام والمتابعة).',
        '• لا يمكن لأي مدرسة الاطّلاع على بيانات مدرسة أخرى.',
        '• قد نستعين بمزوّدي خدمات تقنية (الاستضافة، البريد) ملتزمين بحماية البيانات، وبالقدر اللازم لتشغيل النظام فقط.',
      ],
    },
    {
      h: 'حقوقك',
      p: [
        '• الاطّلاع على بياناتك وتصحيحها من خلال ملفك الشخصي أو عبر مشرف النظام.',
        '• طلب حذف حسابك أو بياناتك ضمن ما تسمح به متطلبات المدرسة والأنظمة المعمول بها.',
        '• الاستفسار عن كيفية معالجة بياناتك في أي وقت.',
      ],
    },
    {
      h: 'التواصل',
      p: [
        'لأي استفسار يخص الخصوصية أو بياناتك، يُرجى التواصل مع مشرف النظام في مدرستك، أو عبر إدارة النظام.',
      ],
    },
  ],
}

const EN: LegalContent = {
  title:   'Privacy Policy',
  updated: 'Last updated: June 8, 2026',
  intro:
    'At the School Plan Tracking System we are committed to protecting your privacy. This policy explains what data we collect, how we use and store it, and your rights. By using the system you agree to this policy.',
  sections: [
    {
      h: 'Data we collect',
      p: [
        '• Account data: name, email, username, role, and the school you belong to.',
        '• Operational data: plans, axes, tasks, KPIs, evidence, and comments you create in the system.',
        '• Limited technical data: sign-in and activity logs for security and service improvement.',
        'We do not collect sensitive data unrelated to school operations, and we never request financial data.',
      ],
    },
    {
      h: 'How we use data',
      p: [
        '• To operate the system and let you build plans, track tasks, and produce reports.',
        '• To send notifications and reminders about your tasks and meetings.',
        '• To improve performance, security, and detect errors.',
        'We do not sell your data or share it with third parties for marketing.',
      ],
    },
    {
      h: 'Data storage & protection',
      p: [
        '• Data is stored in a secure database (Supabase) with strict isolation between schools via Row-Level Security (RLS).',
        '• Access is permission-based; each user sees only what their permissions allow.',
        '• Data is transmitted over an encrypted connection (HTTPS).',
      ],
    },
    {
      h: 'Data sharing',
      p: [
        '• Within a single school: operational data is shared among team members based on permissions (e.g. task assignment and follow-up).',
        '• No school can access another school’s data.',
        '• We may rely on technical service providers (hosting, email) bound by data protection, only as needed to run the system.',
      ],
    },
    {
      h: 'Your rights',
      p: [
        '• Access and correct your data via your profile or through your system administrator.',
        '• Request deletion of your account or data, subject to school requirements and applicable regulations.',
        '• Inquire about how your data is processed at any time.',
      ],
    },
    {
      h: 'Contact',
      p: [
        'For any privacy or data inquiry, please contact your school’s system administrator or the platform administration.',
      ],
    },
  ],
}

export default function PrivacyPage() {
  return (
    <LegalShell
      ar={AR} en={EN}
      otherHref="/terms"
      otherLabelAr="شروط الاستخدام ←"
      otherLabelEn="→ Terms of Use"
    />
  )
}
