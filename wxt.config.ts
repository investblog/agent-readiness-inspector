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

    // Spec §10, RI model: minimal install-time set; notifications is opt-in
    // (301.sh news + watch alerts), requested at runtime from a user gesture,
    // never at install. contextMenus/webRequest/scripting ship with their features.
    permissions: ['storage', 'alarms'],
    optional_permissions: ['notifications'],

    // Cross-origin probes of any target + credentialed refetch are the product
    // core (spec §10) — justified in store review notes.
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
