// Store-listing generator (2026-08-07).
//
// Twelve files — four languages across three stores — written from ONE source
// per language. Hand-maintaining them drifts: the Cloudflare-comparison section
// survived in all six English/Russian listings for a day after the feature was
// deleted, because six files had to be remembered separately.
//
// English and Russian are NOT generated. They were written by hand, they carry
// wording that survived store review, and regenerating them would trade a known
// text for a derived one to no benefit.
//
// It also writes a SPARSE _locales/<lang>/messages.json for each language,
// carrying only extName and extDescription. That is not UI translation: Chrome
// falls back to the default locale for every key a locale omits ("your
// extension will run no matter how sparse a translation is"). The directory has
// to exist for a different reason — the Chrome Web Store builds its
// localized-listing language menu from the _locales directories in the uploaded
// package, so without it there is nowhere to put a German listing at all.
//
// Usage: node scripts/build-listings.mjs [--check]
//   --check exits non-zero if a generated file is missing or stale.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs', 'store-listings');
const LOCALES = path.join(ROOT, 'src', 'public', '_locales');

/** Chrome's manifest description field is capped at the same 132. */
const EXT_NAME = 'Agent Readiness Inspector';

/** Chrome and Edge cap the short description; the longest here must fit. */
const SHORT_MAX = 132;

