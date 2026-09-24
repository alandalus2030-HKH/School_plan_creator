/* ════════════════════════════════════════════════════════════
   نماذج Groq — مصدر واحد قابل للتبديل من متغيّرات البيئة.

   لماذا: في 2026-09-24 سحبت Groq عائلة Llama النصّية من حسابنا،
   فردّت بـ404 (model_not_found) وتعطّلت أربع نقاط في النظام دفعةً
   واحدة لأن اسم النموذج كان مكتوباً في كل ملفّ على حدة.
   الآن: اسمٌ واحد في مكان واحد، وتبديله لا يحتاج تعديل كود.

   النماذج المتاحة للمفتاح تُقرأ من:
     GET https://api.groq.com/openai/v1/models
   وكان المتاح وقت الإصلاح: openai/gpt-oss-20b · openai/gpt-oss-120b
   · allam-2-7b (عربي) · qwen/qwen3.8-27b · whisper (صوت).

   ملاحظة على gpt-oss: نماذج استدلال — تستهلك رموزاً قبل الإجابة.
   استعملها مع response_format: json_object ومهلة رموز كافية، وإلا
   عادت بمحتوى فارغ (جُرِّب: 200 رمز = فارغ · 900 = JSON صالح).
   ════════════════════════════════════════════════════════════ */

/** نموذج سريع للمهام القصيرة (وصف دليل، تلخيص سطر). */
export const GROQ_MODEL_FAST = process.env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b'

/** نموذج أدقّ للتوليد المنظَّم (اقتراح أهداف، توليد مؤشرات). */
export const GROQ_MODEL_SMART = process.env.GROQ_MODEL_SMART || 'openai/gpt-oss-120b'

/**
 * نموذج الرؤية (استيراد التقويم من صورة).
 * ⚠ لا نموذج رؤية متاحاً للمفتاح الحالي (2026-09-24) — تبقى الميزة
 * معطّلة حتى يُتاح واحد أو يُضبط GROQ_MODEL_VISION على بديل.
 */
export const GROQ_MODEL_VISION = process.env.GROQ_MODEL_VISION || 'meta-llama/llama-4-scout-17b-16e-instruct'

/** رسالة موحّدة حين يرفض المزوّد النموذج — لا تُبتلع الأخطاء. */
export function groqModelError(model: string, message: string): string {
  return `تعذّر استخدام النموذج «${model}»: ${message}. ` +
         `قد يكون أُوقف لدى المزوّد — يُضبط بديله في متغيّر البيئة.`
}
