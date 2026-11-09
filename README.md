# Bar pod Bębenkiem

Karciany blef z rosyjską ruletką w 3D, w przeglądarce. Grasz ze znajomymi przez internet (P2P, bez kont i bez własnego serwera) albo z botami. Przy stole może siedzieć 4, 6 albo 8 osób.

## Zasady

- Każdy dostaje 5 kart. Talia zależy od liczby graczy:

  | Gracze | K | Q | A | Joker | Razem |
  |---|---|---|---|---|---|
  | 4 | 6 | 6 | 6 | 2 | 20 |
  | 6 | 9 | 9 | 9 | 3 | 30 |
  | 8 | 12 | 12 | 12 | 4 | 40 |

- Każda runda ma **kartę stołu**. W swojej turze kładziesz zakryte 1–3 karty i twierdzisz, że to karty stołu. Joker zawsze pasuje.
- Następny gracz gra dalej albo krzyczy **KŁAMCA!**. Wtedy odkrywa się ostatnie zagrane karty.
- Kto się pomylił (kłamca albo oskarżyciel), pociąga za spust swojego rewolweru: 1 nabój, 6 komór, szansa rośnie z każdym strzałem.
- Wygrywa ostatni żywy. Czas na ruch: 60 s (4 graczy), 45 s (6), 40 s (8).

## Jak grać

**Bez instalacji:** zbuduj grę (niżej) i wyślij kolegom plik `dist/index.html`. Każdy otwiera go w Chrome lub Edge. Host klika **Załóż pokój** i podaje 5-znakowy kod, reszta wpisuje go i klika **Dołącz**.

**Z linkiem:** po włączeniu GitHub Pages (niżej) gra jest pod adresem `https://<twój-login>.github.io/<nazwa-repo>/`. Przycisk **Wyślij zaproszenie** daje wtedy link, który od razu wpisuje kod pokoju. Tak da się grać też na telefonach.

## Budowanie

Wymaga Node.js 18+.

```bash
npm install
npm run build        # tworzy dist/index.html (jeden plik, ~0,8 MB)
```

## Publikacja na GitHub Pages

W repozytorium wejdź w **Settings → Pages → Build and deployment → Source** i wybierz **GitHub Actions**. Każdy push na `main` sam zbuduje grę i ją opublikuje (workflow `.github/workflows/pages.yml`).

## Jak to działa

- **Grafika:** [three.js](https://threejs.org/) r128. Wszystkie postacie, stół i rewolwer są zbudowane z prostych brył w kodzie, bez plików modeli. Dźwięki są generowane przez Web Audio.
- **Sieć:** [PeerJS](https://peerjs.com/) (WebRTC). Host rejestruje pokój na publicznym serwerze sygnalizacyjnym PeerJS pod nazwą `barpodbebenkiem-v1-<kod>`. Gracze łączą się bezpośrednio z przeglądarką hosta, a serwery STUN pomagają przebić się przez routery.
- **Host prowadzi grę:** tasuje karty, pilnuje kolejki, steruje botami i losuje naboje. Gracze wysyłają tylko swoje ruchy, a host je sprawdza. Karty na ręce trafiają wyłącznie do właściciela.
- **Odporność:** co 2,5 s idzie ping. Gracz, który milczy ponad 10 s, zwalnia miejsce (w trakcie partii przejmuje je bot). Po odświeżeniu strony gracz wraca na swoje miejsce dzięki tokenowi w `sessionStorage`. Host może wyrzucać graczy w poczekalni.

### Ograniczenia

- Gdy host zamknie lub odświeży kartę, pokój przepada.
- Bez serwera TURN połączenie nie przejdzie przez część sieci komórkowych i firmowych. Pomaga Wi-Fi albo zmiana hosta.

## Struktura

```
src/
  index.template.html   # HTML i dodatkowe style, znaczniki /*STYLE*/ /*THREE*/ /*PEER*/ /*JS*/
  styles.css            # główne style HUD-u
  js/01-utils.js        # pomocnicze funkcje i teksty
  js/02-audio.js        # syntezowane dźwięki
  js/03-scene.js        # sala, stół, lampa, tekstury z canvasu
  js/04-characters.js   # 8 postaci, rewolwer, rozmieszczenie miejsc
  js/05-game.js         # widok, logika hosta, boty, sieć, lobby, kamera
build.mjs               # składa wszystko w dist/index.html
tools/peer-server.mjs   # lokalny serwer PeerJS do testów
```

## Testy lokalne bez internetu

```bash
npm run peer-server
# otwórz dist/index.html?ps=127.0.0.1 w kilku kartach / profilach przeglądarki
```
