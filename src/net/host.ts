// Host: prowadzi silnik gry, zarządza poczekalnią i połączeniami graczy.
// Ta sama klasa obsługuje grę z botami (bez sieci).

import { Peer, type DataConnection } from 'peerjs';
import { KINDS } from '../core/constants';
import { GameEngine, botSlot, newSlot, type EngineIO, type PlayerSlot } from '../core/engine';
import { isValidPlay } from '../core/rules';
import { people } from '../core/text';
import type { Action, Card, GameEvent, Mode, TableSize, TurnRequest } from '../core/types';
import { sleep } from '../ui/dom';
import { drained, handleEvent, type PlayerAction } from '../view/game-view';
import { cleanName, genCode, isMsg, newToken, peerOptions, roomPeerId, type ClientMsg, type HostMsg, type LobbyInfo } from './protocol';

export interface HostSlot extends PlayerSlot {
  /** gracz siedzący przy tym komputerze (host) */
  local?: boolean;
  conn?: DataConnection | null;
  /** pozwala wrócić na to samo miejsce po odświeżeniu strony */
  token?: string | null;
}

export interface HostHooks {
  /** pokój założony, można zapraszać */
  opened(code: string): void;
  lobby(info: LobbyInfo): void;
  status(text: string): void;
}

interface Pending { seat: number; req: TurnRequest; deadline: number; timer: number; res: (a: Action) => void }
interface ConnMeta { seat: number | null; lastSeen: number }

const PING_MS = 2500, DEAD_MS = 10000;

export class HostSession implements EngineIO {
  slots: (HostSlot | null)[] = [];
  engine: GameEngine<HostSlot> | null = null;
  code = '';
  /** trzymane, żeby połączenie nie zostało zebrane przez GC */
  peer: Peer | null = null;
  private pending: Pending | null = null;
  private meta = new WeakMap<DataConnection, ConnMeta>();
  private hbLast = Date.now();

  constructor(public size: TableSize, public mode: Mode, readonly online: boolean, private readonly hooks: HostHooks) {}

  get running(): boolean { return !!this.engine?.running; }

  // ================= start =================

  /** Gra z botami: od razu startuje partię. */
  static solo(name: string, size: TableSize, mode: Mode, hooks: HostHooks): HostSession {
    const h = new HostSession(size, mode, false, hooks);
    h.slots = KINDS.slice(0, size).map((k, i) => (i === 0 ? { ...newSlot(name, k, false), local: true } : botSlot(i)));
    void h.play();
    return h;
  }

