import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  zip: {
    // AMO needs reproducible source, not screenshots, research, or release art.
    excludeSources: ['temp/**', 'dev/**', 'store-assets/**', 'docs/**', 'ci/**', 'drift-out/**'],
  },

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
    permissions: browser === 'firefox' ? ['storage', 'alarms'] : ['storage', 'alarms', 'sidePanel'],
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

    // Dashboard doubles as the options page, opened as a full tab (spec §6)
    options_ui: {
      page: 'dashboard.html',
      open_in_tab: true,
    },

    // Main surface (spec §6, RI model): one popup.html in two modes.
    // Chromium — side panel opened by the icon (default_popup dropped below);
    // Firefox — popup on click + the same HTML as a sidebar.
    ...(browser !== 'firefox' && {
      side_panel: {
        default_path: 'popup.html?sidepanel=1',
      },
    }),

    ...(browser === 'firefox' && {
      sidebar_action: {
        default_panel: 'popup.html?sidepanel=1',
        default_title: '__MSG_extName__',
        default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
      },
    }),

    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'agent-readiness-inspector@301.st',
          strict_min_version: '140.0',
          data_collection_permissions: {
            required: ['none'],
            optional: ['authenticationInfo', 'browsingActivity'],
          },
        },
        gecko_android: {
          strict_min_version: '142.0',
        },
      },
    }),
  }),

  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      // Chromium: icon click opens the side panel (setPanelBehavior in the
      // background); a default_popup would take precedence over it, so drop it.
      // Firefox keeps the popup — its icon can't open the sidebar natively.
      if (wxt.config.browser !== 'firefox' && manifest.action) {
        delete (manifest.action as { default_popup?: string }).default_popup;
      }
    },
  },

  browser: 'chrome',
});