const L = {
  de: {
    locale: 'de',
    short:
      'Websites auf KI-Agenten-Tauglichkeit prüfen: robots.txt, llms.txt, Markdown-Negotiation, MCP, Content Signals.',
    lead: 'Sehen Sie, was KI-Agenten auf der aktuellen Seite wirklich finden, lesen und nutzen können.',
    body: 'Agent Readiness Inspector führt 22 standardbasierte Prüfungen direkt in Ihrem Browser aus: robots.txt und KI-Crawler-Regeln, Sitemaps, llms.txt, Markdown-Negotiation, Content Signals, Link-Header, Agent Skills, API Catalogs, MCP Server Cards, OAuth-Discovery, Web Bot Auth, WebMCP und die entstehenden Commerce-Protokolle.',
    featuresH: 'WAS SIE BEKOMMEN',
    features: [
      'Einen vergleichbaren Wert und ein Readiness-Level',
      'Den Rohbeleg zu jedem Urteil',
      'Priorisierte, kopierfertige Fix-Prompts',
      'Ein Panel, das neben dem aktuellen Tab bleibt',
      'Gespeicherte Seiten, Sammel-Rescans und Verlauf',
      'Geplante Überwachung mit lokalem Posteingang',
      'Optionale Benachrichtigungen, wenn eine Prüfung zurückfällt',
      'Optionales Score-Badge und Auto-Scan, beides in den Einstellungen',
    ],
    browserNote:
      'Weil das Audit im Browser läuft, erreicht es Staging-Seiten und viele Seiten hinter einem Login, an die ein externer Scanner nicht herankommt. Cookie-Schutz im Browser kann den Session-Zugriff auf manchen Seiten einschränken.',
    kitsH: 'REPARATUR-KITS',
    kits: 'Zu jeder fehlgeschlagenen Prüfung gehört die Behebung: was der Standard verlangt, die Änderung für den Stack, auf dem die Seite zu laufen scheint (Cloudflare, Vercel, Netlify, nginx, Next.js), und der eine Befehl, der zeigt, dass sie greift.',
    privacyH: 'DATENSCHUTZ',
    privacy:
      'Die Erweiterung verarbeitet Adressen und Antworten der Seite ausschließlich für das Audit. Ergebnisse, gespeicherte Seiten, Verlauf, Einstellungen und Meldungen bleiben im lokalen Browser-Speicher. 301.st erhält keine Scan- oder Browsing-Daten. Es gibt keine Analytics, keine Telemetrie, keine Werbung und keinen Remote-Code. Eine Prüfung liest DNS: Sie fragt einen öffentlichen DNS-over-HTTPS-Resolver, ob der geprüfte Hostname Agent-Discovery-Einträge veröffentlicht.',
    accessH: 'WARUM SEITENZUGRIFF NÖTIG IST',
    access:
      'Die Erweiterung prüft jede Seite, die Sie auswählen, und braucht dafür Zugriff auf deren Header, robots.txt, Sitemap und well-known-Ressourcen. Sie fügt den besuchten Seiten nichts hinzu.',
    disclaimer:
      'Agent Readiness Inspector ist eine unabhängige Umsetzung offener Webstandards und weder mit Cloudflare verbunden noch von Cloudflare unterstützt.',
    kitsTitle: 'Reparatur-Kits',
    privacyTitle: 'Datenschutz',
    summaryH: 'Zusammenfassung',
    descriptionH: 'Beschreibung',
  },
  es: {
    locale: 'es',
    short:
      'Audita sitios para agentes de IA: robots.txt, llms.txt, negociación Markdown, MCP, Content Signals. Local, sin analítica.',
    lead: 'Vea lo que los agentes de IA realmente pueden descubrir, leer y usar en el sitio actual.',
    body: 'Agent Readiness Inspector ejecuta 22 comprobaciones basadas en estándares dentro de su navegador: robots.txt y reglas para rastreadores de IA, sitemaps, llms.txt, negociación Markdown, Content Signals, cabeceras Link, Agent Skills, API Catalogs, MCP Server Cards, descubrimiento OAuth, Web Bot Auth, WebMCP y los protocolos de comercio emergentes.',
    featuresH: 'QUÉ OBTIENE',
    features: [
      'Una puntuación comparable y un nivel de preparación',
      'La evidencia en bruto de cada veredicto',
      'Prompts de corrección priorizados y listos para copiar',
      'Un panel que permanece junto a la pestaña actual',
      'Sitios guardados, reescaneos por lotes e historial',
      'Monitorización programada con bandeja local de avisos',
      'Notificaciones opcionales cuando una comprobación empeora',
      'Insignia de puntuación y autoescaneo opcionales, en ajustes',
    ],
    browserNote:
      'Como la auditoría se ejecuta dentro del navegador, alcanza sitios de staging y muchas páginas tras un inicio de sesión que un escáner externo no puede ver. La protección de cookies del navegador puede limitar el acceso a la sesión en algunos sitios.',
    kitsH: 'KITS DE REPARACIÓN',
    kits: 'Cada comprobación fallida viene con su arreglo: qué exige el estándar, el cambio para la plataforma en la que parece funcionar el sitio (Cloudflare, Vercel, Netlify, nginx, Next.js) y el único comando que demuestra que se aplicó.',
    privacyH: 'PRIVACIDAD',
    privacy:
      'La extensión maneja las URL y las respuestas del sitio solo para producir la auditoría. Resultados, sitios guardados, historial, ajustes y avisos permanecen en el almacenamiento local del navegador. 301.st no recibe datos de escaneo ni de navegación. No hay analítica, telemetría, publicidad ni código remoto. Una comprobación consulta DNS: pregunta a un resolutor público DNS-over-HTTPS si el dominio auditado publica registros de descubrimiento para agentes.',
    accessH: 'POR QUÉ SE NECESITA ACCESO AL SITIO',
    access:
      'La extensión audita cualquier sitio que usted elija, por lo que necesita acceso para leer sus cabeceras, robots.txt, sitemap y recursos well-known. No inyecta contenido en las páginas que visita.',
    disclaimer:
      'Agent Readiness Inspector es una implementación independiente de estándares web abiertos. No está afiliada a Cloudflare ni cuenta con su respaldo.',
    kitsTitle: 'Kits de reparación',
    privacyTitle: 'Privacidad',
    summaryH: 'Resumen',
    descriptionH: 'Descripción',
  },
  'pt-BR': {
    locale: 'pt-BR',
    short:
      'Audite sites para agentes de IA: robots.txt, llms.txt, negociação Markdown, MCP, Content Signals. Local, sem analytics.',
    lead: 'Veja o que os agentes de IA realmente conseguem descobrir, ler e usar no site atual.',
    body: 'O Agent Readiness Inspector executa 22 verificações baseadas em padrões dentro do seu navegador: robots.txt e regras para rastreadores de IA, sitemaps, llms.txt, negociação Markdown, Content Signals, cabeçalhos Link, Agent Skills, API Catalogs, MCP Server Cards, descoberta OAuth, Web Bot Auth, WebMCP e os protocolos de comércio emergentes.',
    featuresH: 'O QUE VOCÊ RECEBE',
    features: [
      'Uma pontuação comparável e um nível de prontidão',
      'A evidência bruta de cada veredicto',
      'Prompts de correção priorizados e prontos para copiar',
      'Um painel que fica ao lado da aba atual',
      'Sites salvos, rescans em lote e histórico',
      'Monitoramento agendado com caixa local de alertas',
      'Notificações opcionais quando uma verificação regride',
      'Selo de pontuação e autoescaneamento opcionais, nas configurações',
    ],
    browserNote:
      'Como a auditoria roda dentro do navegador, ela alcança sites de staging e muitas páginas atrás de login que um scanner externo não consegue ver. Proteções de cookies do navegador podem limitar o acesso à sessão em alguns sites.',
    kitsH: 'KITS DE REPARO',
    kits: 'Cada verificação reprovada vem com o conserto: o que o padrão exige, a mudança para a stack em que o site parece rodar (Cloudflare, Vercel, Netlify, nginx, Next.js) e o único comando que prova que funcionou.',
    privacyH: 'PRIVACIDADE',
    privacy:
      'A extensão manipula URLs e respostas do site apenas para produzir a auditoria. Resultados, sites salvos, histórico, configurações e alertas permanecem no armazenamento local do navegador. A 301.st não recebe dados de varredura nem de navegação. Não há analytics, telemetria, publicidade ou código remoto. Uma verificação consulta o DNS: ela pergunta a um resolvedor público DNS-over-HTTPS se o domínio auditado publica registros de descoberta para agentes.',
    accessH: 'POR QUE O ACESSO AO SITE É NECESSÁRIO',
    access:
      'A extensão audita qualquer site que você escolher, por isso precisa de acesso para ler cabeçalhos, robots.txt, sitemap e recursos well-known daquele site. Ela não injeta conteúdo nas páginas que você visita.',
    disclaimer:
      'O Agent Readiness Inspector é uma implementação independente de padrões web abertos. Não é afiliado à Cloudflare nem endossado por ela.',
    kitsTitle: 'Kits de reparo',
    privacyTitle: 'Privacidade',
    summaryH: 'Resumo',
    descriptionH: 'Descrição',
  },
  fr: {
    locale: 'fr',
    short:
      'Auditez vos sites pour les agents IA : robots.txt, llms.txt, négociation Markdown, MCP, Content Signals. Local.',
    lead: 'Voyez ce que les agents IA peuvent réellement découvrir, lire et utiliser sur le site actuel.',
    body: "Agent Readiness Inspector exécute 22 vérifications fondées sur des standards directement dans votre navigateur : robots.txt et règles pour les robots d'IA, sitemaps, llms.txt, négociation Markdown, Content Signals, en-têtes Link, Agent Skills, API Catalogs, MCP Server Cards, découverte OAuth, Web Bot Auth, WebMCP et les protocoles de commerce émergents.",
    featuresH: 'CE QUE VOUS OBTENEZ',
    features: [
      'Un score comparable et un niveau de préparation',
      'La preuve brute derrière chaque verdict',
      'Des prompts de correction hiérarchisés, prêts à copier',
      "Un panneau qui reste à côté de l'onglet courant",
      'Sites enregistrés, réanalyses par lot et historique',
      'Surveillance planifiée avec boîte locale de messages',
      'Notifications facultatives quand une vérification régresse',
      'Badge de score et analyse automatique facultatifs, dans les réglages',
    ],
    browserNote:
      "Parce que l'audit s'exécute dans le navigateur, il atteint les sites de préproduction et de nombreuses pages derrière une authentification qu'un scanner externe ne peut pas voir. Les protections anti-cookies du navigateur peuvent limiter l'accès à la session sur certains sites.",
    kitsH: 'KITS DE RÉPARATION',
    kits: "Chaque vérification en échec est accompagnée du correctif : ce qu'exige le standard, la modification pour la plateforme sur laquelle le site semble tourner (Cloudflare, Vercel, Netlify, nginx, Next.js), et la commande unique qui prouve qu'elle est en place.",
    privacyH: 'CONFIDENTIALITÉ',
    privacy:
      "L'extension traite les adresses et les réponses du site uniquement pour produire l'audit. Résultats, sites enregistrés, historique, réglages et messages restent dans le stockage local du navigateur. 301.st ne reçoit aucune donnée d'analyse ni de navigation. Il n'y a ni analytics, ni télémétrie, ni publicité, ni code distant. Une vérification interroge le DNS : elle demande à un résolveur public DNS-over-HTTPS si le domaine audité publie des enregistrements de découverte pour agents.",
    accessH: "POURQUOI L'ACCÈS AU SITE EST NÉCESSAIRE",
    access:
      "L'extension audite tout site que vous choisissez ; elle a donc besoin d'accéder à ses en-têtes, à son robots.txt, à son sitemap et à ses ressources well-known. Elle n'injecte rien dans les pages que vous visitez.",
    disclaimer:
      "Agent Readiness Inspector est une implémentation indépendante de standards ouverts du web. Elle n'est ni affiliée à Cloudflare ni approuvée par elle.",
    kitsTitle: 'Kits de réparation',
    privacyTitle: 'Confidentialité',
    summaryH: 'Résumé',
    descriptionH: 'Description',
  },
  tr: {
    locale: 'tr',
    short:
      'Siteleri yapay zekâ ajanlarına hazırlık için denetleyin: robots.txt, llms.txt, Markdown, MCP, Content Signals.',
    lead: 'Yapay zekâ ajanlarının bu sitede gerçekten neyi bulabildiğini, okuyabildiğini ve kullanabildiğini görün.',
    body: 'Agent Readiness Inspector, standartlara dayalı 22 denetimi doğrudan tarayıcınızda çalıştırır: robots.txt ve yapay zekâ tarayıcı kuralları, site haritaları, llms.txt, Markdown içerik pazarlığı, Content Signals, Link başlıkları, Agent Skills, API Catalogs, MCP Server Cards, OAuth keşfi, Web Bot Auth, WebMCP ve gelişmekte olan ticaret protokolleri.',
    featuresH: 'NELER ELDE EDERSİNİZ',
    features: [
      'Karşılaştırılabilir bir puan ve hazırlık seviyesi',
      'Her karar için ham kanıt',
      'Önceliklendirilmiş, kopyalamaya hazır düzeltme istemleri',
      'Geçerli sekmenin yanında kalan bir panel',
      'Kayıtlı siteler, toplu yeniden tarama ve puan geçmişi',
      'Yerel bildirim kutusuyla zamanlanmış izleme',
      'Bir denetim geri gittiğinde isteğe bağlı bildirimler',
      'İsteğe bağlı puan rozeti ve otomatik tarama, ayarlardan',
    ],
    browserNote:
      'Denetim tarayıcının içinde çalıştığı için, dış bir tarayıcının erişemediği staging sitelerine ve oturum arkasındaki birçok sayfaya ulaşır. Tarayıcının çerez korumaları bazı sitelerde oturum erişimini sınırlayabilir.',
    kitsH: 'ONARIM KİTLERİ',
    kits: 'Başarısız her denetim düzeltmesiyle birlikte gelir: standardın ne istediği, sitenin üzerinde çalıştığı görünen altyapı için gereken değişiklik (Cloudflare, Vercel, Netlify, nginx, Next.js) ve düzeltmenin işe yaradığını kanıtlayan tek komut.',
    privacyH: 'GİZLİLİK',
    privacy:
      'Uzantı, site adreslerini ve yanıtlarını yalnızca denetimi üretmek için işler. Sonuçlar, kayıtlı siteler, geçmiş, ayarlar ve bildirimler tarayıcının yerel deposunda kalır. 301.st hiçbir tarama veya gezinme verisi almaz. Analitik, telemetri, reklam veya uzak kod yoktur. Bir denetim DNS okur: denetlenen alan adının ajan keşif kayıtları yayımlayıp yayımlamadığını açık bir DNS-over-HTTPS çözücüsüne sorar.',
    accessH: 'SİTE ERİŞİMİ NEDEN GEREKLİ',
    access:
      'Uzantı seçtiğiniz her siteyi denetler; bunun için o sitenin başlıklarına, robots.txt, site haritası ve well-known kaynaklarına erişmesi gerekir. Ziyaret ettiğiniz sayfalara hiçbir içerik eklemez.',
    disclaimer:
      'Agent Readiness Inspector, açık web standartlarının bağımsız bir uygulamasıdır. Cloudflare ile bağlantılı değildir ve Cloudflare tarafından onaylanmamıştır.',
    kitsTitle: 'Onarım kitleri',
    privacyTitle: 'Gizlilik',
    summaryH: 'Özet',
    descriptionH: 'Açıklama',
  },
};

