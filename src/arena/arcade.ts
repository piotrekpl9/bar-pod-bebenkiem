// Automat w barze: menu (trening z botem, wyzwania), zaproszenia i połączenie pojedynku z siecią.

import { $, esc, status, store } from '../ui/dom';
import type { ArcMsg, LobbyInfo } from '../net/protocol';
import { setArcadeBusy } from '../view/bar';
import type { BotLevel } from './bot';
import { enterArena, inArena, type ArenaSession } from './view';

export interface ArcadeNet {
  /** czy jesteśmy w pokoju (z kimś) */
  online(): boolean;
  mySeat(): number;
  myName(): string;
  send(d: ArcMsg): void;
  /** czy teraz trwa partia w karty (wtedy automat jest nieczynny) */
  cardGameRunning(): boolean;
}

const INVITE_MS = 20000;
let net: ArcadeNet | null = null;
let lobby: LobbyInfo | null = null;
let session: ArenaSession | null = null;
let foeSeat = -1;
/** zaproszenie, które wysłałem (do kogo i kiedy) */
let outgoing: { to: number; timer: number } | null = null;
/** zaproszenie, które dostałem */
let incoming: { from: number; timer: number } | null = null;

const nameOf = (seat: number): string => lobby?.seats[seat]?.name ?? 'Gracz';
const box = () => $('#arcBox');

export function initArcade(n: ArcadeNet): void {
  net = n;
  const open = () => { renderPanel(); box().classList.remove('hide'); };
  $('#arcBtn').addEventListener('click', () => (box().classList.contains('hide') ? open() : box().classList.add('hide')));
  document.querySelectorAll('.arcOpen').forEach(b => b.addEventListener('click', open));
  $('#arcClose').addEventListener('click', () => box().classList.add('hide'));
  document.querySelectorAll<HTMLButtonElement>('#arcLevels button').forEach(b => b.addEventListener('click', () => {
    store.set('bpb-bot-level', b.dataset.l!); paintLevels();
  }));
  $('#arcBot').addEventListener('click', startBot);
  $('#arcYes').addEventListener('click', () => answer(true));
  $('#arcNo').addEventListener('click', () => answer(false));
  const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  $('#arcTouch').classList.toggle('hide', !touch);
  paintLevels();
}

const level = (): BotLevel => { const l = store.get('bpb-bot-level'); return l === 'easy' || l === 'hard' ? l : 'normal'; };
function paintLevels(): void {
  document.querySelectorAll<HTMLButtonElement>('#arcLevels button').forEach(b => b.classList.toggle('on', b.dataset.l === level()));
}

/** Lista ludzi w pokoju z przyciskami „Wyzwij”. */
function renderPanel(): void {
  const list = $('#arcPeople');
  const busyCard = net?.cardGameRunning() ?? false;
  $('#arcClosed').classList.toggle('hide', !busyCard);
  $('#arcBot').toggleAttribute('disabled', busyCard);
  if (!net?.online() || !lobby) {
    list.innerHTML = '<div class="small arc-empty">Załóż pokój albo dołącz do kolegi, żeby go wyzwać.</div>';
    return;
  }
  const me = net.mySeat();
  const people = lobby.seats.map((s, i) => ({ s, i })).filter(({ s, i }) => s && !s.isBot && i !== me);
  if (!people.length) { list.innerHTML = '<div class="small arc-empty">Nikogo jeszcze nie ma w pokoju.</div>'; return; }
  list.innerHTML = people.map(({ s, i }) => {
    const busy = s!.arena;
    const waiting = outgoing?.to === i;
    return `<div class="arc-person"><span>${esc(s!.name)}${busy ? ' <i>🕹️ gra</i>' : ''}</span>`
      + `<button class="act btn-gold" data-seat="${i}" ${busy || busyCard || outgoing ? 'disabled' : ''}>${waiting ? 'Czekam…' : 'Wyzwij'}</button></div>`;
  }).join('');
  list.querySelectorAll<HTMLButtonElement>('button[data-seat]').forEach(b => b.addEventListener('click', () => invite(Number(b.dataset.seat))));
}

