// Shared validators for check implementations (spec §3 anti-false-positive
// column): the status code opens a check, only a body/header validator passes it.

import type { ProbeResponse } from './types';

/** Soft-404 guard: an HTML page served where a machine file should be. */
export function looksLikeHtml(body: string): boolean {
  const head = body.trimStart().slice(0, 15).toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

/** Case-insensitive header lookup on a probe response. */
export function header(res: ProbeResponse, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(res.headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

/** JSON.parse that never throws; returns undefined on invalid input. */
export function tryParseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** RFC 8288 Link header parse: `<href>; rel="a b"; ...` entries. */
export interface LinkEntry {
  href: string;
  rels: string[];
}

/** Split on a separator, ignoring separators inside "quotes" or <angles>. */
function splitOutside(value: string, sep: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let inAngles = false;
  for (const ch of value) {
    if (ch === '"' && !inAngles) inQuotes = !inQuotes;
    else if (ch === '<' && !inQuotes) inAngles = true;
    else if (ch === '>' && !inQuotes) inAngles = false;
    if (ch === sep && !inQuotes && !inAngles) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// Quote-aware scanner: commas inside quoted params (`title="Hello, world"`)
// or inside <URL> must not terminate an entry or eat the rel param.
export function parseLinkHeader(value: string): LinkEntry[] {
  const entries: LinkEntry[] = [];
  for (const part of splitOutside(value, ',')) {
    const match = /<([^>]*)>([\s\S]*)/.exec(part.trim());
    if (!match) continue;
    const href = match[1].trim();
    if (!href) continue;
    let rels: string[] = [];
    for (const param of splitOutside(match[2], ';')) {
      const relMatch = /^\s*rel\s*=\s*(?:"([^"]*)"|(\S+))\s*$/i.exec(param);
      if (relMatch) {
        rels = (relMatch[1] ?? relMatch[2] ?? '').toLowerCase().split(/\s+/).filter(Boolean);
        break; // RFC 8288: first rel param wins
      }
    }
    entries.push({ href, rels });
  }
  return entries;
}

/** Parse robots.txt into directive lines: `{ field, value }`, comments stripped. */
export interface RobotsLine {
  field: string;
  value: string;
}

export function parseRobots(body: string): RobotsLine[] {
  const lines: RobotsLine[] = [];
  for (const raw of body.split('\n')) {
    const noComment = raw.split('#')[0];
    const idx = noComment.indexOf(':');
    if (idx <= 0) continue;
    const field = noComment.slice(0, idx).trim().toLowerCase();
    const value = noComment.slice(idx + 1).trim();
    if (field) lines.push({ field, value });
  }
  return lines;
}
