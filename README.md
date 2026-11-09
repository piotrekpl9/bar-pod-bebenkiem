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

### Tryb „Specjalne karty”

Do talii dochodzi po jednej karcie (3 karty zawsze zostają nierozdane, więc nie wiadomo, które są w grze):

| Karta | Liczy się jako | Po odkryciu |
|---|---|---|
| 😈 Diabeł | prawda | strzelają wszyscy oprócz tego, kto go zagrał |
| 🪞 Lustro | prawda | kara odbija się na oskarżyciela |
| 💥 Podwójny strzał | kłamstwo | przegrany strzela dwa razy |

### Postacie i miejsca

Każdy wybiera postać w menu albo w poczekalni (żaba, robot, sowa, wąsacz, miś, kotka, królik, pingwin). Przy stole każda postać może siedzieć tylko raz, a boty dostają te, których nikt nie wybrał. Przed każdą partią miejsca są losowane; host może to wyłączyć w poczekalni.

Postać każdego człowieka przy stole obraca głowę tam, gdzie on naprawdę patrzy (przeciąganie widoku). Kiedy patrzysz prosto na kogoś, on widzi, że twoja postać patrzy na niego.

## Jak grać

**Z linkiem:** gra jest na GitHub Pages pod adresem `https://<login>.github.io/<repo>/`. Host klika **Załóż pokój** i **Wyślij zaproszenie**, koledzy wchodzą w link i klikają **Dołącz**. Działa też na telefonach.

**Bez internetu do hostingu:** zbuduj grę i wyślij kolegom plik `dist/index.html`. Każdy otwiera go w Chrome lub Edge, a kod pokoju wpisuje ręcznie.

## Praca nad kodem

Wymaga Node.js 20.19+ (albo 22.12+).

```bash
npm install
npm run dev          # serwer deweloperski z podglądem na żywo
npm test             # testy logiki gry (Vitest)
npm run typecheck    # sprawdzenie typów TypeScript
npm run build        # dist/index.html: cała gra w jednym pliku (~0,75 MB)
npm run check        # wszystko powyżej po kolei
```

Testy multiplayera bez internetu:

```bash
npm run peer-server  # lokalny serwer PeerJS na 127.0.0.1:9000
# otwórz dist/index.html?ps=127.0.0.1 w kilku oknach / profilach przeglądarki
```

## Architektura

```
src/
  core/        # logika gry: czysty TypeScript, bez DOM-u, three.js i sieci
    types.ts       # karty, zdarzenia, akcje
    constants.ts   # talie, czasy, postacie, charaktery botów
    deck.ts        # budowanie talii i rozdawanie
    rules.ts       # prawda/kłamstwo, KŁAMCA!, Diabeł/Lustro/×2, rewolwer, kolejka
    bots.ts        # decyzje botów
    engine.ts      # silnik partii (działa u hosta), komunikuje się przez EngineIO
    text.ts        # polskie teksty i odmiana
    kinds.ts       # postacie: wybór bez powtórzeń
    gaze.ts        # spojrzenia: przeliczanie między widokami graczy
    rng.ts         # losowanie (w testach z ziarnem)
  view/        # grafika 3D i animacje (three.js r128)
    scene.ts, textures.ts, characters.ts, tweens.ts, audio.ts
    game-view.ts   # odtwarza zdarzenia od hosta: karty, ruletka, HUD, kamera
  net/         # sieć P2P (PeerJS / WebRTC)
    protocol.ts    # wiadomości host ↔ gracz
    host.ts        # pokój, poczekalnia, ping, powrót po odświeżeniu, EngineIO
    client.ts      # dołączanie do pokoju
  ui/          # menu, poczekalnia, ekran końca
  main.ts      # łączy wszystko
tests/         # testy core (w tym setki symulowanych partii)
```

**Przepływ:** host uruchamia `GameEngine`, który podejmuje wszystkie decyzje i emituje zdarzenia (`round`, `turn`, `play`, `reveal`, `shot`…). `HostSession` wysyła je wszystkim graczom i własnemu widokowi. Każdy widok odtwarza je w kolejce jako animacje. Gracze wysyłają tylko swoje ruchy, które host sprawdza (a silnik sprawdza je jeszcze raz). Karty na ręce dostaje wyłącznie ich właściciel.

**Sieć:** host rejestruje pokój na publicznym serwerze sygnalizacyjnym PeerJS jako `barpodbebenkiem-v1-<kod>`, gracze łączą się bezpośrednio z jego przeglądarką (STUN pomaga przejść przez routery). Co 2,5 s idzie ping; kto milczy ponad 10 s, zwalnia miejsce (w trakcie partii przejmuje je bot). Po odświeżeniu strony gracz wraca na swoje miejsce dzięki tokenowi w `sessionStorage`.

### Ograniczenia

- Gdy host zamknie lub odświeży kartę, pokój przepada.
- Bez serwera TURN połączenie nie przejdzie przez część sieci komórkowych i firmowych. Pomaga Wi-Fi albo zmiana hosta.

## Publikacja

Workflow `.github/workflows/pages.yml` przy każdym pushu na `main` lub `master` sprawdza typy, uruchamia testy, buduje grę i publikuje ją na GitHub Pages (w ustawieniach repo: **Settings → Pages → Source: GitHub Actions**). Przy pull requestach tylko sprawdza.
