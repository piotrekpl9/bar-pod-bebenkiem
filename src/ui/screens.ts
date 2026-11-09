// Menu, poczekalnia, ekran końca gry, zasady.

import { KINDS, isTableSize } from '../core/constants';
import { KIND_INFO, isKind } from '../core/kinds';
import { deckDesc, people, rounds } from '../core/text';
import type { GameEvent, Kind, Mode, PublicState, TableSize } from '../core/types';
import type { LobbyInfo } from '../net/protocol';
import { $, copyText, showScreen, status, store } from './dom';

// ---------- ustawienia zapamiętane w przeglądarce ----------
export const settings = {
  size: (() => { const v = Number(store.get('bpb-n')); return isTableSize(v) ? v : 4; })() as TableSize,
  mode: (store.get('bpb-mode') === 'special' ? 'special' : 'classic') as Mode,
  kind: (() => { const k = store.get('bpb-kind'); return isKind(k) ? k : 'frog'; })() as Kind,
  nick(): string {
    const n = $<HTMLInputElement>('#nick').value.trim().replace(/\s+/g, ' ').slice(0, 14);
    store.set('bpb-nick', n);
    return n || 'Gracz';
  },
};

/** Przełączniki 4/6/8 i trybu: w menu zmieniają ustawienia, w poczekalni wołają hosta. */
export function initSegments(lobby: { size(n: TableSize): void; mode(m: Mode): void }): void {
  $<HTMLInputElement>('#nick').value = store.get('bpb-nick') ?? '';
  document.querySelectorAll<HTMLButtonElement>('#sizeSeg button').forEach(b => b.addEventListener('click', () => {
    settings.size = Number(b.dataset.n) as TableSize; store.set('bpb-n', String(settings.size)); paintSegments(settings.size, settings.mode);
  }));
  document.querySelectorAll<HTMLButtonElement>('#modeSeg button').forEach(b => b.addEventListener('click', () => {
    settings.mode = b.dataset.m as Mode; store.set('bpb-mode', settings.mode); paintSegments(settings.size, settings.mode);
  }));
  document.querySelectorAll<HTMLButtonElement>('#sizeSegLobby button').forEach(b => b.addEventListener('click', () => lobby.size(Number(b.dataset.n) as TableSize)));
  document.querySelectorAll<HTMLButtonElement>('#modeSegLobby button').forEach(b => b.addEventListener('click', () => lobby.mode(b.dataset.m as Mode)));
  paintSegments(settings.size, settings.mode);
}

export function paintSegments(size: TableSize, mode: Mode): void {
  document.querySelectorAll<HTMLButtonElement>('.seg button[data-n]').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === size));
  document.querySelectorAll<HTMLButtonElement>('.modeseg button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
}

// ---------- wybór postaci ----------
/** Rysuje 8 przycisków postaci. `taken` = zajęte przez innych (wyszarzone). */
export function renderKindPicker(sel: string, current: Kind, taken: ReadonlySet<Kind>, onPick: (k: Kind) => void): void {
  const box = $(sel);
  box.innerHTML = '';
  for (const k of KINDS) {
    const b = document.createElement('button');
    const info = KIND_INFO[k];
    b.innerHTML = `<span class="e">${info.emoji}</span>${info.label}`;
    b.classList.toggle('on', k === current);
    b.disabled = taken.has(k) && k !== current;
    b.title = b.disabled ? `${info.label}: zajęta` : info.label;
    b.addEventListener('click', () => {
      settings.kind = k; store.set('bpb-kind', k);
      onPick(k);
    });
    box.appendChild(b);
  }
}
export function initMenuKindPicker(): void {
  const draw = () => renderKindPicker('#kindPick', settings.kind, new Set(), () => draw());
  draw();
}

/** Jeśli w adresie jest kod pokoju (#ABCDE), wpisuje go w pole „KOD”. */
export function prefillCodeFromHash(): void {
  const h = location.hash.replace('#', '').toUpperCase();
  if (/^[A-Z0-9]{5}$/.test(h)) { $<HTMLInputElement>('#codeIn').value = h; $('#joinHint').classList.remove('hide'); }
}

// ---------- poczekalnia ----------
export interface LobbyContext { isHost: boolean; mySeat: number; kick(i: number): void; pick(k: Kind): void }

