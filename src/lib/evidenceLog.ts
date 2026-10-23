/* ════════════════════════════════════════════════════════════
   سجلّ الدليل — تصنيف الوقائع (الوثيقة 9.3)

   «القاعدة: يخرج ما يخصّ **الدليل المقبول**، ولا يخرج ما يخصّ
    **المداولة**.»

   | يخرج في حزمة المقيّم          | يبقى داخلياً                  |
   |--------------------------------|-------------------------------|
   | الرافع وتاريخ الرفع            | الأدلة المرفوضة وأسبابها      |
   | القابل وتاريخ القبول           | مسوّدات الأحكام ومداولاتها     |
   | البصمة                         | التقييمات الفردية والتباين     |
   | تعديلات الإسناد بعد القبول     | الرأي المخالف · تنبيهات التعارض|

   «والسبب أن المداولة شرطُ جودةِ الحكم لا موضوعُه. ولو صُدِّرت لصار
    الفريق يتحفّظ في نقده لنفسه — فنُفسد بالشفافية ما أردنا حمايته بها.»

   والتصنيف **محسوبٌ لا مخزَّن** (14: «المحسوب لا يُخزَّن»): فلو كُتب
   عموداً في كل صفّ ثم تبدّلت القاعدة، كذب ما مضى. وهو هنا مصدرٌ واحد
   يقرأه العرض اليوم وحزمة المقيّم في المرحلة الرابعة.
   ════════════════════════════════════════════════════════════ */

export type EvidenceEvent =
  | 'uploaded' | 'accepted' | 'rejected' | 'reopened' | 'edited_after_accept'
  | 'anchor_added' | 'anchor_removed' | 'anchor_confirmed' | 'anchor_declined'
  | 'fixity_alert'

type EventSpec = {
  label:    string
  /** يخرج في حزمة المقيّم الخارجي (9.3) */
  external: boolean
  icon:     string
  tone:     'slate' | 'emerald' | 'rose' | 'amber' | 'sky' | 'violet'
}

export const EVIDENCE_EVENTS: Record<EvidenceEvent, EventSpec> = {
  uploaded:            { label: 'رُفع',                  external: true,  icon: 'Upload',       tone: 'slate'   },
  accepted:            { label: 'قُبل',                  external: true,  icon: 'CheckCircle2', tone: 'emerald' },
  /* الرفض مداولةٌ: «الأدلة المرفوضة وأسبابها» تبقى داخلية (9.3) */
  rejected:            { label: 'رُفض',                  external: false, icon: 'XCircle',      tone: 'rose'    },
  /* ونقضُ الحكم «ما تغيّر فيه بعد القبول» — فيخرج */
  reopened:            { label: 'نُقض الحكم',            external: true,  icon: 'RotateCcw',    tone: 'amber'   },
  edited_after_accept: { label: 'تغيّر بعد القبول',      external: true,  icon: 'PencilLine',   tone: 'amber'   },
  anchor_added:        { label: 'أُسند',                 external: true,  icon: 'Target',       tone: 'sky'     },
  anchor_removed:      { label: 'أُسقطت مرساة',          external: true,  icon: 'Target',       tone: 'rose'    },
  anchor_confirmed:    { label: 'أُكّد الإسناد الوارد',  external: true,  icon: 'BadgeCheck',   tone: 'emerald' },
  anchor_declined:     { label: 'رُدّ الإسناد الوارد',   external: false, icon: 'Undo2',        tone: 'slate'   },
  fixity_alert:        { label: 'جرس البصمة',            external: true,  icon: 'Fingerprint',  tone: 'violet'  },
}

export const isExternal = (e: string): boolean =>
  EVIDENCE_EVENTS[e as EvidenceEvent]?.external ?? false

export const eventLabel = (e: string): string =>
  EVIDENCE_EVENTS[e as EvidenceEvent]?.label ?? e

/** الحقول التي يُسمّيها `edited_after_accept` — بالعربية */
export const FIELD_LABELS: Record<string, string> = {
  academic_year: 'العام المنسوب',
  document_date: 'تاريخ الوثيقة',
  name:          'الاسم',
  permanence:    'وسم الدوام',
  evidence_type: 'النوع',
  owner_team_id: 'الفريق المالك',
}
