// Składa całą grę w jeden plik dist/index.html (biblioteki wklejone do środka,
// więc plik działa offline i bez żadnego serwera z plikami).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const read = p => readFileSync(p, 'utf8');
const lib = p => read(p).replaceAll('</script', '<\\/script');

const js = readdirSync('src/js').filter(f => f.endsWith('.js')).sort()
  .map(f => read(`src/js/${f}`)).join('');

// funkcje zamiast stringów w replace(), żeby znaki "$" w bibliotekach nie były interpretowane
const html = read('src/index.template.html')
  .replace('/*STYLE*/', () => read('src/styles.css'))
  .replace('/*THREE*/', () => lib('node_modules/three/build/three.min.js'))
  .replace('/*PEER*/', () => lib('node_modules/peerjs/dist/peerjs.min.js'))
  .replace('/*JS*/', () => js);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`dist/index.html gotowy (${(html.length / 1024).toFixed(0)} KB)`);
