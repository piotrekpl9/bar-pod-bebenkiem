// Punkt wejścia: łączy menu, sesję (host / gracz) i widok 3D.

import '@fontsource/sancreek/latin.css';
import '@fontsource/sancreek/latin-ext.css';
import './styles.css';

import { ClientSession } from './net/client';
import { HostSession } from './net/host';
import { normalizeCode, type LobbyInfo } from './net/protocol';
import type { Kind } from './core/types';
import { $, showScreen, status, store } from './ui/dom';
import { initMenuKindPicker, initRules, initSegments, initShareButton, paintSegments, prefillCodeFromHash, renderLobby, settings, showEnd, showHostLost } from './ui/screens';
import { initAudio, toggleMute } from './view/audio';
import { parseYouTube, tvErrorText, type TvVolume } from './core/youtube';
import { TV_SUPPORTED, onTvError, onTvVolume, setTvHereVolume, setTvMutedHere, setTvVideo, setTvVolume, tvHereVolume, tvMutedHere, tvVolume } from './view/tv';
import { V, bindView, endTurnUI, setMySeat, startRendering } from './view/game-view';

let host: HostSession | null = null;
let client: ClientSession | null = null;

const lobbyCtx = () => ({
  isHost: !!host,
  mySeat: V.mySeat,
  kick: (i: number) => host?.kick(i),
  pick: (k: Kind) => (host ? host.pick(host.localSeat, k) : client?.pick(k)),
});
const showLobby = (info: LobbyInfo) => renderLobby(info, lobbyCtx());

bindView({
  send: a => (host ? host.act(V.mySeat, a) : client?.act(a)),
  look: g => (host ? host.look(g) : client?.look(g)),
  end: ev => showEnd(ev, V.mySeat, V.seats, !!host),
});

initSegments({
  size: n => { const err = host?.setSize(n); status(err ?? '', '#lobbyStatus'); if (!err) settings.size = n; },
  mode: m => { host?.setMode(m); settings.mode = m; },
});
initShareButton(() => host?.code ?? client?.code ?? '');
initRules();
initMenuKindPicker();
$<HTMLInputElement>('#shuffleSeats').addEventListener('change', e => host?.setShuffle((e.target as HTMLInputElement).checked));
prefillCodeFromHash();

// ---------- menu ----------
$('#soloBtn').addEventListener('click', () => {
  initAudio();
  setMySeat(0);
  host = HostSession.solo(settings.nick(), settings.kind, settings.size, settings.mode, { opened() {}, lobby() {}, status });
});

$('#createBtn').addEventListener('click', () => {
  initAudio();
  status('Zakładam pokój…');
  setMySeat(0);
  host = new HostSession(settings.size, settings.mode, true, {
    opened: code => { location.hash = code; showScreen('#lobbyScreen'); },
    lobby: showLobby,
    status: t => status(t),
  });
  host.open(settings.nick(), settings.kind);
});

function join(): void {
  initAudio();
  const code = normalizeCode($<HTMLInputElement>('#codeIn').value);
  if (code.length !== 5) { status('Kod pokoju ma 5 znaków.'); return; }
  status(`Łączę z pokojem ${code}…`);
  client = new ClientSession({
    welcome: seat => { setMySeat(seat); showScreen('#lobbyScreen'); },
    lobby: showLobby,
    kicked: () => { endTurnUI(); showScreen('#menuScreen'); status('Host wyrzucił cię z pokoju.'); },
    rejected: reason => { status(reason); showScreen('#menuScreen'); },
    lost: () => { endTurnUI(); showHostLost(); },
    status: t => status(t),
  });
  client.join(code, settings.nick(), settings.kind);
}
$('#joinBtn').addEventListener('click', join);
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

// ---------- poczekalnia i koniec gry ----------
$('#startBtn').addEventListener('click', () => {
  initAudio();
  const err = host?.startGame($<HTMLInputElement>('#fillBots').checked);
  if (err) status(err, '#lobbyStatus');
});
$('#againBtn').addEventListener('click', () => {
  if (!host) return;
  if (host.online) { showScreen('#lobbyScreen'); host.broadcastLobby(); paintSegments(host.size, host.mode); }
  else host = HostSession.solo(settings.nick(), settings.kind, settings.size, settings.mode, { opened() {}, lobby() {}, status });
});
const backToMenu = () => { location.href = location.pathname; };
$('#menuBtn').addEventListener('click', backToMenu);
$('#leaveBtn').addEventListener('click', backToMenu);
$('#soundBtn').addEventListener('click', () => { initAudio(); $('#soundBtn').textContent = toggleMute() ? '🔇' : '🔊'; });

