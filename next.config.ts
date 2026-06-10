import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // خرائط المصدر في الإنتاج — لقراءة الأخطاء بأسماء حقيقية (لا مُصغّرة) من نسخة Vercel
  productionBrowserSourceMaps: true,
};

export default nextConfig;
