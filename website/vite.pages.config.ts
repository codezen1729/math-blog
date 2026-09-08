import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { realpathSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

function deploymentMetadata(): Plugin {
  const configuredUrl = process.env.SITE_URL?.trim();
  const siteUrl = configuredUrl ? configuredUrl.replace(/\/+$/, '') + '/' : undefined;

  return {
    name: 'deployment-metadata',
    transformIndexHtml(html) {
      if (!siteUrl) return html;

      const imageUrl = new URL('og.png', siteUrl).href;
      return html.replaceAll('content="./og.png"', `content="${imageUrl}"`);
    },
  };
}

export default defineConfig({
  base: './',
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react(), deploymentMetadata()],
  server: {
    watch: { usePolling: true, interval: 500 },
    fs: { allow: [fileURLToPath(new URL('./', import.meta.url)), realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url)))] },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-pages',
    emptyOutDir: true,
  },
});
