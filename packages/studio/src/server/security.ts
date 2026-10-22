/**
 * Local server security (ADR-015): Host/Origin allow-list against DNS rebinding, the bearer token for
 * /mcp and /api/v1, and where that token lives.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { configDir } from '@reelforge/assist';

export { configDir };

/** Reads the token from `<dir>/token`, creating it (32 random bytes, base64url) on first use. */
export function loadOrCreateToken(dir = configDir()): string {
  const file = path.join(dir, 'token');
  if (existsSync(file)) {
    const t = readFileSync(file, 'utf8').trim();
    if (t.length >= 32) return t;
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString('base64url');
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600); // no effect on Windows, where the profile folder is already per-user
  } catch {
    /* best effort */
  }
  return token;
}

export function tokenMatches(header: string | undefined, token: string): boolean {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 127.0.0.0/8, ::1 and localhost. */
export function isLoopback(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    h === 'localhost' ||
    h === '::1' ||
    h === '::ffff:127.0.0.1' ||
    /^127(\.\d{1,3}){3}$/.test(h) ||
    /^::ffff:127(\.\d{1,3}){3}$/.test(h)
  );
}

export const isWildcard = (host: string) => host === '0.0.0.0' || host === '::' || host === '[::]';

/** Splits a Host header value ("name:port", "[::1]:port") into hostname and port. */
export function splitHost(value: string): { hostname: string; port?: number } | undefined {
  const m = /^(\[[^\]]+\]|[^:[\]]+)(?::(\d{1,5}))?$/.exec(value.trim());
  if (!m) return undefined;
  return { hostname: m[1].toLowerCase(), port: m[2] ? Number(m[2]) : undefined };
}

/** Parses REELFORGE_ALLOWED_HOSTS (comma list of host names, optionally with a port). */
export function parseAllowedHosts(spec: string | undefined): string[] {
  return (spec ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface HostPolicy {
  port: () => number;
  /** Extra allowed host names ("studio.lan" or "studio.lan:8080"). */
  allowed: string[];
}

/** Host header check: loopback names on the server port, or an allowed name (DNS-rebinding defence). */
export function hostAllowed(value: string | undefined, policy: HostPolicy): boolean {
  if (!value) return false;
  const h = splitHost(value);
  if (!h) return false;
  const port = h.port ?? 80;
  if (isLoopback(h.hostname)) return port === policy.port();
  return policy.allowed.some((a) => {
    const e = splitHost(a);
    if (!e || e.hostname !== h.hostname) return false;
    return e.port !== undefined ? e.port === port : port === policy.port() || h.port === undefined;
  });
}

/** Origin header check: absent (non-browser clients) or an http(s) origin whose host is allowed. */
export function originAllowed(origin: string | undefined, policy: HostPolicy): boolean {
  if (!origin) return true;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return hostAllowed(`${u.hostname}:${u.port || (u.protocol === 'https:' ? 443 : 80)}`, policy);
}

/** The TCP peer is this computer. */
export const peerIsLoopback = (req: IncomingMessage) => isLoopback(req.socket.remoteAddress ?? '');
