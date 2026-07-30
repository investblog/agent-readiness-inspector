// drift-watch: diff upstream "moving documentation" against committed snapshots
// and report what changed (ROADMAP "Сквозные треки"). Node 20+, no deps.
//
// - snapshots live in ci/drift/snapshots/<id>.txt (committed)
// - a missing snapshot is SEEDED silently (first run), not reported as change
// - changed sources: snapshot is rewritten + drift-out/<id>.md report is emitted
//   (full diff = git history of the snapshot file); CI turns reports into Issues
// - fetch failures never clobber a snapshot; they are reported separately

import fs from 'node:fs';
import path from 'node:path';

const SNAP_DIR = path.join(process.cwd(), 'ci', 'drift', 'snapshots');
const OUT_DIR = path.join(process.cwd(), 'drift-out');

const SOURCES = [
  // Cloudflare live tool: check-matrix composition via its scan API (unofficial —
  // CI-only calibration source per spec review; if it dies, that's a drift event too).
  {
    id: 'isitagentready-matrix',
    type: 'scan',
    url: 'https://isitagentready.com/api/scan',
    target: 'https://spintax.net',
  },
  // Cloudflare docs (conventions our checks mirror)
  {
    id: 'cf-markdown-for-agents',
    type: 'html',
    url: 'https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/',
  },
  { id: 'cf-url-scanner', type: 'html', url: 'https://developers.cloudflare.com/radar/investigate/url-scanner/' },
  // Standards / conventions
  { id: 'contentsignals-org', type: 'html', url: 'https://contentsignals.org/' },
  { id: 'llmstxt-org', type: 'html', url: 'https://llmstxt.org/' },
  { id: 'ucp-dev', type: 'html', url: 'https://ucp.dev/' },
  // IETF drafts (revision number is the signal)
  { id: 'ietf-http-msg-sig-dir', type: 'datatracker', name: 'draft-meunier-http-message-signatures-directory' },
  { id: 'ietf-mcp-discovery-uri', type: 'datatracker', name: 'draft-serra-mcp-discovery-uri' },
  // GitHub-hosted specs / lists (latest commit is the signal)
  { id: 'gh-agent-skills-rfc', type: 'github-commit', repo: 'cloudflare/agent-skills-discovery-rfc' },
  { id: 'gh-ai-robots-txt', type: 'github-commit', repo: 'ai-robots-txt/ai.robots.txt' },
  { id: 'mcp-sep-2127', type: 'github-pr', repo: 'modelcontextprotocol/modelcontextprotocol', pr: 2127 },
];

async function fetchText(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'user-agent': 'agent-readiness-inspector drift-watch (github.com/investblog/agent-readiness-inspector)',
        ...init.headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

async function normalize(src) {
  switch (src.type) {
    case 'html':
      return htmlToText(await fetchText(src.url));
    case 'datatracker': {
      const json = JSON.parse(
        await fetchText(`https://datatracker.ietf.org/api/v1/doc/document/${src.name}/?format=json`),
      );
      return `name: ${src.name}\nrev: ${json.rev}\nstate: ${json.states?.join(',') ?? ''}\nexpires: ${json.expires ?? ''}`;
    }
    case 'github-commit': {
      const json = JSON.parse(
        await fetchText(`https://api.github.com/repos/${src.repo}/commits?per_page=1`, {
          headers: { accept: 'application/vnd.github+json' },
        }),
      );
      const c = json[0];
      return `repo: ${src.repo}\nsha: ${c.sha}\ndate: ${c.commit?.committer?.date}\nmessage: ${(c.commit?.message ?? '').split('\n')[0]}`;
    }
    case 'github-pr': {
      const pr = JSON.parse(
        await fetchText(`https://api.github.com/repos/${src.repo}/pulls/${src.pr}`, {
          headers: { accept: 'application/vnd.github+json' },
        }),
      );
      return `pr: ${src.repo}#${src.pr}\nstate: ${pr.state}\nmerged: ${pr.merged}\ntitle: ${pr.title}\nhead: ${pr.head?.sha}`;
    }
    case 'scan': {
      const body = await fetchText(src.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: src.target }),
      });
      const json = JSON.parse(body);
      // shape (2026-07-30): checks = { category: { checkId: {...} } }
      // matrix composition only (category/checkId), sorted — statuses/scores are
      // the calibration job's business, not doc-watch's
      const checks = json.checks ?? {};
      const lines = [];
      for (const [category, group] of Object.entries(checks)) {
        for (const checkId of Object.keys(group)) lines.push(`${category}/${checkId}`);
      }
      lines.sort();
      return lines.length
        ? lines.join('\n')
        : `UNRECOGNIZED SHAPE, top-level keys: ${Object.keys(json).sort().join(', ')}`;
    }
    default:
      throw new Error(`unknown type ${src.type}`);
  }
}

function lineDelta(oldText, newText) {
  const oldSet = new Set(oldText.split('\n'));
  const newSet = new Set(newText.split('\n'));
  const added = [...newSet].filter((l) => !oldSet.has(l)).slice(0, 30);
  const removed = [...oldSet].filter((l) => !newSet.has(l)).slice(0, 30);
  return { added, removed };
}

fs.mkdirSync(SNAP_DIR, { recursive: true });
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const changed = [];
const errored = [];

for (const src of SOURCES) {
  const snapFile = path.join(SNAP_DIR, `${src.id}.txt`);
  let fresh;
  try {
    fresh = await normalize(src);
  } catch (err) {
    errored.push(`${src.id}: ${err.message}`);
    console.error(`[drift] FETCH-ERROR ${src.id}: ${err.message}`);
    continue;
  }
  if (!fs.existsSync(snapFile)) {
    fs.writeFileSync(snapFile, `${fresh}\n`, 'utf8');
    console.log(`[drift] seeded ${src.id}`);
    continue;
  }
  const old = fs.readFileSync(snapFile, 'utf8').trimEnd();
  if (old === fresh) {
    console.log(`[drift] unchanged ${src.id}`);
    continue;
  }
  fs.writeFileSync(snapFile, `${fresh}\n`, 'utf8');
  const { added, removed } = lineDelta(old, fresh);
  const report = [
    `Upstream source **${src.id}** changed (${src.url ?? src.repo ?? src.name}).`,
    '',
    added.length ? `**Added lines (sample):**\n\`\`\`\n${added.join('\n')}\n\`\`\`` : '',
    removed.length ? `**Removed lines (sample):**\n\`\`\`\n${removed.join('\n')}\n\`\`\`` : '',
    '',
    `Full diff: git history of \`ci/drift/snapshots/${src.id}.txt\`.`,
    'Action: check whether the §3 matrix / engine config / fix prompts need an update.',
  ]
    .filter(Boolean)
    .join('\n');
  fs.writeFileSync(path.join(OUT_DIR, `${src.id}.md`), `${report}\n`, 'utf8');
  changed.push(src.id);
  console.log(`[drift] CHANGED ${src.id}`);
}

if (errored.length) {
  fs.writeFileSync(
    path.join(OUT_DIR, 'fetch-errors.md'),
    `drift-watch could not fetch:\n\n\`\`\`\n${errored.join('\n')}\n\`\`\`\n\nIf a source died permanently, replace it in scripts/drift-watch.mjs.\n`,
    'utf8',
  );
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.join(' ')}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `errors=${errored.length ? 'fetch-errors' : ''}\n`);
}
console.log(`[drift] done: ${changed.length} changed, ${errored.length} errors`);
