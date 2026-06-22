import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // خرائط المصدر في الإنتاج — لقراءة الأخطاء بأسماء حقيقية (لا مُصغّرة) من نسخة Vercel
  productionBrowserSourceMaps: true,
  // تثبيت جذر مساحة العمل على مجلد المشروع — يمنع Next من اختيار سطح المكتب جذراً
  // بسبب package-lock.json دخيل هناك. process.cwd() = جذر المشروع محلياً وعلى Vercel.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
