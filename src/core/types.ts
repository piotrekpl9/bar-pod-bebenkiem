// Wspólne typy logiki gry. Ten katalog nie zna DOM-u, three.js ani sieci.

export type Rank = 'K' | 'Q' | 'A';
/** J = joker, D = Diabeł, M = Lustro, X = Podwójny strzał */
export type SpecialCard = 'J' | 'D' | 'M' | 'X';
export type Card = Rank | SpecialCard;

export type Mode = 'classic' | 'special';
export type TableSize = 4 | 6 | 8;

export type Kind = 'frog' | 'robot' | 'owl' | 'mustache' | 'bear' | 'cat' | 'rabbit' | 'penguin';

/** Stan miejsca, który widzą wszyscy (bez kart na ręce i bez pozycji naboju). */
export interface PublicSeat {
  name: string;
  kind: Kind;
  isBot: boolean;
  alive: boolean;
  shots: number;
  count: number;
}
export type PublicState = (PublicSeat | null)[];

export type Effect = 'devil' | 'mirror' | null;

/** Zdarzenia, które host rozsyła wszystkim graczom (i odtwarza u siebie). */
export type GameEvent =
  | { t: 'begin'; st: PublicState; mode: Mode }
  | { t: 'round'; round: number; table: Rank; st: PublicState }
  | { t: 'turn'; seat: number; canChallenge: boolean; forced: boolean; ms: number; lastSeat: number; lastN: number }
  | { t: 'play'; seat: number; n: number; st: PublicState }
  | { t: 'liar'; seat: number; target: number }
  | {
      t: 'reveal'; cards: Card[]; truthful: boolean; target: number; challenger: number;
      effect: Effect; double: boolean; shooters: number[];
    }
  | { t: 'shot'; seat: number; dead: boolean; den: number; second: boolean; st: PublicState }
  | { t: 'end'; winner: number; rounds: number; st: PublicState }
  | { t: 'info'; text: string; st?: PublicState };

/** Zdarzenia wysyłane tylko do jednego gracza. */
export type PrivateEvent =
  | { t: 'hand'; cards: Card[]; deal: boolean }
  | {
      t: 'sync'; mode: Mode; st: PublicState; table: Rank; round: number;
      pileN: number; lastN: number; active: number;
    };

export type ViewEvent = GameEvent | PrivateEvent;

/** Decyzja gracza w turze (indeksy kart na ręce). */
export type Action = { type: 'play'; cards: number[] } | { type: 'liar' };

export interface TurnRequest {
  canChallenge: boolean;
  forced: boolean;
  ms: number;
}

export interface Play {
  seat: number;
  cards: Card[];
}

export interface Traits {
  /** szansa na blef, gdy bot ma prawdziwe karty */
  bluff: number;
  /** mnożnik podejrzliwości przy sprawdzaniu */
  susp: number;
}