// ---------- telewizor ----------
/** Puszcza filmik u wszystkich: host rozsyła, gracz prosi hosta, bez pokoju – tylko u siebie. */
function tvSet(id: string | null, start: number): void {
  if (host) host.setTv(id, start);
  else if (client) client.tv(id, start);
  else setTvVideo(id, start);
}
const tvBox = $('#tvBox');
onTvError(code => { tvBox.classList.remove('hide'); status(tvErrorText(code), '#tvStatus'); });
const FILE_NOTE = 'Z pliku na dysku YouTube nie odtwarza filmów. Otwórz grę z linku (GitHub Pages) albo przez npm run dev.';
$('#tvBtn').addEventListener('click', () => {
  tvBox.classList.toggle('hide');
  if (!TV_SUPPORTED) status(FILE_NOTE, '#tvStatus');
});
$('#tvClose').addEventListener('click', () => tvBox.classList.add('hide'));
const playTv = () => {
  const v = parseYouTube($<HTMLInputElement>('#tvUrl').value);
  if (!v) { status('To nie wygląda na link do YouTube.', '#tvStatus'); return; }
  tvSet(v.id, v.start);
  status(TV_SUPPORTED ? 'Leci! 📺' : `Wysłane do pozostałych. U ciebie: ${FILE_NOTE}`, '#tvStatus');
};
$('#tvPlay').addEventListener('click', playTv);
$('#tvUrl').addEventListener('keydown', e => { if (e.key === 'Enter') playTv(); });
$('#tvOff').addEventListener('click', () => { tvSet(null, 0); status('Telewizor wyłączony.', '#tvStatus'); });
// Głośność: wspólna dla stołu (host rozsyła), bez pokoju – tylko u siebie.
function tvVolSet(v: TvVolume): void {
  if (host) host.setTvVolume(v);
  else if (client) { setTvVolume(v); client.tvVolume(v); }
  else setTvVolume(v);
}
const volInput = $<HTMLInputElement>('#tvVol');
const hereInput = $<HTMLInputElement>('#tvHereVol');
function paintVolume(v: TvVolume): void {
  const silent = v.muted || v.volume === 0; // przycisk pokazuje wspólny stan…
  $('#tvMute').textContent = silent ? '🔇' : v.volume < 40 ? '🔈' : '🔊';
  $('.tv-vol').classList.toggle('off', silent);
  if (document.activeElement !== volInput) volInput.value = String(v.volume);
  $('#tvVolTxt').textContent = `${v.volume}%`;
  // mój pasek
  const here = tvHereVolume(), hereOff = tvMutedHere() || here === 0;
  $('#tvMuteHere').textContent = hereOff ? '🔇' : here < 40 ? '🔈' : '🔊';
  $('.tv-here').classList.toggle('off', hereOff);
  if (document.activeElement !== hereInput) hereInput.value = String(here);
  $('#tvHereTxt').textContent = `${here}%`;
}
onTvVolume(paintVolume);
paintVolume(tvVolume());
const nudge = (d: number) => { const v = tvVolume(); tvVolSet({ volume: Math.max(0, Math.min(100, v.volume + d)), muted: false }); };
$('#tvMute').addEventListener('click', () => { const v = tvVolume(); tvVolSet({ ...v, muted: !(v.muted || v.volume === 0), volume: v.volume || 60 }); });
$('#tvDown').addEventListener('click', () => nudge(-10));
$('#tvUp').addEventListener('click', () => nudge(10));
// suwak: na bieżąco u siebie, do innych najwyżej co 150 ms i zawsze po puszczeniu
let volSentAt = 0;
volInput.addEventListener('input', () => {
  const v = { volume: Number(volInput.value), muted: false };
  $('#tvVolTxt').textContent = `${v.volume}%`;
  if (Date.now() - volSentAt > 150) { volSentAt = Date.now(); tvVolSet(v); }
});
volInput.addEventListener('change', () => tvVolSet({ volume: Number(volInput.value), muted: false }));
// mój pasek: tylko u mnie, zapamiętany w przeglądarce
const savedHere = Number(store.get('bpb-tv-here-vol') ?? 100);
setTvHereVolume(Number.isFinite(savedHere) ? savedHere : 100);
setTvMutedHere(store.get('bpb-tv-mute-here') === '1');
const setHere = (v: number) => { setTvHereVolume(v); store.set('bpb-tv-here-vol', String(tvHereVolume())); };
$('#tvMuteHere').addEventListener('click', () => {
  if (tvHereVolume() === 0) { setHere(60); setTvMutedHere(false); }
  else setTvMutedHere(!tvMutedHere());
  store.set('bpb-tv-mute-here', tvMutedHere() ? '1' : '0');
});
hereInput.addEventListener('input', () => { if (tvMutedHere()) { setTvMutedHere(false); store.set('bpb-tv-mute-here', '0'); } setHere(Number(hereInput.value)); });

startRendering();
