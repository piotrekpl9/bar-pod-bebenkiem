import type { PeerOptions } from 'peerjs';
import type { Mode, TableSize, ViewEvent } from '../core/types';
import type { PlayerAction } from '../view/game-view';

/** Stan poczekalni wysyłany wszystkim w pokoju. */
export interface LobbyInfo {
  t: 'lobby';
  code: string;
  n: TableSize;
  mode: Mode;
  running: boolean;
  seats: ({ name: string; isBot: boolean } | null)[];
}

/** Wiadomości host → gracz. */
export type HostMsg =
  | ViewEvent
  | LobbyInfo
  | { t: 'welcome'; seat: number; code: string; token: string }
  | { t: 'reject'; reason: string }
  | { t: 'kicked' }
  | { t: 'ping' };

/** Wiadomości gracz → host. */
export type ClientMsg =
  | { t: 'hello'; name: string; token: string }
  | { t: 'act'; a: PlayerAction }
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
