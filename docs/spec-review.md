# Ревью черновика спеки — фактчек 2026-07-30

Проверка `docs/spec.md` против первоисточников: блог/доки Cloudflare, живой
isitagentready.com (включая его JS-бандл и `/api/scan`), IETF/IANA, доки Chrome/MDN,
сторы расширений, плюс живые curl-пробы (spintax.net, github.com, vercel.com,
cloudflare.com). Вердикт: **направление верное, но в спеке есть фактические ошибки
в скоринге и матрице проверок, наивные pass-критерии и два техрискa, которые надо
решить до M0.**

---

## 1. Что спека утверждает неверно

### 1.1 Скоринг (§4) — имена уровней не те; композит есть
Спека: «композитный 0–100 + уровень (напр. Basic/Emerging/Advanced)».
Факт: уровни — **0–5 с другими именами**:
`0 Not Ready → 1 Basic Web Presence → 2 Bot-Aware → 3 Agent-Readable →
4 Agent-Integrated → 5 Agent-Native`. Проценты 0–100 — **по категориям**
(равные веса внутри категории, neutral исключается из знаменателя — подтверждено
кодом бандла). Опубликованных весов нет; в URL Scanner-дашборде — шесть суб-скоров.

*Уточнение по скрину web-UI (2026-07-30, spintax.net):* композит 0–100 в UI
**есть** (первоначальная версия этого ревью это отрицала — слишком категорично,
вывод делался по бандлу/API). Наблюдаемая формула: чек-взвешенное отношение
пройденных к применимым (11/14 = 79 при категориях 100/100/100/57), не среднее
категорий. Тот же скрин: **web-UI и `/api/scan` расходятся** (79/Level 5 против
Level 4 на одном сайте в один день) — калибруемся по web-UI, зафиксировано в §4
спеки.

### 1.2 Матрица (§3) устарела относительно живого тула
Блог-версия (17.04.2026) совпадает со спекой, но живой тул на 30.07.2026 уже другой:
- **llms.txt из тула убран полностью** (нет ни чекбокса, ни ключа проверки).
- Добавлены: **DNS-AID** (Discoverability), **OAuth Protected Resource** (отдельная
  проверка), **Auth.md**, **A2A Agent Card** (off by default).
- Commerce теперь: x402, UCP, ACP + **MPP и AP2**.
Матрица движется — нужен механизм версионирования чек-листа, а не зашитый список.

### 1.3 MCP Server Card — оба пути из спеки не канон
SEP-2127 (v2, открытый драфт): канонический путь **`/.well-known/mcp/server-card`**
(без .json), мульти-сервер — `/.well-known/mcp/catalog.json`; v1-путь
`/.well-known/mcp-server-card` должен 301-ить. `/.well-known/mcp.json` — ранняя
community-конвенция, спекой не принята, но **де-факто живёт**: spintax.net и
cloudflare.com отдают её 200 (живая проба), а `mcp/server-card.json` у обоих 404.
Пробить надо все четыре пути, приоритет: `mcp/server-card` → `mcp-server-card` →
`mcp/catalog.json` → `mcp.json` (пометить как legacy).

### 1.4 robots.txt — «200 + непустой» неверен как pass-критерий
По RFC 9309 пустой 200 — валидный allow-all; 4xx — тоже валидный allow-all;
5xx — full disallow. «Непустой» ловит не то. Правильнее: pass = 200 + парсится;
пустой/404 — информационный статус «нет директив», не fail.

### 1.5 Web Bot Auth — проверка не для обычных сайтов
`/.well-known/http-message-signatures-directory` публикует **оператор бота**
(JWKS-директория подписей), а не аудируемый сайт. Для обычного сайта проба почти
всегда 404 (у «эталонного» spintax.net — 404). Надо посмотреть, что именно
скорит Cloudflare (вероятно, поддержку верификации входящих ботов), либо честно
пометить проверку как «для agent-origin сайтов» / N/A.

### 1.6 spintax.net — не «пример 100/100» (§9)
Живая проба: markdown-негошиэйшн ✅ (`text/markdown` + `Vary: Accept`), llms.txt ✅,
`mcp.json` ✅, agent-skills index ✅, Content Signals ✅ — но `api-catalog` 404,
`mcp/server-card` 404, Web Bot Auth 404. Кнопку «эталон» формулировать как
«живой пример стандартов», не «100/100», либо сначала докрутить сам spintax.

### 1.7 Мелочи
- Markdown-негошиэйшн — конвенция Cloudflare «Markdown for Agents» (12.02.2026),
  а `.md`-суффикс — отдельная конвенция Mintlify. Это две независимые пробы.
