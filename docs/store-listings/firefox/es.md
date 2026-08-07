# Agent Readiness Inspector

## Resumen

Audita sitios para agentes de IA: robots.txt, llms.txt, negociación Markdown, MCP, Content Signals. Local, sin analítica.

## Descripción

**Vea lo que los agentes de IA realmente pueden descubrir, leer y usar en el sitio actual.**

Agent Readiness Inspector ejecuta 22 comprobaciones basadas en estándares dentro de su navegador: robots.txt y reglas para rastreadores de IA, sitemaps, llms.txt, negociación Markdown, Content Signals, cabeceras Link, Agent Skills, API Catalogs, MCP Server Cards, descubrimiento OAuth, Web Bot Auth, WebMCP y los protocolos de comercio emergentes.

- Una puntuación comparable y un nivel de preparación
- La evidencia en bruto de cada veredicto
- Prompts de corrección priorizados y listos para copiar
- Un panel que permanece junto a la pestaña actual
- Sitios guardados, reescaneos por lotes e historial
- Monitorización programada con bandeja local de avisos
- Notificaciones opcionales cuando una comprobación empeora
- Insignia de puntuación y autoescaneo opcionales, en ajustes

Como la auditoría se ejecuta dentro del navegador, alcanza sitios de staging y muchas páginas tras un inicio de sesión que un escáner externo no puede ver. La protección de cookies del navegador puede limitar el acceso a la sesión en algunos sitios.

### Kits de reparación

Cada comprobación fallida viene con su arreglo: qué exige el estándar, el cambio para la plataforma en la que parece funcionar el sitio (Cloudflare, Vercel, Netlify, nginx, Next.js) y el único comando que demuestra que se aplicó.

### Privacidad

La extensión maneja las URL y las respuestas del sitio solo para producir la auditoría. Resultados, sitios guardados, historial, ajustes y avisos permanecen en el almacenamiento local del navegador. 301.st no recibe datos de escaneo ni de navegación. No hay analítica, telemetría, publicidad ni código remoto. Una comprobación consulta DNS: pregunta a un resolutor público DNS-over-HTTPS si el dominio auditado publica registros de descubrimiento para agentes.

La extensión audita cualquier sitio que usted elija, por lo que necesita acceso para leer sus cabeceras, robots.txt, sitemap y recursos well-known. No inyecta contenido en las páginas que visita.

Agent Readiness Inspector es una implementación independiente de estándares web abiertos. No está afiliada a Cloudflare ni cuenta con su respaldo.
