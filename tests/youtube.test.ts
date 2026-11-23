import { describe, expect, it } from 'vitest';
import { embedUrl, isVideoId, parseTime, parseYouTube, sanitizeVolume, tvErrorText } from '../src/core/youtube';

const ID = 'dQw4w9WgXcQ';

describe('linki do YouTube', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, 0],
    [`https://youtube.com/watch?v=${ID}&list=PL123&index=2`, 0],
    [`https://m.youtube.com/watch?v=${ID}&t=42`, 42],
    [`https://youtu.be/${ID}?t=1m30s`, 90],
    [`https://youtu.be/${ID}?si=abcDEF`, 0],
    [`https://www.youtube.com/shorts/${ID}`, 0],
    [`https://www.youtube.com/embed/${ID}?start=15`, 15],
    [`https://www.youtube.com/live/${ID}`, 0],
    [`https://music.youtube.com/watch?v=${ID}`, 0],
    [`youtube.com/watch?v=${ID}`, 0],
    [`  ${ID}  `, 0],
  ])('%s', (url, start) => {
    expect(parseYouTube(url)).toEqual({ id: ID, start });
  });

  it('odrzuca linki spoza YouTube i zepsute identyfikatory', () => {
    for (const bad of ['', 'kot', 'https://vimeo.com/123', `https://evil.com/watch?v=${ID}`, 'https://youtu.be/abc', 'https://www.youtube.com/watch?v=<script>', 'https://www.youtube.com/channel/UC123']) {
      expect(parseYouTube(bad)).toBeNull();
    }
  });

  it('czyta czas startu', () => {
    expect(parseTime('90')).toBe(90);
    expect(parseTime('2m')).toBe(120);
    expect(parseTime('1h2m3s')).toBe(3723);
    expect(parseTime('abc')).toBe(0);
    expect(parseTime(null)).toBe(0);
  });

  it('sprawdza identyfikator z sieci', () => {
    expect(isVideoId(ID)).toBe(true);
    for (const bad of [null, 5, 'short', `${ID}x`, 'dQw4w9WgXc"']) expect(isVideoId(bad)).toBe(false);
  });

  it('buduje adres odtwarzacza wyciszonego, z pętlą i startem', () => {
    const u = new URL(embedUrl(ID, 12.7, 'https://piotrekpl9.github.io'));
    expect(u.hostname).toBe('www.youtube-nocookie.com');
    expect(u.pathname).toBe(`/embed/${ID}`);
    expect(u.searchParams.get('mute')).toBe('1');
    expect(u.searchParams.get('autoplay')).toBe('1');
    expect(u.searchParams.get('start')).toBe('12');
    expect(u.searchParams.get('playlist')).toBe(ID);
    expect(u.searchParams.get('origin')).toBe('https://piotrekpl9.github.io');
  });
});

describe('błędy odtwarzacza', () => {
  it('tłumaczy najczęstsze kody', () => {
    expect(tvErrorText(150)).toMatch(/nie pozwala/);
    expect(tvErrorText(101)).toMatch(/nie pozwala/);
    expect(tvErrorText(153)).toMatch(/z pliku/);
    expect(tvErrorText(100)).toMatch(/prywatny/);
    expect(tvErrorText(999)).toMatch(/999/);
  });
});

describe('głośność z sieci', () => {
  it('przepuszcza i przycina do 0–100', () => {
    expect(sanitizeVolume({ volume: 55, muted: false })).toEqual({ volume: 55, muted: false });
    expect(sanitizeVolume({ volume: 140.4, muted: true })).toEqual({ volume: 100, muted: true });
    expect(sanitizeVolume({ volume: -3, muted: false })).toEqual({ volume: 0, muted: false });
  });
  it('odrzuca śmieci', () => {
    for (const bad of [null, 5, {}, { volume: '50', muted: false }, { volume: NaN, muted: false }, { volume: 50 }, { volume: 50, muted: 'nie' }]) expect(sanitizeVolume(bad)).toBeNull();
  });
});