export function renderLobby(info: LobbyInfo, ctx: LobbyContext): void {
  $('#roomCode').textContent = info.code;
  const list = $('#seatList');
  list.innerHTML = '';
  info.seats.forEach((s, i) => {
    const li = document.createElement('div');
    li.className = 'seat' + (s ? '' : ' empty') + (i === ctx.mySeat ? ' me' : '');
    const nm = document.createElement('span');
    nm.textContent = s ? `${KIND_INFO[s.kind]?.emoji ?? ''} ${s.name}` + (i === ctx.mySeat ? ' (ty)' : '') + (s.host ? ' 👑' : '') + (s.isBot ? ' 🤖' : '') : 'wolne miejsce';
    li.appendChild(nm);
    if (ctx.isHost && s && !s.host) {
      const k = document.createElement('button');
      k.className = 'kick'; k.textContent = '✕'; k.title = 'Wyrzuć z pokoju';
      k.addEventListener('click', () => ctx.kick(i));
      li.appendChild(k);
    }
    list.appendChild(li);
  });
  $('#hostControls').classList.toggle('hide', !ctx.isHost);
  $('#clientWait').classList.toggle('hide', ctx.isHost);
  $('#tableInfo').innerHTML = `Stół na ${people(info.n)} · tryb: <b>${info.mode === 'special' ? 'specjalne karty' : 'klasyczny'}</b><br>${deckDesc(info.n, info.mode)}`;
  paintSegments(info.n, info.mode);
  $<HTMLInputElement>('#shuffleSeats').checked = info.shuffle;
  const me = info.seats[ctx.mySeat];
  const taken = new Set(info.seats.flatMap((s, i) => (s && i !== ctx.mySeat ? [s.kind] : [])));
  renderKindPicker('#kindPickLobby', me?.kind ?? settings.kind, taken, k => ctx.pick(k));
}

const IS_WEB = /^https?:$/.test(location.protocol);
export function initShareButton(getCode: () => string): void {
  const btn = $('#shareBtn');
  btn.textContent = IS_WEB ? 'Wyślij zaproszenie' : 'Kopiuj kod';
  btn.addEventListener('click', async () => {
    const code = getCode();
    if (IS_WEB) {
      const url = `${location.origin}${location.pathname}#${code}`;
      const mobile = window.matchMedia?.('(pointer: coarse)').matches;
      if (mobile && navigator.share) {
        try { await navigator.share({ title: 'Bar pod Bębenkiem', text: `Wbijaj do baru! Kod: ${code}`, url }); return; }
        catch (e) { if ((e as Error)?.name === 'AbortError') return; }
      }
      status(await copyText(url) ? 'Link skopiowany. Wklej go kolegom.' : url, '#lobbyStatus');
    } else {
      const t = `Bar pod Bębenkiem: otwórz plik gry, kliknij Dołącz i wpisz kod ${code}`;
      status(await copyText(t) ? `Skopiowano. Wklej kolegom, oni wpisują kod ${code}.` : `Podaj kolegom kod: ${code}`, '#lobbyStatus');
    }
  });
}

// ---------- koniec gry ----------
export function showEnd(ev: Extract<GameEvent, { t: 'end' }>, mySeat: number, seats: PublicState, isHost: boolean): void {
  const w = ev.winner;
  let title: string, text: string;
  if (w === mySeat) { title = 'Wygrałeś!'; text = `Przetrwałeś ${rounds(ev.rounds)} i zgarnąłeś cały stół.`; }
  else if (w >= 0) { title = `${seats[w]?.name ?? '?'} wygrywa`; text = seats[mySeat]?.alive ? 'Remis nie istnieje w tym barze.' : 'Bęben zatrzymał się na złej komorze.'; }
  else { title = 'Koniec gry'; text = 'Przy stole zostały same boty.'; }
  $('#endTitle').textContent = title;
  $('#endText').textContent = text;
  $('#againBtn').classList.toggle('hide', !isHost);
  $('#waitHost').classList.toggle('hide', isHost);
  showScreen('#endScreen');
}

export function showHostLost(): void {
  $('#endTitle').textContent = 'Host się rozłączył';
  $('#endText').textContent = 'Pokój został zamknięty. Wróć do menu i dołącz do nowego pokoju.';
  $('#againBtn').classList.add('hide');
  $('#waitHost').classList.add('hide');
  showScreen('#endScreen');
}

export function initRules(): void {
  const box = $('#rulesBox');
  $('#helpBtn').addEventListener('click', () => box.classList.toggle('open'));
  $('#rulesBtn').addEventListener('click', () => box.classList.toggle('open'));
  $('#rulesClose').addEventListener('click', () => box.classList.remove('open'));
}
