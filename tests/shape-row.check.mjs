import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = fs.readFileSync(path.join(root, 'shared/shape-row.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'shared/shape-row.js'), 'utf8');
assert.match(css, /flex-wrap:\s*nowrap/);
assert.match(css, /overflow-x:\s*auto/);
assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
assert.match(css, /flex-shrink:\s*0/);
assert.match(js, /scrollIntoView/);
assert.match(js, /inline:\s*['"]nearest['"]/);
assert.doesNotMatch(js, /block:\s*['"]start['"]/);

const skip = new Set(['admin', 'noya-morph']);
const pages = [];
for (const name of fs.readdirSync(root)) {
  const index = path.join(root, name, 'index.html');
  if (!fs.existsSync(index)) continue;
  if (skip.has(name) || name.startsWith('.')) continue;
  if (/mercury|\bsol\b/i.test(name)) {
    const html = fs.readFileSync(index, 'utf8');
    assert(!html.includes('shape-row'), `${name}: Mercury And Sol must stay untouched`);
    continue;
  }
  const html = fs.readFileSync(index, 'utf8');
  const hasShapes = /shape-grid|id="shapes"|class="shapes"/.test(html);
  if (!hasShapes) {
    assert(!html.includes('shape-row'), `${name}: no shape UI, should not include shape-row`);
    continue;
  }
  assert(html.includes('shared/shape-row.css?v=shaperow-1'), `${name}: missing shape-row.css`);
  assert(html.includes('shared/shape-row.js?v=shaperow-1'), `${name}: missing shape-row.js`);
  pages.push(name);
}
assert(pages.includes('ndw200'), 'ndw200 must be included');
assert(pages.length >= 50, `expected many pages, got ${pages.length}`);
console.log(`Shape-row assets linked from ${pages.length} pages.`);
