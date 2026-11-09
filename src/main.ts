// Punkt wejścia: łączy menu, sesję (host / gracz) i widok 3D.

import '@fontsource/sancreek/latin.css';
import '@fontsource/sancreek/latin-ext.css';
import './styles.css';

import { ClientSession } from './net/client';
import { HostSession } from './net/host';
import { normalizeCode, type LobbyInfo } from './net/protocol';
import { $, showScreen, status } from './ui/dom';
import { initRules, initSegments, initShareButton, paintSegments, prefillCodeFromHash, renderLobby, settings, showEnd, showHostLost } from './ui/screens';
import { initAudio, toggleMute } from './view/audio';
import { V, bindView, endTurnUI, setMySeat, startRendering } from './view/game-view';

let host: HostSession | null = null;
let client: ClientSession | null = null;

const lobbyCtx = () => ({ isHost: !!host, mySeat: V.mySeat, kick: (i: number) => host?.kick(i) });
const showLobby = (info: LobbyInfo) => renderLobby(info, lobbyCtx());

bindView({
  send: a => (host ? host.act(V.mySeat, a) : client?.act(a)),
  end: ev => showEnd(ev, V.mySeat, V.seats, !!host),
});

initSegments({
  size: n => { const err = host?.setSize(n); status(err ?? '', '#lobbyStatus'); if (!err) settings.size = n; },
  mode: m => { host?.setMode(m); settings.mode = m; },
});
initShareButton(() => host?.code ?? client?.code ?? '');
initRules();
prefillCodeFromHash();

// ---------- menu ----------
$('#soloBtn').addEventListener('click', () => {
  initAudio();
  setMySeat(0);
  host = HostSession.solo(settings.nick(), settings.size, settings.mode, { opened() {}, lobby() {}, status });
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
  host.open(settings.nick());
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
  client.join(code, settings.nick());
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
  else host = HostSession.solo(settings.nick(), settings.size, settings.mode, { opened() {}, lobby() {}, status });
});
const backToMenu = () => { location.href = location.pathname; };
$('#menuBtn').addEventListener('click', backToMenu);
$('#leaveBtn').addEventListener('click', backToMenu);
$('#soundBtn').addEventListener('click', () => { initAudio(); $('#soundBtn').textContent = toggleMute() ? '🔇' : '🔊'; });

startRendering();
