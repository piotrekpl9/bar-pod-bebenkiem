// Składa całą grę w jeden plik dist/index.html (biblioteki wklejone do środka,
// więc plik działa offline i bez żadnego serwera z plikami).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const read = p => readFileSync(p, 'utf8');
const lib = p => read(p).replaceAll('</script', '<\\/script');

const js = readdirSync('src/js').filter(f => f.endsWith('.js')).sort()
  .map(f => read(`src/js/${f}`)).join('');

// funkcje zamiast stringów w replace(), żeby znaki "$" w bibliotekach nie były interpretowane
const font = (file, range) => `@font-face{font-family:'Sancreek';font-style:normal;font-weight:400;font-display:block;` +
  `src:url(data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/sancreek/files/${file}`).toString('base64')}) format('woff2');unicode-range:${range}}`;
const fonts = [
  font('sancreek-latin-400-normal.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212'),
  font('sancreek-latin-ext-400-normal.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+20A0-20AB,U+2C60-2C7F,U+A720-A7FF'),
].join('\n');

const html = read('src/index.template.html')
  .replace('/*FONTS*/', () => fonts)
  .replace('/*STYLE*/', () => read('src/styles.css'))
  .replace('/*THREE*/', () => lib('node_modules/three/build/three.min.js'))
  .replace('/*PEER*/', () => lib('node_modules/peerjs/dist/peerjs.min.js'))
  .replace('/*JS*/', () => js);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`dist/index.html gotowy (${(html.length / 1024).toFixed(0)} KB)`);
