import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Browser Volume Control',
  version: pkg.version,
  description: 'Per-tab volume control. Make any website quieter or louder without changing system volume.',
  minimum_chrome_version: '116',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Browser Volume Control',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  permissions: ['activeTab', 'tabs', 'scripting'],
  host_permissions: [],
  web_accessible_resources: [],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'; frame-ancestors 'none';",
  },
  icons: {
    16: 'src/assets/icon-16.png',
    32: 'src/assets/icon-32.png',
    48: 'src/assets/icon-48.png',
    128: 'src/assets/icon-128.png',
  },
});
