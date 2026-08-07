// Repair kits (M2.5, spec §8.0) — turning "this check failed" into "here is the
// change, on your stack, and the command that proves it worked".
//
// A fix prompt (prompts.ts) tells an agent what to build. A kit is for the
// person: the concrete edit, where it goes on the hosting they are actually
// using, and the one command that closes the loop by producing the same
// evidence our validator reads. Without that last part a recipe is advice; with
// it, it is checkable.
//
// BUNDLED, not fetched. The roadmap allowed hosting these at 301.st with the
// bundle as fallback; they ship in the bundle instead. This is text, it is
// small, and the alternative is another optional network feature — the exact
// shape of thing that cost this project three defects and a removal in one
// week. Local-first is a property we advertise, not a default we drift from.

import type { CheckId } from './config';
import type { ProbeResponse } from './types';

export type StackId = 'cloudflare' | 'vercel' | 'netlify' | 'nextjs' | 'nginx' | 'generic';

export interface Recipe {
  /** Where the change goes, e.g. "_headers" or "next.config.js". */
  where: string;
  /** The change itself — shown verbatim, copyable. */
  snippet: string;
  /** Notes that stop the recipe being wrong in practice. */
  caveat?: string;
}

export interface RepairKit {
  /** Same identity as the check it repairs. */
  check: CheckId;
  /** One line on what the standard actually requires, before any stack detail. */
  requirement: string;
  /** Command the reader runs to see the fix land, in their own terminal. */
  verify: string;
  /** What that command prints when the check would now pass. */
  expect: string;
  recipes: Partial<Record<StackId, Recipe>>;
}

/**
 * Which stacks a response looks like, most specific first.
 *
 * All matches are returned rather than one: a Vercel app behind Cloudflare is
 * both, and the two have different places to put the fix. Picking one silently
 * would send half the readers to the wrong file.
 */
export function detectStacks(root: ProbeResponse | undefined): StackId[] {
  if (!root) return ['generic'];
  const h = root.headers;
  const server = (h.server ?? '').toLowerCase();
  const powered = (h['x-powered-by'] ?? '').toLowerCase();
  const found: StackId[] = [];
  if (powered.includes('next')) found.push('nextjs');
  if ('x-vercel-id' in h || server.includes('vercel')) found.push('vercel');
  if ('x-nf-request-id' in h || server.includes('netlify')) found.push('netlify');
  if ('cf-ray' in h || server.includes('cloudflare')) found.push('cloudflare');
  if (server.includes('nginx')) found.push('nginx');
  return found.length > 0 ? found : ['generic'];
}