// Headings are spelled out per language rather than derived from the SHOUTED
// .txt ones by lower-casing. That trick produced "Reparatur-kits" — German
// capitalises nouns, and every such rule has a language that breaks it.
const TITLE = 'Agent Readiness Inspector';

function chromeText(t) {
  return `TITLE
${TITLE}

SHORT DESCRIPTION
${t.short}

DETAILED DESCRIPTION
${t.lead}

${t.body}

${t.featuresH}

${t.features.map((f) => `- ${f}`).join('\n')}

${t.browserNote}

${t.kitsH}

${t.kits}

${t.privacyH}

${t.privacy}

${t.accessH}

${t.access}

${t.disclaimer}
`;
}

function firefoxMarkdown(t) {
  return `# ${TITLE}

## ${t.summaryH}

${t.short}

## ${t.descriptionH}

**${t.lead}**

${t.body}

${t.features.map((f) => `- ${f}`).join('\n')}

${t.browserNote}

### ${t.kitsTitle}

${t.kits}

### ${t.privacyTitle}

${t.privacy}

${t.access}

${t.disclaimer}
`;
}

/** Only the two keys the manifest interpolates; everything else falls back. */
function sparseMessages(t) {
  return `${JSON.stringify(
    {
      extName: { message: EXT_NAME },
      extDescription: { message: t.short },
    },
    null,
    '	',
  )}
`;
}

