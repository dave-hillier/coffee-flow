// Bundles the browser game into one self-contained page.
//   node build.js              → dist/index.html, a complete document for GitHub Pages
//   node build.js --fragment   → also fragment/coffee-flow.html, the same page without <html>/<head>/<body>
//                                (for hosts that add their own document wrapper)
// The page runs the same src/sim.js, src/levels.js and src/bot.js that the headless tools load.
'use strict';
const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const head = src('head.html');
const split = head.indexOf('<div class="app">');
if (split < 0) throw new Error('src/head.html must contain <div class="app">');
const scripts = '<script>\n' + src('sim.js') + '\n' + src('levels.js') + '\n' + src('bot.js') + '\n</script>\n<script>\n' + src('ui.js') + '\n</script>\n';

const page = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
  '<meta name="description" content="A small isometric management game about flow, queues, capacity and finishing work.">\n' +
  head.slice(0, split) + '</head>\n<body>\n' + head.slice(split) + scripts + '</body>\n</html>\n';

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), page);
fs.writeFileSync(path.join(__dirname, 'dist', '.nojekyll'), '');
console.log('dist/index.html', (page.length / 1024).toFixed(0) + ' KB');

if (process.argv.includes('--fragment')) {
  fs.mkdirSync(path.join(__dirname, 'fragment'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'fragment', 'coffee-flow.html'), head + scripts);
  console.log('fragment/coffee-flow.html');
}