- llms-full.txt — де-факто имя, в спеке llmstxt.org формально `llms-ctx-full.txt`.
- API Catalog: pass — не просто 200, а `application/linkset+json` (RFC 9264),
  пробовать с `Accept: application/linkset+json`, редиректы разрешены.
- OAuth: для ресурсов с путями суффикс well-known вставляется ПЕРЕД путём
  (`/.well-known/oauth-protected-resource/mcp`); стоит добавить и
  `openid-configuration` как распространённого родственника.

## 2. Что подтвердилось

- isitagentready.com — тул Cloudflare, запуск 17.04.2026 (Agents Week), с 12.05.2026
  встроен в дашборд URL Scanner.
- Четыре скоримых измерения + нескоримый Commerce; neutral вне знаменателя.
- Фикс-промпты на каждый fail — есть; причём Cloudflare раздаёт их ещё и как
  **SKILL.md** (`skillUrl` в ответе API, `/.well-known/agent-skills/<check>/SKILL.md`).
- **URL Scanner API: `agentReadiness: true`** в `options`,
  `POST /accounts/{id}/urlscanner/v2/scan`; free-tier 5000 сканов/мес, 1 скан/10с.
- Статистика адопшна (78% / 4% / 3.9% / <15 сайтов) — дословно из блога, методика
  «топ-200k доменов Radar минус нерелевантные категории».
- Все стандарты матрицы реальны; зрелость разная: IANA-registered только
  api-catalog и оба OAuth; Web Bot Auth — активный IETF-драфт; agent-skills
  (RFC Cloudflare v0.2.0), UCP (`/.well-known/ucp` — чистая проба), x402,
  llms.txt — вендорские/community конвенции. В UI нужна метка зрелости.
- Content Signals: `Content-Signal: search=yes, ai-train=no` в robots.txt
  + одноимённый HTTP-заголовок (Cloudflare его шлёт при markdown-negotiation).
- Список AI-ботов: зеркалить https://github.com/ai-robots-txt/ai.robots.txt (JSON)
  + вендорская шестёрка (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot,
  Google-Extended, Meta-ExternalAgent).

## 3. Техническая реализуемость (MV3) — работает, с тремя оговорками

**Ядро работает:** fetch из service worker с host_permissions обходит CORS, все
заголовки (Link, Vary, Content-Signal) и тела читаемы; `credentials: 'include'`
шлёт куки таргета, SameSite=Strict в Chrome трактуется как same-site при наличии
host permission. ORB не мешает. Alarms (мин ~30с–1мин) и notifications (без
жеста, но `iconUrl` обязателен) — ок для watch-режима.

**Оговорка A — «за логином» хрупче, чем звучит в §11.** Если у юзера включена
блокировка third-party cookies в Chrome, куки к extension-fetch **не прикрепятся**
— фича молча деградирует. В Firefox правило same-site для расширений не
подтверждено (+ Total Cookie Protection). Маркетинговую формулировку смягчить,
в UI детектить и показывать «сканирую без сессии».

**Оговорка B — «что реально отдалось пользователю» (§5) — только через
webRequest-кэш.** Ретроспективно заголовки вкладки не достать: нужен
observational `webRequest.onHeadersReceived` (регистрация на верхнем уровне SW,
события во сне воркера теряются) + кэш в storage.session + фолбэк на рефетч,
и UI обязан различать «наблюдённое» и «перефетченное». Плюс `Set-Cookie` из
fetch не виден никогда (forbidden header) — если нужен, только webRequest
`extraHeaders`.

**Оговорка C — host permissions.** *(Superseded 2026-07-30: принят путь RI —
required `<all_urls>`, rationale в §10 спеки: кросс-доменные пробы/батч/watch —
core functionality, не optional feature. Абзац ниже остаётся как зафиксированный
риск ревью и конверсии, не как действующая рекомендация.)*
Рекомендованный паттерн 2026: **`activeTab` + `scripting` для скана текущей
вкладки; широкие хосты — в `optional_host_permissions`** по явному
`permissions.request()` для батча/watch. Требуемый `<all_urls>` = in-depth review
(1–4 недели) и просадка конверсии установок. Заодно: батч-сканы дробить под
5-минутный кап события SW, таймаут пробы держать <30с (иначе воркер умирает).

**WebMCP:** это наш уникальный чек (снаружи не детектится), но дорогой: нужен
MAIN-world content script (мостик postMessage), API переехал на
`document.modelContext` (21.07.2026, Chrome 149–156 origin trial, `navigator.*`
деприкейтится), детект полифилла `@mcp-b` отдельно, поздние регистрации тулов
ловить наблюдателем. Отсутствие API в браузере юзера ≠ «сайт не готов» —
статус «not detectable», не fail.