const MARKDOWN_NEGOTIATION: RepairKit = {
  check: 'markdownNegotiation',
  requirement:
    'When a request carries `Accept: text/markdown`, answer with `Content-Type: text/markdown` and add ' +
    '`Vary: Accept`. The check reads the Content-Type it gets back — publishing Markdown at other URLs does ' +
    'not satisfy it.',
  // -D - prints the headers of a real GET. `curl -I` sends HEAD, and a HEAD has
  // no body — which is exactly what the SPA-fallback guard inspects, so a HEAD
  // can look fixed on a site that still answers HTML to a GET.
  verify: "curl -s -D - -o /dev/null -H 'Accept: text/markdown' https://YOUR-SITE/",
  expect: 'Content-Type: text/markdown; charset=utf-8, with Vary: Accept on the same response',
  recipes: {
    cloudflare: {
      where: 'A Worker in front of the page URLs (or functions/_middleware.ts on Pages)',
      snippet: `const url = new URL(request.url);
// HEAD as well as GET: RFC 9110 says HEAD answers with the headers a GET would
// send, and that is what any "curl -I" check will use.
if (['GET', 'HEAD'].includes(request.method) &&
    /(^|,)\\s*text\\/markdown\\b/.test(request.headers.get('Accept') ?? '')) {
  // mirrorFor: your own map from a page path to its .md twin
  const md = await env.ASSETS.fetch(new Request(new URL(mirrorFor(url.pathname), url.origin)));
  if (md.ok) return new Response(md.body, { status: 200, headers: {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Vary': 'Accept',
    'Cache-Control': 'no-store',
  }});
}`,
      caveat:
        "Cloudflare's cache key ignores Vary unless a Cache Rule adds it, so the Markdown can be served to a " +
        'browser. `Cache-Control: no-store` on the Markdown branch only is the cheap fix.',
    },
    nextjs: {
      where: 'middleware.ts at the project root',
      snippet: `import { NextResponse } from 'next/server';

export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };

export function middleware(request: Request) {
  if (!/(^|,)\\s*text\\/markdown\\b/.test(request.headers.get('accept') ?? '')) {
    return NextResponse.next({ headers: { Vary: 'Accept' } });
  }
  const url = new URL(request.url);
  // "/" has no name to suffix. Without this line the rewrite targets "/.md" —
  // and "/" is the one URL this check actually probes.
  const path = url.pathname === '/' ? '/index' : url.pathname.replace(/\\/$/, '');
  const res = NextResponse.rewrite(new URL(path + '.md', url));
  res.headers.set('Content-Type', 'text/markdown; charset=utf-8');
  res.headers.set('Vary', 'Accept');
  return res;
}`,
      caveat:
        'The matcher keeps this off static assets, and `Vary: Accept` goes on BOTH branches or the CDN serves ' +
        'one variant to everyone. On a Vercel project that is not Next.js the equivalent is `import { rewrite } ' +
        "from '@vercel/edge'` — different API, same shape.",
    },
    nginx: {
      where: 'server block (NOT inside a location if — see the caveat)',
      snippet: `# Content-Type comes from the MIME table, not from add_header:
types { text/markdown md; }

map $http_accept $md_suffix {
  default        "";
  "~*text/markdown" ".md";
}

location / {
  add_header Vary Accept always;
  try_files $uri$md_suffix $uri $uri/index.html =404;
}`,
      caveat:
        '`try_files` is not allowed inside `if`, so the obvious version does not load at all — use the map ' +
        'above. And `add_header Content-Type` APPENDS a second header rather than replacing the one nginx ' +
        'derives from the MIME table, which yields an ambiguous response; set the type via `types` or ' +
        '`default_type`. Note also that an `add_header` at this level discards any inherited from `server`.',
    },
    generic: {
      where: 'Wherever your responses get their headers',
      snippet: `if accept_header_includes('text/markdown'):
    return response(markdown_for(path),
                    content_type='text/markdown; charset=utf-8',
                    headers={'Vary': 'Accept'})`,
      caveat: 'This needs code: header-based branching is not something a static _headers or _redirects file can do.',
    },
  },
};

const LINK_HEADERS: RepairKit = {
  check: 'linkHeaders',
  requirement:
    'Serve an RFC 8288 `Link` response header advertising machine-readable resources. Only registered relation ' +
    'types count — `describedby`, `alternate`, `service-doc`.',
  verify: "curl -sI https://YOUR-SITE/ | grep -i '^link:'",
  expect: 'A Link header naming at least one resource with a registered rel',
  recipes: {
    cloudflare: {
      where: '_headers (Pages) or the Worker response',
      snippet: `/*
  Link: </llms.txt>; rel="describedby"; type="text/plain"`,
      caveat:
        'Overlapping _headers rules concatenate rather than the more specific one winning. For `Link` that is ' +
        'harmless — comma-joining IS the RFC 8288 list form — but for single-valued headers like ' +
        '`X-Frame-Options` the merged value is invalid, so do not reuse this pattern for those.',
    },
    vercel: {
      where: 'vercel.json',
      snippet: `{ "headers": [{ "source": "/(.*)", "headers": [
  { "key": "Link", "value": "</llms.txt>; rel=\\"describedby\\"; type=\\"text/plain\\"" }
]}]}`,
    },
    netlify: {
      where: '_headers',
      snippet: `/*
  Link: </llms.txt>; rel="describedby"; type="text/plain"`,
    },
    nginx: {
      where: 'server block',
      snippet: 'add_header Link \'</llms.txt>; rel="describedby"; type="text/plain"\' always;',
      caveat: '`always` matters: without it the header is dropped on error responses.',
    },
    generic: {
      where: 'Your response headers',
      snippet: 'Link: </llms.txt>; rel="describedby"; type="text/plain"',
    },
  },
};

