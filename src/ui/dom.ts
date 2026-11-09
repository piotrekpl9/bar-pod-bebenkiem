export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Brak elementu ${sel}`);
  return el;
};

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

export function status(text: string, sel = '#menuStatus'): void { $(sel).textContent = text; }

const SCREENS = ['#menuScreen', '#lobbyScreen', '#endScreen'] as const;
export type ScreenId = typeof SCREENS[number];
export function showScreen(id: ScreenId): void { SCREENS.forEach(s => $(s).classList.toggle('hide', s !== id)); }
export function hideScreens(): void { SCREENS.forEach(s => $(s).classList.add('hide')); }

export async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* spróbuj starszej metody */ }
  try {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

export const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, v: string): void { try { localStorage.setItem(key, v); } catch { /* tryb prywatny */ } },
};
export const session = {
  get(key: string): string | null { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key: string, v: string): void { try { sessionStorage.setItem(key, v); } catch { /* brak */ } },
  remove(key: string): void { try { sessionStorage.removeItem(key); } catch { /* brak */ } },
};
