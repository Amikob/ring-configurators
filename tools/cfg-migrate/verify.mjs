#!/usr/bin/env node
// Headless check of repointed pages: loads each page, does N shape/carat switches through the page's
// configure_<slug> model-context tool, records every .glb request and asserts they all belong to the new
// configurator's files; screenshots each state; fails on page/console errors or HTTP >= 400.
//
//   node tools/cfg-migrate/verify.mjs <baseUrl> <configuratorId> <outDir> <pagePath> [<pagePath>...] [--switches 5 | --all]
//   e.g. node tools/cfg-migrate/verify.mjs http://127.0.0.1:8800 EiSEtivuSsmgccThjvV6sw /tmp/v lacey/ lacey-2jjz4se99k/
//
// Needs playwright-core (PW_DIR, default /workspace/pw) and Chrome (CHROME, default /usr/bin/google-chrome).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR || '/workspace/pw'}/`);
const { chromium } = require('playwright-core');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const a = process.argv.slice(2); let n = 5, all = false; const pos = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--switches') n = +a[++i]; else if (a[i] === '--all') all = true; else pos.push(a[i]); }
const [base, cfgId, outDir, ...pages] = pos;
if (!pages.length) { console.error('usage: verify.mjs <baseUrl> <configuratorId> <outDir> <pagePath>... [--switches N]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const doc = await (await fetch(`https://amikob.ijewel3d.com/api/raw/v1/files/view/${cfgId}?select=config`, { headers: { 'User-Agent': UA } })).json();
const vars = JSON.parse(doc.config).plugins.RingConfigurator.components.flatMap(c => c.variations);
const allowed = new Set(vars.flatMap(v => [path.basename(v.modelUrl), path.basename(v.icon.split('?')[0])]));
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
let fail = 0; const report = [];
for (const p of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); const errs = [], bad = [], glbs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('request', r => { if (/\.glb(\?|$)/i.test(r.url())) glbs.push(r.url()); });
  await page.addInitScript(() => { window.__tools = {}; Object.defineProperty(document, 'modelContext', { value: { registerTool(t) { window.__tools[t.name] = t; } } }); });
  await page.goto(`${base}/${p}`, { waitUntil: 'load', timeout: 90000 });
  const tag = p.replace(/\W+/g, '_');
  const find = pre => page.evaluate(pre => Object.keys(window.__tools).find(k => k.startsWith(pre)), pre);
  let cfgTool, setTool; const t0 = Date.now(); let st = null;
  while (Date.now() - t0 < 180000) {
    cfgTool ||= await find('get_') && (await page.evaluate(() => Object.keys(window.__tools).find(k => /^get_.*_configuration$/.test(k))));
    setTool ||= await page.evaluate(() => Object.keys(window.__tools).find(k => /^configure_/.test(k)));
    if (cfgTool) st = await page.evaluate(t => window.__tools[t].execute(), cfgTool).catch(() => null);
    if (st?.ready && !st.busy) break;
    await page.waitForTimeout(1000);
  }
  const res = { page: p, initial: st && { ready: st.ready, ringFile: st.ringFile, displayed: st.displayed }, switches: [] };
  if (!st?.ready) { fail++; res.error = 'page never became ready'; }
  else {
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${outDir}/${tag}-default.png` });
    const schema = await page.evaluate(t => window.__tools[t].inputSchema.properties, setTool);
    const shapes = schema.shape.enum, carats = schema.carat.enum; let tried = 0;
    const combos = all ? shapes.flatMap(sh => carats.map(c => ({ shape: sh, carat: c }))) : null;
    for (let i = 0; combos ? i < combos.length : (tried < n && i < shapes.length * carats.length * 3); i++) {
      const sel = combos ? combos[i] : { shape: shapes[(i * 3 + 1) % shapes.length], carat: carats[(i * 2 + 1) % carats.length] };
      try {
        const r = await page.evaluate(([t, s]) => window.__tools[t].execute(s), [setTool, sel]);
        await page.waitForTimeout(1500);
        await page.locator('#viewer').screenshot({ path: `${outDir}/${tag}-${sel.shape}-${sel.carat}.png` });
        res.switches.push({ ...sel, ringFile: r.ringFile, displayed: r.displayed }); tried++;
      } catch (e) { if (!/not available|Unknown|Invalid|No ring/i.test(e.message)) { res.switches.push({ ...sel, error: e.message }); tried++; fail++; } }
    }
  }
  const uniq = [...new Set(glbs)];
  res.glbRequests = uniq.length; res.glbOutsideNewConfigurator = uniq.filter(u => !allowed.has(path.basename(u.split('?')[0])));
  res.errors = errs; res.httpErrors = bad;
  if (res.glbOutsideNewConfigurator.length || errs.length || bad.length || !uniq.length) fail++;
  report.push(res); await ctx.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
console.log(fail ? `FAIL (${fail})` : 'PASS');
process.exit(fail ? 1 : 0);