  /** Zakłada pokój online. */
  open(name: string): void {
    this.code = genCode();
    const peer = new Peer(roomPeerId(this.code), peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      this.slots = Array.from({ length: this.size }, (_, i) => (i === 0 ? { ...newSlot(name, KINDS[0], false), local: true } : null));
      this.hooks.opened(this.code);
      this.broadcastLobby();
    });
    peer.on('connection', conn => {
      this.meta.set(conn, { seat: null, lastSeen: Date.now() });
      conn.on('data', d => this.onData(conn, d));
      conn.on('close', () => this.onClose(conn));
      conn.on('error', () => this.onClose(conn));
    });
    peer.on('disconnected', () => {
      setTimeout(() => { if (!peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch { /* spróbujemy później */ } } }, 3000);
    });
    peer.on('error', (e: { type: string }) => {
      if (e.type === 'unavailable-id') { peer.destroy(); this.open(name); return; }
      if (['network', 'server-error', 'socket-error'].includes(e.type) && !this.slots[0]) {
        this.hooks.status(`Nie mogę połączyć się z serwerem pokoi (${e.type}). Sprawdź internet i spróbuj ponownie.`);
        try { peer.destroy(); } catch { /* już zamknięty */ }
      } else console.warn('peer error', e.type, e);
    });
    setInterval(() => this.heartbeat(), PING_MS);
  }

  /** Start partii z poczekalni. Zwraca komunikat błędu albo null. */
  startGame(fillBots: boolean): string | null {
    // boty z poprzedniej partii i rozłączeni gracze nie przechodzą do następnej
    this.slots = this.slots.map(s => (s && s.isBot && (s.fill || !s.conn) ? null : s));
    if (fillBots) this.slots = this.slots.map((s, i) => s ?? botSlot(i));
    if (this.slots.filter(Boolean).length < 2) return 'Potrzeba co najmniej 2 graczy. Zaproś kogoś albo włącz boty.';
    void this.play();
    return null;
  }

  private async play(): Promise<void> {
    this.engine?.stop();
    this.engine = new GameEngine(this.slots, this, { size: this.size, mode: this.mode, rng: Math.random });
    const res = await this.engine.run();
    if (res && this.online) this.broadcastLobby();
  }

  // ================= EngineIO =================

  emit(ev: GameEvent): void {
    handleEvent(ev);
    for (const s of this.slots) if (s?.conn) this.send(s.conn, ev);
  }

  sendHand(seat: number, cards: Card[], deal: boolean): void {
    const s = this.slots[seat];
    if (!s || s.isBot) return;
    const ev = { t: 'hand' as const, cards, deal };
    if (s.local) handleEvent(ev); else if (s.conn) this.send(s.conn, ev);
  }

  waitHuman(seat: number, req: TurnRequest): Promise<Action> {
    return new Promise(res => {
      const timer = window.setTimeout(() => this.resolvePending(this.engine!.autoAction(seat, req)), req.ms + 1500);
      this.pending = { seat, req, deadline: Date.now() + req.ms, timer, res };
    });
  }

  thinkDelay(): Promise<void> { return sleep(900 + Math.random() * 1300); }
  settle(): Promise<void> { return drained(); }
  pause(ms: number): Promise<void> { return sleep(ms); }

  private resolvePending(a: Action): void {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer); this.pending = null; p.res(a);
  }

  /** Ruch gracza (lokalnego albo z sieci). Niepoprawne ruchy są ignorowane. */
  act(seat: number, a: PlayerAction): void {
    const p = this.pending;
    if (!p || p.seat !== seat || !a) return;
    if (a.t === 'liar' && p.req.canChallenge) this.resolvePending({ type: 'liar' });
    else if (a.t === 'play' && !p.req.forced && isValidPlay(a.idx, this.slots[seat]?.hand.length ?? 0)) this.resolvePending({ type: 'play', cards: a.idx });
  }

  // ================= sieć =================

  private send(conn: DataConnection, msg: HostMsg): void {
    try { if (conn.open) void conn.send(msg); } catch (e) { console.warn(e); }
  }

  private onData(conn: DataConnection, d: unknown): void {
    const m = this.meta.get(conn);
    if (!m || !isMsg(d)) return;
    m.lastSeen = Date.now();
    const msg = d as ClientMsg;
    if (msg.t === 'pong') return;
    if (msg.t === 'act') { if (m.seat != null) this.act(m.seat, msg.a); return; }
    if (msg.t === 'hello' && m.seat == null) this.onHello(conn, m, msg);
  }

  private onHello(conn: DataConnection, m: ConnMeta, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    // powrót po odświeżeniu strony: ten sam token = to samo miejsce
    const token = typeof msg.token === 'string' ? msg.token : '';
    const back = token ? this.slots.findIndex((q, i) => i > 0 && q?.token === token) : -1;
    if (back > 0) {
      const q = this.slots[back]!;
      const old = q.conn;
      if (old && old !== conn) { const om = this.meta.get(old); if (om) om.seat = null; try { old.close(); } catch { /* już zamknięte */ } }
      Object.assign(q, { conn, local: false, isBot: false, fill: false });
      m.seat = back;
      this.send(conn, { t: 'welcome', seat: back, code: this.code, token });
      if (this.running) this.resync(back, conn);
      else this.broadcastLobby();
      return;
    }
    const free = this.slots.findIndex((s, i) => i > 0 && (!s || (s.isBot && s.fill)));
    if (this.running || free < 0) {
      this.send(conn, { t: 'reject', reason: this.running ? 'Gra już trwa. Poczekaj na koniec partii.' : `Stół jest pełny (${people(this.size)}).` });
      setTimeout(() => conn.close(), 400);
      return;
    }
    const newTok = newToken();
    this.slots[free] = { ...newSlot(cleanName(msg.name), KINDS[free], false), conn, token: newTok };
    m.seat = free;
    this.send(conn, { t: 'welcome', seat: free, code: this.code, token: newTok });
    this.broadcastLobby();
  }

  /** Gracz wrócił w trakcie partii: wysyła mu stan stołu, rękę i ewentualnie jego turę. */
  private resync(seat: number, conn: DataConnection): void {
    const e = this.engine!;
    const lp = e.lastPlay;
    this.send(conn, { t: 'sync', mode: this.mode, st: e.publicState(), table: e.table, round: e.round, pileN: e.pileN, lastN: lp ? lp.cards.length : 0, active: e.active });
    this.sendHand(seat, this.slots[seat]!.hand.slice(), false);
    const p = this.pending;
    if (p && p.seat === seat) {
      this.send(conn, { t: 'turn', seat, ...p.req, ms: Math.max(1000, p.deadline - Date.now()), lastSeat: lp ? lp.seat : -1, lastN: lp ? lp.cards.length : 0 });
    }
    this.emit({ t: 'info', text: `${this.slots[seat]!.name} wraca do gry.`, st: e.publicState() });
  }

  private onClose(conn: DataConnection): void {
    const m = this.meta.get(conn);
    if (!m || m.seat == null) return;
    const i = m.seat; m.seat = null;
    const s = this.slots[i];
    if (!s || s.conn !== conn) return;
    if (this.running) this.seatToBot(i, 'rozłączył się');
    else { this.slots[i] = null; this.broadcastLobby(); }
  }

  /** W trakcie partii miejsce rozłączonego (lub wyrzuconego) gracza przejmuje bot. */
  private seatToBot(i: number, why: string): void {
    const s = this.slots[i];
    if (!s || s.isBot) return;
    Object.assign(s, { isBot: true, conn: null, local: false });
    if (!this.running) return;
    this.emit({ t: 'info', text: `${s.name} ${why}. Miejsce przejmuje bot.`, st: this.engine!.publicState() });
    const p = this.pending;
    if (p && p.seat === i) this.resolvePending(this.engine!.botDecide(i, p.req));
  }

  /** Odświeżenie strony nie zawsze zamyka połączenie: kto milczy ponad 10 s, ten wypada. */
  private heartbeat(): void {
    const now = Date.now(), gap = now - this.hbLast;
    this.hbLast = now;
    for (const s of this.slots) {
      const c = s?.conn;
      if (!c) continue;
      const m = this.meta.get(c);
      if (!m) continue;
      if (gap > 6000) m.lastSeen = now; // przeglądarka hosta spała – nie karzemy gości
      this.send(c, { t: 'ping' });
      if (now - m.lastSeen > DEAD_MS) { try { c.close(); } catch { /* już zamknięte */ } this.onClose(c); }
    }
  }

  // ================= poczekalnia =================

  kick(i: number): void {
    const q = this.slots[i];
    if (!q || q.local || i === 0) return;
    const c = q.conn;
    if (c) {
      this.send(c, { t: 'kicked' });
      const m = this.meta.get(c); if (m) m.seat = null;
      setTimeout(() => { try { c.close(); } catch { /* już zamknięte */ } }, 400);
    }
    if (this.running) { q.token = null; this.seatToBot(i, 'został wyrzucony'); }
    else { this.slots[i] = null; this.broadcastLobby(); }
  }

  /** Zmiana rozmiaru stołu w poczekalni. Zwraca komunikat błędu albo null. */
  setSize(n: TableSize): string | null {
    if (this.running || n === this.size) return null;
    const humans = this.slots.map((s, i) => (s && !(s.isBot && s.fill) ? i : -1)).filter(i => i >= 0);
    if (humans.length > n) return `Przy stole jest ${people(humans.length)}. Najpierw kogoś wyrzuć.`;
    const seats: (HostSlot | null)[] = Array.from({ length: n }, () => null);
    if (n < this.size) {
      // przesadź ludzi na początek stołu i powiadom ich o nowym miejscu
      humans.forEach((oldI, k) => {
        const s = this.slots[oldI]!;
        seats[k] = s; s.kind = KINDS[k];
        if (k !== oldI && s.conn) {
          const m = this.meta.get(s.conn); if (m) m.seat = k;
          this.send(s.conn, { t: 'welcome', seat: k, code: this.code, token: s.token ?? '' });
        }
      });
    } else humans.forEach(i => { seats[i] = this.slots[i]; });
    this.slots = seats;
    this.size = n;
    this.broadcastLobby();
    return null;
  }

  setMode(m: Mode): void {
    if (this.running) return;
    this.mode = m;
    this.broadcastLobby();
  }

  lobbyInfo(): LobbyInfo {
    return {
      t: 'lobby', code: this.code, n: this.size, mode: this.mode, running: this.running,
      seats: this.slots.map(s => (s && !(s.isBot && s.fill) ? { name: s.name, isBot: s.isBot } : null)),
    };
  }

  broadcastLobby(): void {
    const info = this.lobbyInfo();
    this.hooks.lobby(info);
    for (const s of this.slots) if (s?.conn) this.send(s.conn, info);
  }
}
