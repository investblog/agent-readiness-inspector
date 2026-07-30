# Branding — Agent Readiness Inspector

Сведение трёх исследований 2026-07-30: боли пользователей (HN/Reddit/X, verbatim),
терминологическое поле + CWS-SEO, веттинг имени. Источники — в отчётах агентов;
ключевые процитированы по месту.

## 1. Имя (решено)

**Agent Readiness Inspector** (решение юзера 2026-07-30). Веттинг: точных
коллизий нет; «Agent Readiness» — генерик (SEL, Microsoft, Factory, Chrome
«agent-ready toolkit»), в трейдмарках Cloudflare отсутствует, следов USPTO нет;
пара к Redirect Inspector в портфеле 301.st.

**Табу:** «Agent Readiness Score» как имя собственное; слоган «Is it agent
ready»; Cloudflare — только в форме «covers the same checks as Cloudflare's
methodology», в описании, не в тайтле.

## 2. Главная боль → позиционирование

Кластеры болей по остроте/монетизации:
- (a) visibility «AI меня не цитирует» — богатый ($100–4000/мес: Profound,
  PeecAI), но там толпа GEO-вендоров, меряющих упоминания бренда;
- (b) blocking «боты долбят сайт» — самый громкий (HN-треды 600–700 pts), но
  решается бесплатно, платить не склонны;
- **(c) diagnostics «я не знаю, что AI видит» — наша боль.** Наименее закрыта:
  ~30% сайтов банят GPTBot «often without the owner knowing» (аудит 1500
  сайтов); скор CF начисляет баллы за robots-правила, «even though those rules
  are complete bans»; официальный способ проверки — «look at your server logs»
  (Mueller), маркетологу недоступен;
- (d) confusion «стандарты движутся» — питает спрос на объяснения и рецепты;
- (e) score-хайп «поднять с 3 до 100» — свежий крючок, живёт с апреля 2026.

**Позиционирование: рентген сайта для AI-агентов.** «Узнай, что агенты реально
видят и могут сделать на твоём сайте — включая страницы за логином — с evidence
по каждой пробе, рецептами починки и алертами, когда что-то меняется».

**Критично: нейтральность инструмента.** Полярность реальна — половина HN
гордится нулевым скором («My blog just scored zero! I don't think I will fix
it»). Диагностика нужна ОБОИМ лагерям: «пускать или банить — решай сам, но
осознанно». Никогда не морализируем «вы обязаны быть agent-ready» — это
удваивает аудиторию (blockers тоже юзеры: им нужен pass на «мои баны работают»).

## 3. Язык аудитории (частотность в живой речи)

1. «AI crawler» / «AI bots» — лидер у devs; 2. «llms.txt» — самый частый
артефакт; 3. «AI SEO»/«LLM SEO» — разговорный дефолт r/SEO; 4. «GEO» — язык
профессионалов (~59% SEO-инфлюенсеров); 5. «AI visibility» — язык вендоров;
6. «AEO»; 7. «agent readiness» — юзеры набирают только в связке со скором CF.

Следствие: **имя ловит скор-трафик, дескриптор и описание говорят словами
юзеров** (AI agent, llms.txt, robots.txt, AI crawler), «GEO» — второй слой в
long description, «AI visibility» не наш кластер (перенаселён, другой смысл).

## 4. Стор-листинг (CWS)

- Тайтл (≤75, реально видно ~40 — фронт-лоадим): рекомендация
  **«Agent Readiness Inspector — AI Agent, llms.txt & robots.txt Checker»** (68);
  запасной с акцентом на диф: «Agent Readiness Inspector — AI Site Checker,
  Monitoring & Alerts».
- Short description (≤132): **«Check what AI agents really see on your site —
  llms.txt, robots.txt, MCP, Content Signals. Score, monitoring & fix
  recipes.»**
- Long description, secondary keywords: GEO (generative engine optimization),
  AEO, AI crawlability, llms.txt/llms-full.txt validator, AI bots (GPTBot,
  ClaudeBot, PerplexityBot, Google-Extended), MCP / WebMCP, Content Signals,
  markdown for agents, «covers the same checks as Cloudflare's Agent Readiness
  methodology» (одно упоминание), monitoring, regression alerts, fix prompts,
  works behind login, zero telemetry.
- Факты рынка под этим: CWS-ниша «agent readiness» почти пуста (лидер Glippy —
  2000 юзеров на дистрибуции автора; остальные 3–45), keyword-тайтлы бьют
  бренды («LLMs.txt Checker» 1000 vs чистые бренды 3–25); в Google SERP по
  «agent readiness checker» нет ни одного расширения.

## 5. Сообщения по персонам

- **SEO/агентство** (бюджет, язык GEO): «скор как у Cloudflare + история по
  клиентским сайтам + отчёт с evidence» — батч, таймлайны, share.
- **Indie dev / self-hoster** (язык HN, часто anti-AI): «проверь, что твои баны
  реально работают, и что боты видят несмотря на них» + zero-telemetry как
  ценность.
- **SaaS/интранет за логином** (незанятая поляна, явных конкурентов ноль):
  «единственный тул, который видит то же, что и ты — за логином и на
  стейджинге». Оговорка про 3P-cookies — честно в UI (§11 спеки).

## 6. Чего НЕ говорить

- Не обещать «llms.txt поднимет AI-трафик» (Ahrefs: 97% файлов без единого
  запроса; Google его игнорирует) — мы показываем факт наличия, не продаём миф.
- Не «инструмент для прохождения скора Cloudflare» — мы независимая реализация
  открытых стандартов (§1 спеки), скор — совместимая метрика.
- Не морализировать про обязательность agent-ready (см. нейтральность, §2).
- Маркетинг-факт для лендинга/блога (из drift-watch CI): «даже UI и API
  Cloudflare спорят об уровне — мы показываем evidence каждой пробы».