const targets = [
  { dir: 'chrome', ext: 'txt', render: chromeText },
  { dir: 'edge', ext: 'txt', render: chromeText },
  { dir: 'firefox', ext: 'md', render: firefoxMarkdown },
];

const check = process.argv.includes('--check');
let problems = 0;
let written = 0;

for (const [lang, t] of Object.entries(L)) {
  if (t.short.length > SHORT_MAX) {
    console.error(`[listings] ${lang}: short description is ${t.short.length} chars, limit ${SHORT_MAX}`);
    problems += 1;
  }
  for (const target of targets) {
    const file = path.join(OUT, target.dir, `${lang}.${target.ext}`);
    const content = target.render(t);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (check) {
      if (current !== content) {
        console.error(`[listings] stale or missing: ${path.relative(ROOT, file)}`);
        problems += 1;
      }
      continue;
    }
    if (current !== content) {
      fs.writeFileSync(file, content, 'utf8');
      written += 1;
    }
  }

  // Chrome's _locales directories use an UNDERSCORE for the region — pt_BR, not
  // pt-BR. A hyphenated directory is simply not found, so the locale silently
  // does not exist and its listing language never appears. The listing FILES
  // keep the hyphen, because that is how the stores spell the language.
  const localeFile = path.join(LOCALES, lang.replace('-', '_'), 'messages.json');
  const localeContent = sparseMessages(t);
  const currentLocale = fs.existsSync(localeFile) ? fs.readFileSync(localeFile, 'utf8') : null;
  if (check) {
    if (currentLocale !== localeContent) {
      console.error(`[listings] stale or missing: ${path.relative(ROOT, localeFile)}`);
      problems += 1;
    }
  } else if (currentLocale !== localeContent) {
    fs.mkdirSync(path.dirname(localeFile), { recursive: true });
    fs.writeFileSync(localeFile, localeContent, 'utf8');
    written += 1;
  }
}

if (problems > 0) process.exit(1);
console.log(
  check
    ? `[listings] ${Object.keys(L).length} generated locale(s) are current`
    : `[listings] ${written} file(s) written for ${Object.keys(L).join(', ')}`,
);
