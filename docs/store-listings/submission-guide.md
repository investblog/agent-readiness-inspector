# Подготовка листингов

Актуально на 2026-08-02. Канонический privacy URL после первого успешного
Pages deploy:

`https://investblog.github.io/agent-readiness-inspector/privacy/`

Резервная ссылка, работающая без GitHub Pages:

`https://github.com/investblog/agent-readiness-inspector/blob/main/docs/privacy-policy.md`

**Текущий статус:** `v0.1.0` подан вручную во все три стора из GitHub Release;
Chrome, Firefox AMO и Edge находятся на ревью. Повторно пакет с тем же номером
версии не загружать. Публичные URL листингов добавить после решений сторов.

## Что загружать

| Стор | Пакет | Текст |
|---|---|---|
| Chrome Web Store | `dist/agent-readiness-inspector-0.1.0-chrome.zip` | `chrome/{en,ru}.txt` |
| Microsoft Edge Add-ons | `dist/agent-readiness-inspector-0.1.0-edge.zip` | `edge/{en,ru}.txt` |
| Firefox Add-ons (AMO) | `dist/agent-readiness-inspector-0.1.0-firefox.zip` | `firefox/{en,ru}.md` |
| Firefox source review | `dist/agent-readiness-inspector-0.1.0-sources.zip` | build-инструкция внутри: `AMO_BUILD.md` |

## Ловушка: холостой прогон НЕ проверяет Edge

`dry_run=true` даёт ложную уверенность по Edge. В библиотеке `getToken()` для
Edge не делает сетевого запроса вообще — просто заворачивает API-ключ в объект,
— а холостой режим завершается сразу после него. Строка «Getting authorization
token» в логе ничего не доказывает.

Для Chrome холостой прогон осмысленнее: там `getToken()` реально ходит за
OAuth-токеном, то есть три креда из четырёх проверяются.

Вывод: единственная настоящая проверка Edge-кредов — боевой запуск. Делать его
с `hold=true`, тогда цена ошибки — сообщение в логе, а не публикация.

## Порядок публикации

**Пакет в магазин уходит только из CI.** Локальный ZIP не заливаем никогда:
рабочая копия — Windows (CRLF, разделители путей, локале-зависимые утилиты), а
магазинный пакет никто не перечитывает перед тем, как он дойдёт до людей. Плюс в
CI отрабатывает весь гейт, и ошибка ловится, пока она бесплатна.

Порядок для релиза, который меняет описания или добавляет локали:

1. `Cut release` с `submit=none` — тег и GitHub Release с тремя ZIP, наружу
   ничего не уходит.
2. `Submit to stores`: `stores=chrome-edge`, **`hold=true`**. Пакеты ложатся
   черновиками, публикация не запускается.
3. В кабинетах Chrome и Edge заполнить описания по языкам и опубликовать руками.
4. Firefox — **последним**, отдельным запуском `stores=firefox`. У AMO
   состояния «черновик» нет, а номер версии сжигается навсегда, даже если релиз
   потом отозвать.

Почему именно такой порядок, а не «опубликовать и потом дописать локали»: Chrome
показывает язык листинга только если в **загруженном** пакете есть
соответствующий каталог `_locales`. До загрузки нового пакета немецкого описания
просто некуда вписать.

`hold` действует на Chrome и Edge; джоба Firefox его игнорирует — там
останавливаться негде.

## Локали

Набор языков — **тот же, что у `redirect-inspector`**: `de en es fr pt_BR ru tr`.
Флот уже сделал эту ставку, и расходиться без причины смысла нет.

**Полностью переведён интерфейс только на `en` и `ru`.** Для остальных пяти в
пакете лежат **разрежённые локали** — только `extName` и `extDescription`;
прочие 136 строк падают в английский по штатному фолбэку.

Здесь мы **сознательно расходимся с RI**: у него все 106 строк переведены во
всех семи локалях. Разница в аудитории — RI отлаживает ссылки для кого угодно,
этот инструмент читают разработчики и SEO, которым английский интерфейс привычен.
Пересмотреть, когда установки покажут язык.

Каталоги `_locales` именуются **через подчёркивание**: `pt_BR`, не `pt-BR`.
Дефисный каталог Chrome просто не находит — локаль молча не существует, и её
язык не появляется в кабинете. Файлы листингов при этом остаются с дефисом,
потому что так язык пишут сами магазины.

Так сделано не из экономии, а потому что иначе описания на этих языках некуда
подать. Chrome Web Store строит список языков листинга из каталогов `_locales`
загруженного пакета — дословно: «Each item in the list corresponds to one of the
`_locales/LOCALE_CODE` directories that you uploaded». Без каталога немецкого
листинга просто не существует.

Разрежённость безопасна и задокументирована обоими вендорами. Chrome: «As long
as the default locale's `messages.json` file has a value for every string, your
extension or app will run no matter how sparse a translation is». Firefox ищет
по цепочке locale → без региона → `default_locale`.

