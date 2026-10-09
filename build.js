// Bundles the browser game into one self-contained page.
//   node build.js              → dist/index.html, a complete document for GitHub Pages
//   node build.js --fragment   → also fragment/coffee-flow.html, the same page without <html>/<head>/<body>
//                                (for hosts that add their own document wrapper)
// The page runs the same src/sim.js, src/levels.js and src/bot.js that the headless tools load.
'use strict';
const fs = require('fs');
const path = require('path');

(async () => {
  const { build } = await import('vite');
  await build({ root: __dirname, logLevel: 'warn' });
  const out = path.join(__dirname, 'dist', 'index.html');
  const page = fs.readFileSync(out, 'utf8');
  fs.writeFileSync(path.join(__dirname, 'dist', '.nojekyll'), '');
  console.log('dist/index.html', (page.length / 1024).toFixed(0) + ' KB');

  if (process.argv.includes('--fragment')) {
    // the head's title, fonts and inlined code, then the body; the document's own metas stay with the document
    const head = /<head>([\s\S]*)<\/head>/.exec(page)[1].replace(/<meta[^>]*>\s*/g, '');
    const body = /<body>([\s\S]*)<\/body>/.exec(page)[1];
    fs.mkdirSync(path.join(__dirname, 'fragment'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'fragment', 'coffee-flow.html'), head.trim() + '\n' + body.trim() + '\n');
    console.log('fragment/coffee-flow.html');
  }
})().catch((err) => { console.error(err); process.exit(1); });
