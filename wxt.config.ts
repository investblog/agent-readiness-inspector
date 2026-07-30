import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    version: '0.1.0',
    default_locale: 'en',
    author: '301.st — Smart Traffic <support@301.st>',
    homepage_url: 'https://301.st',

    ...(browser === 'chrome' && { minimum_chrome_version: '116' }),

    // Spec §10: storage, alarms, contextMenus core; notifications is opt-in
    // (watch-mode regression alerts), requested at runtime from a user gesture.
    permissions: ['storage', 'alarms', 'contextMenus', 'clipboardWrite'],
    optional_permissions: ['notifications'],

    // Spec §13 open question: wide hosts vs activeTab + optional host grants.
    // Wide for development; revisit before store submission.
    host_permissions: ['<all_urls>'],

    icons: {
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },

    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'agent-readiness-inspector@301.st',
          strict_min_version: '140.0',
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
    }),
  }),

  browser: 'chrome',
});
