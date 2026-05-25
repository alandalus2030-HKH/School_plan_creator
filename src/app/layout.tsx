import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام متابعة الخطط المدرسية",
  description: "نظام متابعة الخطط المدرسية",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full" translate="no" suppressHydrationWarning>
      <body className="min-h-full bg-slate-50" suppressHydrationWarning>{children}</body>
    </html>
  );
}
