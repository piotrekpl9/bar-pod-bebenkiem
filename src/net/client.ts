// Gracz dołączający do pokoju hosta.

import { Peer, type DataConnection } from 'peerjs';
import { sanitizeGaze, type Gaze } from '../core/gaze';
import type { Kind, ViewEvent } from '../core/types';
import { session } from '../ui/dom';
import { V, handleEvent, setGaze, type PlayerAction } from '../view/game-view';
import { isMsg, peerOptions, roomPeerId, type ClientMsg, type HostMsg, type LobbyInfo } from './protocol';

export interface ClientHooks {
  welcome(seat: number): void;
  lobby(info: LobbyInfo): void;
  kicked(): void;
  rejected(reason: string): void;
  lost(): void;
  status(text: string): void;
}

const REJOIN_KEY = 'bpb-rejoin';
const HOST_SILENT_MS = 45000;

export class ClientSession {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private hostSeen = 0;
  private gone = false;
  code = '';

  constructor(private readonly hooks: ClientHooks) {
    setInterval(() => {
      if (!this.hostSeen || this.gone) return;
      if (Date.now() - this.hostSeen > HOST_SILENT_MS) this.lost();
    }, 3000);
  }

  join(code: string, name: string, kind: Kind): void {
    this.code = code;
    this.peer?.destroy();
    const peer = new Peer(peerOptions());
    this.peer = peer;
    let connected = false;
    const timeout = setTimeout(() => {
      if (!connected) this.hooks.status('Nie udało się połączyć. Sprawdź kod albo spróbuj innej sieci (np. Wi-Fi zamiast LTE).');
    }, 15000);

    peer.on('open', () => {
      const conn = peer.connect(roomPeerId(code), { reliable: true, serialization: 'json' });
      this.conn = conn;
      let token = '';
      try { const r = JSON.parse(session.get(REJOIN_KEY) || 'null'); if (r?.code === code) token = r.token; } catch { /* brak */ }
      conn.on('open', () => {
        connected = true; clearTimeout(timeout);
        this.hostSeen = Date.now();
        this.send({ t: 'hello', name, token, kind });
      });
      conn.on('data', d => this.onData(d));
      conn.on('close', () => this.lost());
      conn.on('error', () => this.lost());
    });
    peer.on('error', (e: { type: string }) => {
      clearTimeout(timeout);
      this.hooks.status(e.type === 'peer-unavailable'
        ? 'Nie ma pokoju o takim kodzie (albo host go zamknął).'
        : `Błąd połączenia (${e.type}). Spróbuj ponownie.`);
    });
  }

  act(a: PlayerAction): void { this.send({ t: 'act', a }); }
  pick(kind: Kind): void { this.send({ t: 'pick', kind }); }
  look(g: Gaze): void { this.send({ t: 'look', g }); }

  private send(msg: ClientMsg): void {
    try { if (this.conn?.open) void this.conn.send(msg); } catch (e) { console.warn(e); }
  }

  private onData(d: unknown): void {
    if (!isMsg(d)) return;
    this.hostSeen = Date.now();
    const msg = d as HostMsg;
    switch (msg.t) {
      case 'ping': this.send({ t: 'pong' }); return;
      case 'welcome':
        session.set(REJOIN_KEY, JSON.stringify({ code: this.code, token: msg.token }));
        try { history.replaceState(null, '', `#${this.code}`); } catch { /* file:// */ }
        this.hooks.welcome(msg.seat);
        return;
      case 'kicked':
        this.gone = true;
        session.remove(REJOIN_KEY);
        this.peer?.destroy();
        this.hooks.kicked();
        return;
      case 'reject': this.hooks.rejected(msg.reason || 'Host odrzucił połączenie.'); return;
      case 'lobby': this.hooks.lobby(msg); return;
      case 'look': {
        const g = sanitizeGaze(msg.g, V.size);
        if (g && Number.isInteger(msg.seat)) setGaze(msg.seat, g);
        return;
      }
      default: handleEvent(msg as ViewEvent);
    }
  }

  private lost(): void {
    if (this.gone) return;
    this.gone = true;
    this.hooks.lost();
  }
}
