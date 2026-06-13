-- إضافة عمود رابط الفيديو لجدول الأدلة (يوتيوب وغيره)
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS video_url TEXT;
