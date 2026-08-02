# Подготовка листингов

Актуально на 2026-08-02. Канонический privacy URL после первого успешного
Pages deploy:

`https://investblog.github.io/agent-readiness-inspector/privacy/`

Резервная ссылка, работающая без GitHub Pages:

`https://github.com/investblog/agent-readiness-inspector/blob/main/docs/privacy-policy.md`

## Что загружать

| Стор | Пакет | Текст |
|---|---|---|
| Chrome Web Store | `dist/agent-readiness-inspector-0.1.0-chrome.zip` | `chrome/{en,ru}.txt` |
| Microsoft Edge Add-ons | `dist/agent-readiness-inspector-0.1.0-edge.zip` | `edge/{en,ru}.txt` |
| Firefox Add-ons (AMO) | `dist/agent-readiness-inspector-0.1.0-firefox.zip` | `firefox/{en,ru}.md` |
| Firefox source review | `dist/agent-readiness-inspector-0.1.0-sources.zip` | build-инструкция внутри: `AMO_BUILD.md` |

В пакетах есть локали `en` и `ru`, поэтому листинги подготовлены для обеих.
Edge требует описание и логотип для каждой заявленной локали.

## Первый релиз и последующие

Первый релиз `v0.1.0` подается в сторы вручную, но пакеты собираются только на
GitHub Actions Linux runner:

1. Закоммитить и отправить подготовленные изменения в `main`.
2. Запустить `Actions` → `Cut release` → `Run workflow`.
3. Дождаться успешных `Cut release` и `Release`.
4. Скачать Chrome, Edge, Firefox и source ZIP из GitHub Release `v0.1.0`.
5. Подать эти пакеты вручную вместе с текстами и ассетами из этого каталога.

Для последующих версий обновить версию одновременно в `package.json`,
`package-lock.json` и `wxt.config.ts`, затем снова запустить `Cut release`.
По умолчанию Chrome и Edge отправляются автоматически; Firefox остается ручным
вызовом `Submit to stores`, потому что AMO резервирует номера загруженных версий.

После создания первых листингов добавить в GitHub Actions secrets:

- Chrome: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
  `CHROME_REFRESH_TOKEN`;
- Edge: `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`;
- Firefox: `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`.

## Ассеты

Финальные оптимизированные файлы лежат в `store-assets/`:

- `icon-128.png` — иконка Chrome и исходник для загрузки в Edge;
- `promo-small-440x280.png` — малая плитка Chrome/Edge;
- `promo-marquee-1400x560.png` — опциональная большая плитка Chrome/Edge;
- `screenshot-*.png` — реальные UI-скриншоты 1280x800 для всех трех сторов.
- `screenshot-dark-1280x800.png` — темная панель на статье `301.sh/mcp-server-on-workers-free-plan/`;
- `screenshot-scan-1280x800.png` — светлая панель на странице `301.st/features`.

Из вариантов в `temp/` выбран radar-набор: он использует реальный маскот
расширения, лучше связан с иконкой и сохраняет смысл при уменьшении. Картинка
`store-cover-1280x800.png` годится для анонса или OG, но не как единственный
стор-скриншот: Chrome, Edge и Firefox ожидают изображение фактического UI.

Chrome требует хотя бы один скриншот 1280x800 (до пяти), малую плитку 440x280
и иконку 128x128; marquee 1400x560 опционален. Edge принимает до шести
скриншотов 1280x800 или 640x480, малая и большая плитки опциональны. Firefox
рекомендует UI-скриншоты 1280x800 и не использует Chromium promo tiles.

## Privacy forms

Для Chrome и Edge консервативно отметить типы данных, которые расширение
обрабатывает даже локально:

- Web history / browsing activity — URL и origin выбранных и сохранённых сайтов;
- Website content — HTTP headers и response text проверяемого сайта;
- Authentication information — опциональный Cloudflare API token.

Указать: local processing для первых двух; Cloudflare transfer только для
явно включённой внешней проверки; 301.st ничего не получает; данные не
продаются, не используются для рекламы и не доступны человеку. Remote code:
No. Single purpose и permission justifications можно взять из
`reviewer-notes.txt`.

Firefox-манифест объявляет `required: [none]` и опциональные
`authenticationInfo`, `browsingActivity`; разрешение запрашивается перед
подключением Cloudflare.

## Официальные требования

- [Chrome listing fields and image sizes](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
- [Chrome image guidance](https://developer.chrome.com/docs/webstore/images)
- [Chrome privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Edge submission and listing fields](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
- [Firefox listing guidance and Markdown](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)
- [Firefox source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Firefox data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
