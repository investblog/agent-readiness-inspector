// The test the string-shape assertions in repair-kits.test.ts could not be:
// take what a recipe tells the reader to publish, feed it to the very check the
// kit repairs, and require a pass.
//
// Written after a review found two kits that shipped wrong: a verify command
// using HEAD (whose empty body makes the SPA-fallback guard vacuous) and a
// robots snippet whose blank line split the group its own caveat warned about.
// Both were caught by hand. Nothing in the suite would have caught them again.

import { describe, expect, it } from 'vitest';
import { PROBE } from './config';
import { REPAIR_KITS } from './repair-kits';
import { run } from './test-helpers';

/** What a site looks like after following the markdownNegotiation recipe. */
const AFTER_MARKDOWN = {
  [PROBE.rootMarkdown]: {
    headers: { 'content-type': 'text/markdown; charset=utf-8', vary: 'Accept' },
    body: '# Example\n\nA real markdown body, not an SPA shell.',
  },
};

/** What the linkHeaders recipe publishes. */
const AFTER_LINK = {
  [PROBE.root]: { headers: { link: '</llms.txt>; rel="describedby"; type="text/plain"' } },
};

/** The Content-Signal recipe, preamble and all, exactly as the snippet reads. */
const AFTER_CONTENT_SIGNALS = {
  [PROBE.robotsTxt]: {
    body: `# As a condition of accessing this website, you agree to abide by the
# following content signals:

User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /`,
  },
};

/** The AI-rules recipe: two groups, one allowing, one disallowing. */
const AFTER_AI_RULES = {
  [PROBE.robotsTxt]: {
    body: `User-agent: OAI-SearchBot
User-agent: PerplexityBot
User-agent: ClaudeBot
Allow: /

User-agent: GPTBot
User-agent: Google-Extended
User-agent: CCBot
Disallow: /`,
  },
};

describe('following a repair kit actually repairs its check', () => {
  it('markdownNegotiation', () => {
    expect(run('markdownNegotiation', AFTER_MARKDOWN).status).toBe('pass');
  });

  it('linkHeaders', () => {
    expect(run('linkHeaders', AFTER_LINK).status).toBe('pass');
  });

  it('contentSignals', () => {
    expect(run('contentSignals', AFTER_CONTENT_SIGNALS).status).toBe('pass');
  });

  it('robotsTxtAiRules', () => {
    const r = run('robotsTxtAiRules', AFTER_AI_RULES);
    expect(r.status).toBe('pass');
    // and it earns the STRONG form, not the wildcard fallback
    expect(r.evidence).toContain('GPTBot');
  });

  it('covers every kit that ships', () => {
    // a new kit without a fixture here is a kit nobody proved works
    expect(Object.keys(REPAIR_KITS).sort()).toEqual(
      ['contentSignals', 'linkHeaders', 'markdownNegotiation', 'robotsTxtAiRules'].sort(),
    );
  });
});

describe('what these fixtures CANNOT prove', () => {
  it('our robots parser tracks no groups, so grouping caveats rest on the text alone', () => {
    // The Content-Signal recipe warns that a blank line ends the group and a
    // signal in no group belongs to no agent. True of robots.txt, invisible to
    // us: parseRobots flattens every line. So this passes — and that is the
    // point of writing it down rather than assuming the suite has us covered.
    const orphaned = {
      [PROBE.robotsTxt]: { body: 'Content-Signal: search=yes, ai-input=yes, ai-train=no\n\nUser-agent: *\nAllow: /' },
    };
    expect(run('contentSignals', orphaned).status).toBe('pass');
  });
});

describe('the verify command is honest about what it proves', () => {
  it('markdownNegotiation does not tell the reader to use HEAD', () => {
    // curl -I sends HEAD; a HEAD has no body, and the body is what the
    // SPA-fallback guard reads — so -I can print "fixed" for a site that still
    // answers HTML to a GET
    const { verify } = REPAIR_KITS.markdownNegotiation ?? { verify: '' };
    expect(verify).not.toMatch(/curl\s+-[a-zA-Z]*I/);
  });

  it('a markdown response with an empty body is not what the recipe promises', () => {
    // documents current behaviour: the guard cannot see an SPA shell it was
    // never given. This is why the command must perform a GET.
    const headOnly = { [PROBE.rootMarkdown]: { ...AFTER_MARKDOWN[PROBE.rootMarkdown], body: '' } };
    expect(run('markdownNegotiation', headOnly).status).toBe('pass');
  });
});
