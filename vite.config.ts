import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:3000';
  const proxy = { '/api': { target: apiTarget, changeOrigin: true } };

  return {
    plugins: [react()],
    // fs.allow: the Settings → Train model worker imports the API's trainer (API/supabase/functions/api/lib/clause-svm-*.ts).
    server: { port: 8080, strictPort: true, proxy, fs: { allow: ['.', '../API/supabase/functions/api/lib'] } },
    preview: { port: 8080, strictPort: true, proxy },
  };
});
