import type { PeerOptions } from 'peerjs';
import type { Gaze } from '../core/gaze';
import type { TvVolume } from '../core/youtube';
import type { Kind, Mode, TableSize, ViewEvent } from '../core/types';
import type { PlayerAction } from '../view/game-view';

/** Stan poczekalni wysyłany wszystkim w pokoju. */
export interface LobbyInfo {
  t: 'lobby';
  code: string;
  n: TableSize;
  mode: Mode;
  running: boolean;
  /** host = gospodarz pokoju (nie da się go wyrzucić) */
  seats: ({ name: string; isBot: boolean; kind: Kind; host: boolean; arena?: boolean } | null)[];
  /** czy host losuje miejsca przed partią */
  shuffle: boolean;
}

/** Automat 1v1: zaproszenia, odpowiedzi i wiadomości pojedynku (host tylko je przekazuje). */
export type ArcMsg =
  | { k: 'inv'; to: number }
  | { k: 'ans'; to: number; ok: boolean }
  | { k: 'd'; to: number; m: unknown }
  /** „gram na automacie” (vs = miejsce przeciwnika, −1 = bot, null = wyszedłem) */
  | { k: 'in'; vs: number | null }
  /** host zaczyna partię – wszyscy wracają z automatu */
  | { k: 'stop' };

export function sanitizeArc(d: unknown): ArcMsg | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const seat = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 8;
  switch (o.k) {
    case 'inv': return seat(o.to) ? { k: 'inv', to: o.to } : null;
    case 'ans': return seat(o.to) ? { k: 'ans', to: o.to, ok: !!o.ok } : null;
    case 'd': return seat(o.to) ? { k: 'd', to: o.to, m: o.m } : null;
    case 'in': return { k: 'in', vs: seat(o.vs) || o.vs === -1 ? (o.vs as number) : null };
    case 'stop': return { k: 'stop' };
    default: return null;
  }
}

/** Wiadomości host → gracz. */
export type HostMsg =
  | ViewEvent
  | LobbyInfo
  | { t: 'welcome'; seat: number; code: string; token: string }
  | { t: 'reject'; reason: string }
  | { t: 'kicked' }
  | { t: 'ping' }
  /** gdzie patrzy gracz na miejscu `seat` (tylko wygląd, bez wpływu na grę) */
  | { t: 'look'; seat: number; g: Gaze }
  /** telewizor: filmik (null = wyłączony) i od której sekundy */
  | { t: 'tv'; id: string | null; at: number }
  /** głośność telewizora – wspólna dla stołu */
  | { t: 'tvvol'; v: TvVolume }
  /** automat 1v1: wiadomość od gracza z miejsca `from` */
  | { t: 'arc'; from: number; d: ArcMsg };

/** Wiadomości gracz → host. */
export type ClientMsg =
  | { t: 'hello'; name: string; token: string; kind?: Kind }
  | { t: 'pick'; kind: Kind }
  | { t: 'look'; g: Gaze }
  | { t: 'tv'; id: string | null; start: number }
  | { t: 'tvvol'; v: TvVolume }
  | { t: 'act'; a: PlayerAction }
  | { t: 'arc'; d: ArcMsg }
  | { t: 'pong' };

/** Nazwa pokoju na serwerze PeerJS. Zmiana „v1” rozdziela niekompatybilne wersje gry. */
export const ROOM_PREFIX = 'barpodbebenkiem-v1-';
export const roomPeerId = (code: string) => ROOM_PREFIX + code.toLowerCase();

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const genCode = (): string => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const normalizeCode = (s: string): string => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export const newToken = (): string => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
export const cleanName = (n: unknown): string => String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || 'Gracz';

/** Opcje PeerJS. `?ps=127.0.0.1` w adresie przełącza na lokalny serwer (npm run peer-server). */
export function peerOptions(): PeerOptions {
  const q = new URLSearchParams(location.search);
  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  };
  const ps = q.get('ps');
  if (ps) return { host: ps, port: Number(q.get('pp') || 9000), path: '/bar', secure: false, debug: 1, config };
  return { debug: 1, config };
}

/** Odbiorca nie ufa nikomu: przepuszcza tylko obiekty z polem `t`. */
export const isMsg = (d: unknown): d is { t: string } => !!d && typeof d === 'object' && typeof (d as { t: unknown }).t === 'string';
