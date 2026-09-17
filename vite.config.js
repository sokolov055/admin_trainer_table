import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' — приложение должно работать и в подпапке (GitHub Pages отдаёт
// его по адресу вида /trainer-automation/), и с корня домена. Относительные
// пути к ассетам покрывают оба случая без пересборки под конкретный хостинг.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    // Telegram открывает мини-приложение во встроенном WebView; отдельные
    // sourcemap-файлы там только мешают и раздувают раздачу.
    sourcemap: false,
  },
});