const CONTENT_SIGNALS: RepairKit = {
  check: 'contentSignals',
  requirement:
    'A `Content-Signal:` line inside a robots.txt user-agent group, stating search / ai-input / ai-train as ' +
    'yes or no. Keep the contentsignals.org preamble — it is what turns a preference into a reservation of ' +
    'rights under Article 4 of the EU copyright directive.',
  verify: "curl -s https://YOUR-SITE/robots.txt | grep -i 'content-signal'",
  expect: 'Content-Signal: search=yes, ai-input=yes, ai-train=no (your own values)',
  recipes: {
    generic: {
      where: 'robots.txt, at the site root',
      snippet: `# As a condition of accessing this website, you agree to abide by the
# following content signals:
# (a) If a content-signal = yes, you may collect content for the
#     corresponding use.
# (b) If a content-signal = no, you may not collect content for the
#     corresponding use.
# (c) If the website operator does not include a content signal for a
#     corresponding use, the website operator neither grants nor restricts
#     permission via content signal with respect to that use.

User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /`,
      caveat:
        'Two things this snippet is careful about. The preamble is the load-bearing part — it is what makes ' +
        'the line a reservation of rights rather than a preference, so do not trim it. And there is no blank ' +
        'line between Content-Signal and Allow: a blank line ends the group, and a signal in no group belongs ' +
        'to no agent.',
    },
    cloudflare: {
      where: 'public/robots.txt, or the robots route in your Worker',
      snippet: `# (keep the contentsignals.org preamble above the group — see the generic
# recipe; it is what gives the line legal weight)

User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /`,
      caveat: 'Static asset, so no Worker request is spent on it — keep it out of run_worker_first.',
    },
  },
};

const ROBOTS_AI_RULES: RepairKit = {
  check: 'robotsTxtAiRules',
  requirement:
    'A robots.txt that states a decision about crawlers. Naming AI agents explicitly is the strong form, but ' +
    'the validator also accepts a plain `User-agent: *` group: allow or disallow, the point is that you ' +
    'decided. Silence — no groups at all — is the only failing answer.',
  verify: "curl -s https://YOUR-SITE/robots.txt | grep -i '^user-agent:'",
  expect:
    'At least one User-agent group. Named AI crawlers if you want the stronger evidence; `User-agent: *` ' +
    'passes too.',
  recipes: {
    generic: {
      where: 'robots.txt, at the site root',
      snippet: `# Decide each line for yourself — the check only asks THAT you decided.
# Search and answer engines:
User-agent: OAI-SearchBot
User-agent: PerplexityBot
User-agent: ClaudeBot
Allow: /

# Training-only crawlers — set this to match your Content-Signal:
User-agent: GPTBot
User-agent: Google-Extended
User-agent: CCBot
Disallow: /`,
      caveat:
        'If you also published `ai-train=no` in Content-Signal, then allowing Google-Extended or CCBot here ' +
        'contradicts it: those crawlers exist for training. The two lines are read by different systems and ' +
        'nothing warns you when they disagree — so decide once and make both say it. Vendors rename and add ' +
        'crawlers often; ai.robots.txt on GitHub tracks the current list.',
    },
  },
};

export const REPAIR_KITS: Partial<Record<CheckId, RepairKit>> = {
  markdownNegotiation: MARKDOWN_NEGOTIATION,
  linkHeaders: LINK_HEADERS,
  contentSignals: CONTENT_SIGNALS,
  robotsTxtAiRules: ROBOTS_AI_RULES,
};

/**
 * The kit and the recipe to show, given what the site looks like. Falls back to
 * `generic` rather than showing nothing: a reader on an undetected stack still
 * needs the requirement and the verify command, which are stack-independent.
 */
export function repairKitFor(
  check: CheckId,
  stacks: readonly StackId[],
): { kit: RepairKit; stack: StackId; recipe: Recipe; alsoDetected: StackId[] } | undefined {
  const kit = REPAIR_KITS[check];
  if (!kit) return undefined;
  const matched = stacks.filter((s) => kit.recipes[s]);
  const stack = matched[0] ?? 'generic';
  const recipe = kit.recipes[stack] ?? kit.recipes.generic;
  if (!recipe) return undefined;
  return { kit, stack, recipe, alsoDetected: matched.slice(1) };
}
