import { describe, expect, it } from 'vitest';
import { isNewsItem, type NewsItem, StorageLayer } from '@/shared/storage';
import { FakeArea } from '@/shared/test-support';
import { enableNews, MAX_NEW_PER_CYCLE, type NewsPost, runNewsCycle } from './news';

/** The feed is oldest-first — build fixtures the same way the real one arrives. */
function post(slug: string, n = 1): NewsPost {
  return {
    slug,
    title: `Post ${slug}`,
    description: `About ${slug}`,
    date: `2026-08-0${n}`,
    url: `https://301.sh/${slug}/`,
  };
}

interface Harness {
  store: StorageLayer;
  notified: NewsItem[];
  run: (posts: NewsPost[], opts?: { seedOnly?: boolean }) => Promise<{ filed: string[] }>;
  inbox: () => Promise<NewsItem[]>;
}

async function harness(): Promise<Harness> {
  const store = new StorageLayer(new FakeArea());
  await store.migrate();
  const notified: NewsItem[] = [];
  return {
    store,
    notified,
    run: (posts, opts) =>
      runNewsCycle(
        {
          store,
          fetchPosts: async () => posts,
          notify: async (item) => {
            notified.push(item);
          },
        },
        opts,
      ),
    inbox: async () => (await store.getAlerts()).filter(isNewsItem),
  };
}

describe('news cycle', () => {
  it('does nothing at all while the feature is off', async () => {
    const h = await harness();
    const result = await h.run([post('a'), post('b')]);
    expect(result.filed).toEqual([]);
    expect(await h.inbox()).toEqual([]);
  });

  it('files the newest post on enable and marks the rest seen', async () => {
    const h = await harness();
    await enableNews(
      { store: h.store, fetchPosts: async () => [post('a'), post('b'), post('c')] },
      { get: async () => undefined, create: () => {}, clear: () => true },
    );
    // one, not zero (an inbox that stays empty for a week reads as broken) and
    // not three (that is spam, and it buries a regression in the same list)
    const inbox = await h.inbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].id).toBe('news:c');
    const settings = await h.store.getNewsSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.seeded).toBe(true);
    expect(settings.seen).toEqual(['a', 'b', 'c']);
  });

  it('files only what arrived after the seed', async () => {
    const h = await harness();
    await h.store.updateNewsSettings({ enabled: true, seen: ['a', 'b'], seeded: true });
    const result = await h.run([post('a'), post('b'), post('c')]);
    expect(result.filed).toEqual(['news:c']);
    const inbox = await h.inbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].url).toBe('https://301.sh/c/');
    expect(inbox[0].readAt).toBeUndefined();
    expect(h.notified.map((item) => item.id)).toEqual(['news:c']);
  });

  it('counts toward the unread badge like a regression does', async () => {
    const h = await harness();
    await h.store.updateNewsSettings({ enabled: true, seen: [], seeded: true });
    await h.run([post('a')]);
    expect(await h.store.countUnreadAlerts()).toBe(1);
  });

  it('keeps the NEWEST posts when a burst exceeds the per-cycle cap', async () => {
    const h = await harness();
    await h.store.updateNewsSettings({ enabled: true, seen: [], seeded: true });
    const burst = ['a', 'b', 'c', 'd', 'e'].map((slug) => post(slug)); // oldest first
    const result = await h.run(burst);
    expect(result.filed).toHaveLength(MAX_NEW_PER_CYCLE);
    expect(result.filed).toEqual(['news:e', 'news:d', 'news:c']);
    // everything fresh is marked seen, including what the cap dropped: those are
    // old news next tick and must not arrive a cycle late
    expect((await h.store.getNewsSettings()).seen).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('recovers from a failed enable-time seed without dumping the backlog', async () => {
    const h = await harness();
    // enabled, but the seed failed (network) — `seeded` stayed false
    await h.store.updateNewsSettings({ enabled: true, seen: [], seeded: false });
    const result = await h.run([post('a'), post('b')]);
    expect(result.filed).toEqual(['news:b']); // the newest only, as on enable
    expect((await h.store.getNewsSettings()).seeded).toBe(true);
    // and the NEXT post is filed normally
    const second = await h.run([post('a'), post('b'), post('c')]);
    expect(second.filed).toEqual(['news:c']);
  });

  it('files nothing and forgets nothing when the feed is down', async () => {
    const h = await harness();
    await h.store.updateNewsSettings({ enabled: true, seen: ['a'], seeded: true });
    const result = await runNewsCycle({
      store: h.store,
      fetchPosts: async () => {
        throw new Error('HTTP 503');
      },
    });
    expect(result.filed).toEqual([]);
    expect((await h.store.getNewsSettings()).seen).toEqual(['a']);
  });

  it('does not re-file a post the user dismissed', async () => {
    const h = await harness();
    await h.store.updateNewsSettings({ enabled: true, seen: [], seeded: true });
    await h.run([post('a')]);
    await h.store.dismissAlert('news:a');
    expect(await h.inbox()).toEqual([]);
    const again = await h.run([post('a')]);
    expect(again.filed).toEqual([]);
  });

  it('ignores feed entries without a slug or url', async () => {
    const h = await harness();
    await h.store.updateNewsSettings({ enabled: true, seen: [], seeded: true });
    const result = await h.run([{ ...post('a'), url: '' } as NewsPost, post('b')]);
    expect(result.filed).toEqual(['news:b']);
  });

  it('keeps a post when the site it has nothing to do with is deleted', async () => {
    const h = await harness();
    await h.store.updateNewsSettings({ enabled: true, seen: [], seeded: true });
    await h.store.addSite('https://example.com');
    await h.run([post('a')]);
    await h.store.removeSite('https://example.com');
    expect(await h.inbox()).toHaveLength(1);
  });
});
