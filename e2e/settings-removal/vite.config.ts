import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = process.cwd()
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    ...['features/conversations/api', 'features/conversations/store', 'stores/auth', 'features/knowledge/workspace', 'auth/api',
      'features/settings/AccountSettingsPanel', 'features/settings/AppearanceSoundSettingsPanel', 'features/settings/NotificationSettingsPanel']
      .map(name => ({ find: `@/${name}`, replacement: path.join(root, 'e2e/settings-removal/boundary.tsx') })),
    { find: /^\.\/(Account|AppearanceSound|Notification)SettingsPanel$/, replacement: path.join(root, 'e2e/settings-removal/boundary.tsx') },
    { find: '@', replacement: path.join(root, 'src') },
  ], dedupe: ['react', 'react-dom'] },
  cacheDir: 'node_modules/.vite-settings-removal',
  optimizeDeps: { entries: ['e2e/settings-removal/index.html'] },
  server: { host: '127.0.0.1', port: 53263, strictPort: true },
})
