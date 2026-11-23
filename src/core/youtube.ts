// Linki do YouTube: wyciąganie identyfikatora filmu i adres odtwarzacza.

const ID = /^[A-Za-z0-9_-]{11}$/;

export const isVideoId = (s: unknown): s is string => typeof s === 'string' && ID.test(s);

/**
 * Wyciąga 11-znakowy identyfikator z linku YouTube (watch, youtu.be, shorts, embed, live, music)
 * albo przyjmuje sam identyfikator. Zwraca też czas startu z `t=` / `start=`, jeśli jest.
 */
export function parseYouTube(input: string): { id: string; start: number } | null {
  const s = input.trim();
  if (ID.test(s)) return { id: s, start: 0 };
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] ?? null;
  }
  if (!id || !ID.test(id)) return null;
  return { id, start: parseTime(url.searchParams.get('t') ?? url.searchParams.get('start')) };
}

/** „90”, „90s”, „1m30s”, „1h2m3s” → sekundy. */
export function parseTime(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !m[0]) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Głośność telewizora wspólna dla całego stołu. */
export interface TvVolume { volume: number; muted: boolean }
export const DEFAULT_TV_VOLUME: TvVolume = { volume: 60, muted: true };

/** Dane z sieci: głośność 0–100 (liczba całkowita) i wyciszenie. */
export function sanitizeVolume(v: unknown): TvVolume | null {
  if (!v || typeof v !== 'object') return null;
  const { volume, muted } = v as Record<string, unknown>;
  if (typeof volume !== 'number' || !Number.isFinite(volume) || typeof muted !== 'boolean') return null;
  return { volume: Math.round(Math.max(0, Math.min(100, volume))), muted };
}

/** Kody błędów odtwarzacza YouTube → komunikat po polsku. */
export function tvErrorText(code: number): string {
  switch (code) {
    case 2: return 'Niepoprawny link do filmu.';
    case 5: return 'Przeglądarka nie potrafi odtworzyć tego filmu.';
    case 100: return 'Ten film nie istnieje albo jest prywatny.';
    case 101: case 150: return 'Autor tego filmu nie pozwala odtwarzać go poza YouTube. Spróbuj innego filmiku.';
    case 152: case 153: return 'YouTube nie odtwarza filmów na stronie otwartej z pliku na dysku. Otwórz grę z linku (GitHub Pages).';
    default: return `Błąd odtwarzania YouTube (kod ${code}).`;
  }
}

/** Adres odtwarzacza: bez sterowania, wyciszony na start (inaczej przeglądarka zablokuje autoodtwarzanie). */
export function embedUrl(id: string, startSec: number, origin?: string): string {
  const p = new URLSearchParams({
    autoplay: '1', mute: '1', controls: '0', playsinline: '1', rel: '0', modestbranding: '1',
    iv_load_policy: '3', disablekb: '1', enablejsapi: '1', loop: '1', playlist: id,
    start: String(Math.max(0, Math.floor(startSec))),
  });
  if (origin) p.set('origin', origin);
  return `https://www.youtube-nocookie.com/embed/${id}?${p}`;
}

/** Głośność u mnie: wspólna × mój suwak (0–100). 0 = wyciszone. */
export function effectiveVolume(shared: TvVolume, here: number, mutedHere: boolean): number {
  if (mutedHere || shared.muted) return 0;
  return Math.round((shared.volume * Math.max(0, Math.min(100, here))) / 100);
}