Следствие, которое надо принимать осознанно: у немецкого пользователя **имя и
описание будут немецкими, а интерфейс английским**. Это и есть выбранный размен
— описание двигает поиск в магазине и платится один раз, интерфейс стоит 136
строк навсегда, умноженных на каждую новую надпись. Переводить интерфейс —
когда установки покажут язык, а не раньше.

Английские и русские тексты написаны руками. Остальные четыре **генерируются**:

```
node scripts/build-listings.mjs          # переписать
node scripts/build-listings.mjs --check  # упасть, если правили руками (в npm run check)
```

Генератор пишет и тексты листингов, и разрежённые `_locales`. Правку делать в
`scripts/build-listings.mjs`, а не в готовых файлах: гейт качества такую правку
роняет. Причина генератора — шесть английских и русских
листингов сутки описывали удалённую функцию, потому что помнить нужно было про
каждый отдельно.

Коды локалей в сторах не совпадают, при загрузке выбирать так:

| Наш файл | Chrome Web Store | Edge | AMO |
|---|---|---|---|
| `de` | German | German | `de` |
| `tr` | Turkish | Turkish | `tr` |
| `es` | Spanish | Spanish (Spain) | `es-ES` |
| `pt-BR` | Portuguese (Brazil) | Portuguese (Brazil) | `pt-BR` |
| `fr` | French | French | `fr` |

Короткое описание Chrome и Edge — не длиннее 132 символов; генератор проверяет
это сам. Edge требует описание и логотип для каждой **заявленной** локали, так
что лишние языки там добавляют работы, а не только охвата.

**Не проверено носителями.** Четыре перевода написаны без ревью носителем
языка. Для магазинного описания это обычно приемлемо, но если есть кому
показать — стоит показать до подачи, а не после.

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

Семь кредов аккаунтные и общие со всеми расширениями investblog; различаются
только три идентификатора. **Все три проставлены 06.08.2026** — ждать одобрения
стора для этого не нужно, идентификаторы выдаются при заведении submission:

| Секрет | Значение | Источник |
|---|---|---|
| `CHROME_EXTENSION_ID` | `diofmjhnegmcccocikabageabmaokobd` | адрес листинга в Chrome Web Store |
| `FIREFOX_EXTENSION_ID` | `agent-readiness-inspector@301.st` | `gecko.id` из `wxt.config.ts` |
| `EDGE_PRODUCT_ID` | `35642ed3-dd11-41fc-bbe4-b1897972ec87` | Partner Center → Extension identity → **Product ID** |

**У Edge на странице три идентификатора, и нужен не тот, который выглядит
главным.** Store ID (`0RDCKD4NX0H3`) и CRX ID (`jkhmlkoehfmmpgihkknnopanjcipmiho`)
к API отношения не имеют: `publish-browser-extension` строит
`https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions`,
то есть в секрет идёт **Product ID** — GUID.

CRX ID пригодится позже, для другого: из него собирается адрес листинга,
`https://microsoftedge.microsoft.com/addons/detail/jkhmlkoehfmmpgihkknnopanjcipmiho`.
В `store-links.ts` его вписывать рано — до публикации по этому адресу отдаётся
пустая оболочка. Причём **с кодом 200**, как и у опубликованного расширения, так
что проверять надо содержимое: у живого листинга имя расширения есть в HTML, у
неопубликованного нет.

**Почему у Firefox именно GUID.** Документация wxt переменную перечисляет, но
не говорит, что в неё класть. Значение прослеживается по коду: `wxt submit`
вызывает `publish-browser-extension`, который строит
`https://addons.mozilla.org/api/v5/addons/addon/${extensionId}/versions/`, а
AMO описывает этот сегмент пути как `(int:id | string:slug | string:guid)` —
годятся все три формы. Берём GUID (`gecko.id`), потому что он зафиксирован в
нашем же манифесте и не может разъехаться, тогда как slug на AMO переименовуем.
В терминах Mozilla это **GUID**, не UUID — по слову «UUID» документация не
ищется.

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
- Website content — HTTP headers и response text проверяемого сайта.

Authentication information из списка **убрано в v0.1.1**: токен хранить больше
негде и незачем, сравнение через Cloudflare удалено.

Указать: всё обрабатывается локально; 301.st ничего не получает; данные не
продаются, не используются для рекламы и не доступны человеку. Единственные
исходящие запросы, кроме самого проверяемого сайта, — DNS-over-HTTPS к
`cloudflare-dns.com` для проверки DNS-AID и, если пользователь включил новости,
публичный JSON-фид 301.sh. Remote code: No. Single purpose и permission
justifications можно взять из `reviewer-notes.txt`.

Firefox-манифест объявляет `required: [none]` и **ничего опционального**:
`authenticationInfo` и `browsingActivity` убраны в v0.1.1 вместе со сравнением
через Cloudflare, ради которого они и существовали. Расширение не декларирует
сбор данных вовсе.

## Официальные требования

- [Chrome listing fields and image sizes](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
- [Chrome image guidance](https://developer.chrome.com/docs/webstore/images)
- [Chrome privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Edge submission and listing fields](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
- [Firefox listing guidance and Markdown](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)
- [Firefox source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Firefox data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