## 4. Рынок — ниша пустая, но спрос пока крошечный

- **Пусто (подтверждено):** ни одно расширение не зеркалит скор Cloudflare; никто
  не проверяет Content Signals/MCP-карты/api-catalog набором; мониторинга во
  времени в расширениях нет вообще; авто-фикса через Cloudflare API нет нигде.
- **Занято слабо:** llms.txt-бейджики (лидер ~1000 юзеров), веб-скореры
  (AgentScore: $29/мес за мониторинг; areweagentready.com — трекинг скора),
  WebMCP Validator (45 юзеров), WordPress-плагин AJ Agent Crawl Optimizer —
  зеркалит 21 проверку CF и чинит 9 в один клик (10 установок) — концепт M4
  подтверждён, исполнение чужое слабое.
- **Риски сверху и по спросу:** суммарно ~1200 установок на всю категорию;
  Cloudflare уже встроил скор в свой дашборд и **раздаёт бесплатный MCP-эндпоинт
  `scan_site` на isitagentready.com**; Ahrefs: 97% llms.txt-файлов не получили ни
  одного запроса, 21.7% трафика к ним — SEO-аудиторы; Google (Mueller): Content
  Signals «no effects», llms.txt игнорируется. Категория едет на хайпе скора
  Cloudflare (апрель–июль 2026), а не на доказанной пользе.
- SEO-суиты (Screaming Frog, Semrush, Ahrefs) матрицу CF не реплицируют — окно
  открыто, но, вероятно, ненадолго.

## 5. Вопросы на обсуждение (черновик решений)

| # | Вопрос | Моя рекомендация |
|---|--------|------------------|
| 1 | Шкала | Зеркалить web-UI CF целиком: композит 0–100 (чек-взвешенный, 11/14→79) + уровень 0–5 + проценты категорий. Калибровка по web-UI, не по `/api/scan` (они расходятся — см. §1.1) |
| 2 | Матрица v2 | Принять текущий список CF (DNS-AID, Auth.md, OAuth PR, A2A off, MPP/AP2); llms.txt оставить info-проверкой вне скора; чек-лист версионировать в конфиге |
| 3 | Permissions | **Решено (юзер, 2026-07-30): путь RI** — install-time `storage`+`alarms`+`<all_urls>`, notifications optional по жесту (новости 301.sh + watch-алерты), остальное — вместе с фичей. In-depth review из-за `<all_urls>` принимаем как цену ядра продукта |
| 4 | «За логином» | Оставить как диф, но с детектом блокировки 3P-cookies и честным индикатором; протестить Firefox эмпирически |
| 5 | Второй скор | Официальный URL Scanner API (токен юзера, 5k/мес free). Неофициальный `/api/scan` isitagentready — только для внутренней калибровки тестов, не в прод |
| 6 | WebMCP | Делать (уникальный in-browser чек), но в M1+ и как «detected/not detectable», не pass/fail |
| 7 | Фикс-промпты | Свои в бандле, ключ = check.id; формат совместимый со SKILL.md CF; не хотлинкать их контент (бренд-риск) |
| 8 | Скорость | Окно закрывается — резать скоуп в пользу M0+M1 быстро; мониторинг (M3) — главный незанятый диф, поднять приоритет относительно M2-дашборда? |

## 6. Что править в спеке после обсуждения

§3 (матрица + pass-критерии + колонка «зрелость» + анти-soft-404 критерии),
§4 (шкала 0–5), §5 (probe-layer: webRequest-кэш vs рефетч, лимиты SW),
§9 (формулировка про spintax), §10 (activeTab-паттерн), §11 (честная строка про
3P-cookies), §12 (приоритет M3?), §13 (закрыть решённые вопросы).

---
*Источники — в отчётах четырёх research-агентов (Cloudflare-тул, стандарты, MV3,
рынок); ключевые: blog.cloudflare.com/agent-readiness, developers.cloudflare.com
(markdown-for-agents, url-scanner, scan-limits), SEP-2127, RFC 9309/9727/8414/9728,
contentsignals.org, llmstxt.org, webmachinelearning.github.io/webmcp, ucp.dev,
developer.chrome.com (network-requests, storage-and-cookies, service-workers,
webRequest, permissions), extensionworkshop.com. Живые пробы: spintax.net,
github.com, vercel.com, cloudflare.com (2026-07-30).*
