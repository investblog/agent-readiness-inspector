# Agent Readiness Inspector

## Résumé

Auditez vos sites pour les agents IA : robots.txt, llms.txt, négociation Markdown, MCP, Content Signals. Local.

## Description

**Voyez ce que les agents IA peuvent réellement découvrir, lire et utiliser sur le site actuel.**

Agent Readiness Inspector exécute 22 vérifications fondées sur des standards directement dans votre navigateur : robots.txt et règles pour les robots d'IA, sitemaps, llms.txt, négociation Markdown, Content Signals, en-têtes Link, Agent Skills, API Catalogs, MCP Server Cards, découverte OAuth, Web Bot Auth, WebMCP et les protocoles de commerce émergents.

- Un score comparable et un niveau de préparation
- La preuve brute derrière chaque verdict
- Des prompts de correction hiérarchisés, prêts à copier
- Un panneau qui reste à côté de l'onglet courant
- Sites enregistrés, réanalyses par lot et historique
- Surveillance planifiée avec boîte locale de messages
- Notifications facultatives quand une vérification régresse
- Badge de score et analyse automatique facultatifs, dans les réglages

Parce que l'audit s'exécute dans le navigateur, il atteint les sites de préproduction et de nombreuses pages derrière une authentification qu'un scanner externe ne peut pas voir. Les protections anti-cookies du navigateur peuvent limiter l'accès à la session sur certains sites.

### Kits de réparation

Chaque vérification en échec est accompagnée du correctif : ce qu'exige le standard, la modification pour la plateforme sur laquelle le site semble tourner (Cloudflare, Vercel, Netlify, nginx, Next.js), et la commande unique qui prouve qu'elle est en place.

### Confidentialité

L'extension traite les adresses et les réponses du site uniquement pour produire l'audit. Résultats, sites enregistrés, historique, réglages et messages restent dans le stockage local du navigateur. 301.st ne reçoit aucune donnée d'analyse ni de navigation. Il n'y a ni analytics, ni télémétrie, ni publicité, ni code distant. Une vérification interroge le DNS : elle demande à un résolveur public DNS-over-HTTPS si le domaine audité publie des enregistrements de découverte pour agents.

L'extension audite tout site que vous choisissez ; elle a donc besoin d'accéder à ses en-têtes, à son robots.txt, à son sitemap et à ses ressources well-known. Elle n'injecte rien dans les pages que vous visitez.

Agent Readiness Inspector est une implémentation indépendante de standards ouverts du web. Elle n'est ni affiliée à Cloudflare ni approuvée par elle.