function invite(to: number): void {
  if (!net || outgoing || inArena()) return;
  net.send({ k: 'inv', to });
  outgoing = { to, timer: window.setTimeout(() => { outgoing = null; status(`${nameOf(to)} nie odpowiada.`, '#arcStatus'); renderPanel(); }, INVITE_MS) };
  status(`Wysłane! Czekam, aż ${nameOf(to)} przyjmie wyzwanie…`, '#arcStatus');
  renderPanel();
}

function answer(ok: boolean): void {
  const inv = incoming;
  if (!inv || !net) return;
  clearTimeout(inv.timer); incoming = null;
  $('#arcInvite').classList.add('hide');
  if (ok && (inArena() || net.cardGameRunning())) ok = false;
  net.send({ k: 'ans', to: inv.from, ok });
  if (ok) startDuel(inv.from, 1);
}

function startBot(): void {
  if (!net || net.cardGameRunning() || inArena()) return;
  box().classList.add('hide');
  foeSeat = -1;
  net.send({ k: 'in', vs: -1 });
  session = enterArena({ side: 0, myName: net.myName(), foeName: 'Bot', net: null, bot: level(), onExit });
}

function startDuel(foe: number, side: 0 | 1): void {
  if (!net) return;
  box().classList.add('hide');
  foeSeat = foe;
  net.send({ k: 'in', vs: foe });
  const n = net;
  session = enterArena({
    side, myName: n.myName(), foeName: nameOf(foe), net: { send: m => n.send({ k: 'd', to: foe, m }) }, onExit,
  });
}

function onExit(): void {
  session = null; foeSeat = -1;
  net?.send({ k: 'in', vs: null });
}

/** Wiadomość automatu od gracza z miejsca `from` (przekazana przez hosta). */
export function arcadeReceive(from: number, d: ArcMsg): void {
  if (!net) return;
  switch (d.k) {
    case 'inv': {
      // zajęty – od razu odmawiamy
      if (inArena() || incoming || net.cardGameRunning()) { net.send({ k: 'ans', to: from, ok: false }); return; }
      incoming = { from, timer: window.setTimeout(() => answer(false), INVITE_MS) };
      $('#arcInvTxt').textContent = `${nameOf(from)} wyzywa cię na pojedynek 1v1 na automacie!`;
      $('#arcInvite').classList.remove('hide');
      return;
    }
    case 'ans': {
      if (!outgoing || outgoing.to !== from) return;
      clearTimeout(outgoing.timer); outgoing = null;
      if (d.ok && !inArena()) { status('', '#arcStatus'); startDuel(from, 0); }
      else { status(`${nameOf(from)} odmawia (albo jest zajęty).`, '#arcStatus'); renderPanel(); }
      return;
    }
    case 'd':
      if (from === foeSeat) session?.receive(d.m);
      return;
    case 'stop':
      arcadeStop('Host zaczyna partię – wracasz do stołu.');
      return;
    default:
  }
}

/** Zamyka automat z zewnątrz (start partii, utrata połączenia). */
export function arcadeStop(why = ''): void {
  if (incoming) { clearTimeout(incoming.timer); incoming = null; $('#arcInvite').classList.add('hide'); }
  if (outgoing) { clearTimeout(outgoing.timer); outgoing = null; }
  box().classList.add('hide');
  if (session) { session.close(); session = null; foeSeat = -1; }
  if (why) status(why, '#arcStatus');
}

/** Nowy stan poczekalni: odświeża listę i napis na automacie w barze. */
export function arcadeLobby(info: LobbyInfo): void {
  lobby = info;
  setArcadeBusy(info.seats.some(s => s?.arena));
  if (!box().classList.contains('hide')) renderPanel();
}
