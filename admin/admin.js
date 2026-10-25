import { resolveSettings, cleanSettings, pageFacts, encodeOverride, BUILTIN_SCENES, COLOR_NAMES } from '../shared/portal-settings.js?v=1';

const $ = id => document.getElementById(id);
const TOKEN_KEY = 'ringConfiguratorsAdminToken';
const REPO_KEY = 'ringConfiguratorsAdminRepo';
const GROUPS = { scene: ['scene'], carat: ['carat'], colors: ['headColor', 'bodyColor', 'bandColor'], angle: ['angle'], pose: ['pose'] };
const SCENE_LABELS = { default: 'Saved scene (as is)', bright: 'Bright', soft: 'Soft', dark: 'Dark / moody', 'turned-light': 'Light from the other side', 'bright-turned': 'Bright, from the side' };

let rings = [];                 // [{id,name,tone,band,count,carats,status}]
let file = emptyFile();         // working copy
let savedText = '';             // text of the file as last loaded/saved (for the dirty flag)
let selected = new Set();
let previewTimer = null;

function emptyFile() { return { version: 1, global: {}, rules: [], collections: {}, presets: [], scenes: {} }; }
function normalize(raw) {
  const out = emptyFile();
  if (!raw || typeof raw !== 'object') return out;
  out.global = cleanSettings(raw.global);
  out.rules = (Array.isArray(raw.rules) ? raw.rules : []).filter(r => r && r.filter && (r.filter.tone != null || r.filter.band != null))
    .map(r => ({ name: String(r.name || 'Rule'), filter: pickFilter(r.filter), set: cleanSettings(r.set) }));
  for (const [slug, value] of Object.entries(raw.collections && typeof raw.collections === 'object' ? raw.collections : {})) {
    const clean = cleanSettings(value); if (Object.keys(clean).length) out.collections[slug] = clean;
  }
  out.presets = (Array.isArray(raw.presets) ? raw.presets : []).filter(p => p && typeof p.name === 'string' && p.name.trim())
    .map(p => ({ name: p.name.trim(), settings: cleanSettings(p.settings) }));
  out.scenes = raw.scenes && typeof raw.scenes === 'object' && !Array.isArray(raw.scenes) ? raw.scenes : {};
  return out;
}
function pickFilter(f) { const o = {}; if (f.tone === 'one' || f.tone === 'two') o.tone = f.tone; if (typeof f.band === 'boolean') o.band = f.band; return o; }
const toText = f => JSON.stringify(f, null, 2) + '\n';
const clone = o => JSON.parse(JSON.stringify(o));
const sameFilter = (a, b) => (a.tone ?? null) === (b.tone ?? null) && (a.band ?? null) === (b.band ?? null);

function say(text, kind = '') { const el = $('status'); el.textContent = text; el.className = 'status ' + kind; }
const ring = id => rings.find(r => r.id === id);
const factsOf = id => { const r = ring(id); return r ? { tone: r.tone, band: r.band } : { tone: null, band: null }; };

// ---------- describe ----------
function describe(settings) {
  const parts = [];
  if (settings.scene) parts.push(`scene ${SCENE_LABELS[settings.scene] ? settings.scene : settings.scene}`);
  if (settings.carat != null) parts.push(`${settings.carat} ct`);
  const colors = ['headColor', 'bodyColor', 'bandColor'].filter(k => settings[k]).map(k => `${k.replace('Color', '')} ${settings[k]}`);
  if (colors.length) parts.push(colors.join(', '));
  if (settings.angle) parts.push(`angle ${settings.angle.azimuth}°/${settings.angle.elevation}°`);
  if (settings.pose) parts.push(settings.pose);
  return parts.length ? parts.join(' · ') : 'page default';
}

// ---------- patch (what the form says) ----------
function modeOf(group) { return document.querySelector(`input[name="mode-${group}"]:checked`)?.value || 'keep'; }
function patchFromForm() {
  const patch = { set: {}, clear: [] };
  for (const [group, keys] of Object.entries(GROUPS)) {
    const mode = modeOf(group);
    if (mode === 'clear') patch.clear.push(...keys);
    if (mode !== 'set') continue;
    if (group === 'scene') patch.set.scene = $('v-scene').value;
    if (group === 'carat') patch.set.carat = Number($('v-carat').value);
    if (group === 'colors') for (const k of keys) patch.set[k] = $(`v-${k}`).value;
    if (group === 'angle') patch.set.angle = { azimuth: Number($('v-azimuth').value), elevation: Number($('v-elevation').value) };
    if (group === 'pose') patch.set.pose = document.querySelector('input[name="v-pose"]:checked').value;
  }
  patch.set = cleanSettings(patch.set);
  return patch;
}
const patchEmpty = p => !Object.keys(p.set).length && !p.clear.length;

function writeKeys(obj, patch, facts, slug, report) {
  for (const [key, value] of Object.entries(patch.set)) {
    if (facts) {
      if (key === 'headColor' && facts.tone !== 'two') continue;
      if (key === 'bandColor' && !facts.band) continue;
      if (key === 'carat') {
        const r = ring(slug);
        if (r && (value < r.carats[0] || value > r.carats[1])) { report.skipped.push(`${r.name}: ${value} ct is outside ${r.carats[0]}–${r.carats[1]} ct`); continue; }
      }
    }
    obj[key] = value;
  }
  for (const key of patch.clear) delete obj[key];
  report.touched++;
}
function targetInfo() {
  const target = document.querySelector('input[name="target"]:checked').value;
  const tone = $('f-tone').value || undefined, band = $('f-band').value ? $('f-band').value === 'yes' : undefined;
  const filter = {}; if (tone) filter.tone = tone; if (band !== undefined) filter.band = band;
  return { target, filter };
}
function applyPatch(f, patch, slugs) {
  const { target, filter } = targetInfo();
  const report = { touched: 0, skipped: [], where: '' };
  if (target === 'global') { writeKeys(f.global, patch, null, null, report); report.where = 'the global default'; }
  else if (target === 'rule') {
    let rule = f.rules.find(r => sameFilter(r.filter, filter));
    if (!rule) { rule = { name: $('rule-name').value.trim() || ruleLabel(filter), filter, set: {} }; f.rules.push(rule); }
    else if ($('rule-name').value.trim()) rule.name = $('rule-name').value.trim();
    writeKeys(rule.set, patch, null, null, report); report.where = `the rule “${rule.name}”`;
    if (!Object.keys(rule.set).length) f.rules = f.rules.filter(r => r !== rule);
  } else {
    for (const slug of slugs) {
      const obj = f.collections[slug] ||= {};
      writeKeys(obj, patch, factsOf(slug), slug, report);
      if (!Object.keys(obj).length) delete f.collections[slug];
    }
    report.where = `${slugs.length} collection${slugs.length === 1 ? '' : 's'}`;
  }
  return report;
}
function ruleLabel(filter) {
  return [filter.tone === 'two' ? 'Two-tone' : filter.tone === 'one' ? 'One-tone' : '', filter.band === true ? 'with band' : filter.band === false ? 'no band' : ''].filter(Boolean).join(' ') || 'Rule';
}

// ---------- table ----------
function filteredRings() {
  const tone = $('f-tone').value, band = $('f-band').value, text = $('f-text').value.trim().toLowerCase(), has = $('f-set').value;
  return rings.filter(r => (!tone || r.tone === tone) && (!band || (band === 'yes') === r.band)
    && (!text || r.name.toLowerCase().includes(text) || r.id.includes(text))
    && (!has || (has === 'has') === Boolean(file.collections[r.id])));
}
function renderTable() {
  const body = document.querySelector('#collections tbody'); body.textContent = '';
  for (const r of filteredRings()) {
    const tr = document.createElement('tr'); tr.dataset.id = r.id; tr.className = selected.has(r.id) ? 'sel' : '';
    const { settings } = resolveSettings(file, r.id, { tone: r.tone, band: r.band });
    tr.innerHTML = `<td class="c-check"><input type="checkbox" aria-label="Select ${r.name}" ${selected.has(r.id) ? 'checked' : ''}></td>
      <td><strong>${r.name}</strong></td><td><span class="badge ${r.tone}">${r.tone === 'two' ? 'Two-tone' : 'One-tone'}</span></td>
      <td>${r.band ? '<span class="badge band">Has band</span>' : '<span class="badge">No band</span>'}</td>
      <td>${r.count}</td><td>${r.carats[0]}–${r.carats[1]} ct</td><td class="opens">${describe(settings)}${file.collections[r.id] ? ' <b>(own)</b>' : ''}</td>
      <td><button type="button" class="ghost small edit">Edit</button></td>`;
    body.append(tr);
  }
  updateSummary();
}
function updateSummary() {
  const sel = rings.filter(r => selected.has(r.id));
  const n = sel.reduce((a, r) => a + r.count, 0);
  $('summary').textContent = `${n} ring${n === 1 ? '' : 's'} in ${sel.length} collection${sel.length === 1 ? '' : 's'} selected`;
  $('summary').dataset.rings = n; $('summary').dataset.collections = sel.length;
  populateCarats(); populatePreviewSlugs();
}
function selectShown() { selected = new Set(filteredRings().map(r => r.id)); renderTable(); }

// ---------- form helpers ----------
function buildModes() {
  for (const fs of document.querySelectorAll('#settings fieldset')) {
    const group = fs.dataset.key, box = fs.querySelector('.modes');
    box.innerHTML = [['keep', 'Don’t change'], ['set', 'Set'], ['clear', 'Remove saved value']].map(([v, t]) =>
      `<label><input type="radio" name="mode-${group}" value="${v}" ${v === 'keep' ? 'checked' : ''}> ${t}</label>`).join('');
    box.addEventListener('change', () => { syncModes(); schedulePreview(); });
    fs.addEventListener('input', () => { if (modeOf(group) === 'keep' && !fs.matches('.modes *')) { fs.querySelector('input[value="set"]').checked = true; syncModes(); } schedulePreview(); });
  }
  syncModes();
}
function syncModes() { for (const fs of document.querySelectorAll('#settings fieldset')) { const m = modeOf(fs.dataset.key); fs.classList.toggle('off', m !== 'set'); fs.classList.toggle('set', m === 'set'); } }
function setMode(group, mode) { document.querySelector(`input[name="mode-${group}"][value="${mode}"]`).checked = true; syncModes(); }
function populateScenes() {
  const names = [...Object.keys(BUILTIN_SCENES), ...Object.keys(file.scenes || {}).filter(n => !(n in BUILTIN_SCENES))];
  const cur = $('v-scene').value;
  $('v-scene').innerHTML = names.map(n => `<option value="${n}">${SCENE_LABELS[n] || n}</option>`).join('');
  if (names.includes(cur)) $('v-scene').value = cur;
}
function populateCarats() {
  const pool = selected.size ? rings.filter(r => selected.has(r.id)) : rings;
  const lo = Math.min(...pool.map(r => r.carats[0])), hi = Math.max(...pool.map(r => r.carats[1]));
  const cur = $('v-carat').value; let html = '';
  for (let c = lo; c <= hi; c++) html += `<option value="${c}">${c} ct</option>`;
  $('v-carat').innerHTML = html; if (cur && Number(cur) >= lo && Number(cur) <= hi) $('v-carat').value = cur;
}
function resetForm() { for (const g of Object.keys(GROUPS)) setMode(g, 'keep'); $('apply-note').textContent = ''; schedulePreview(); }
function loadForm(settings) {
  resetForm();
  if (settings.scene) { populateScenes(); $('v-scene').value = settings.scene; setMode('scene', 'set'); }
  if (settings.carat != null) { populateCarats(); $('v-carat').value = String(settings.carat); setMode('carat', 'set'); }
  const colorKeys = ['headColor', 'bodyColor', 'bandColor'].filter(k => settings[k]);
  if (colorKeys.length) { for (const k of colorKeys) $(`v-${k}`).value = settings[k]; setMode('colors', 'set'); }
  if (settings.angle) { $('v-azimuth').value = settings.angle.azimuth; $('v-elevation').value = settings.angle.elevation; setMode('angle', 'set'); }
  if (settings.pose) { document.querySelector(`input[name="v-pose"][value="${settings.pose}"]`).checked = true; setMode('pose', 'set'); }
  schedulePreview();
}

// ---------- apply ----------
function doApply(label) {
  const patch = patchFromForm();
  if (patchEmpty(patch)) { say('Nothing to apply: every setting is “Don’t change”.', 'warn'); return false; }
  const { target, filter } = targetInfo();
  const slugs = rings.filter(r => selected.has(r.id)).map(r => r.id);
  if (target === 'collections' && !slugs.length) { say('Select at least one collection first.', 'err'); return false; }
  if (target === 'rule' && !Object.keys(filter).length) { say('A filter rule needs a Tone or Band filter (step 1).', 'err'); return false; }
  const report = applyPatch(file, patch, slugs);
  refreshAll();
  const skipped = report.skipped.length ? ` Skipped: ${report.skipped.slice(0, 3).join('; ')}${report.skipped.length > 3 ? '…' : ''}` : '';
  say(`${label || 'Applied'} to ${report.where}. Not saved yet: press “Save to GitHub” or download the file.${skipped}`, report.skipped.length ? 'warn' : 'ok');
  $('apply-note').textContent = '';
  return true;
}

// ---------- presets ----------
function renderPresets() {
  const ul = $('presets'); ul.textContent = '';
  if (!file.presets.length) { ul.innerHTML = '<li class="hint">No presets yet.</li>'; return; }
  file.presets.forEach((p, i) => {
    const li = document.createElement('li'); li.dataset.index = i;
    li.innerHTML = `<span class="pname"></span><span class="pdesc"></span>
      <button type="button" class="ghost small" data-act="load">Load</button><button type="button" class="primary small" data-act="apply">Apply to selection</button>
      <button type="button" class="ghost small" data-act="rename">Rename</button><button type="button" class="ghost small" data-act="delete">Delete</button>`;
    li.querySelector('.pname').textContent = p.name; li.querySelector('.pdesc').textContent = describe(p.settings);
    ul.append(li);
  });
}
function savePreset() {
  const name = $('preset-name').value.trim();
  const patch = patchFromForm();
  if (!name) { say('Give the preset a name.', 'err'); return; }
  if (!Object.keys(patch.set).length) { say('Set at least one setting in the form to save it as a preset.', 'err'); return; }
  const existing = file.presets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing >= 0) file.presets[existing] = { name, settings: patch.set }; else file.presets.push({ name, settings: patch.set });
  $('preset-name').value = ''; refreshAll(); say(`Preset “${name}” saved (not committed yet).`, 'ok');
}
function overrides() {
  const ul = $('overrides'); ul.textContent = '';
  const rows = [];
  if (Object.keys(file.global).length) rows.push({ label: 'Global default', text: describe(file.global), kind: 'global' });
  file.rules.forEach((r, i) => rows.push({ label: `Rule: ${r.name} (${[r.filter.tone ? r.filter.tone + '-tone' : '', r.filter.band === true ? 'has band' : r.filter.band === false ? 'no band' : ''].filter(Boolean).join(', ')})`, text: describe(r.set), kind: 'rule', index: i }));
  for (const [slug, s] of Object.entries(file.collections)) rows.push({ label: `Collection: ${ring(slug)?.name || slug}`, text: describe(s), kind: 'collection', slug });
  if (!rows.length) { ul.innerHTML = '<li class="hint">No overrides: every page opens with its own defaults.</li>'; return; }
  for (const r of rows) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="pname"></span><span class="pdesc"></span><button type="button" class="ghost small">Remove</button>';
    li.querySelector('.pname').textContent = r.label; li.querySelector('.pdesc').textContent = r.text;
    li.querySelector('button').addEventListener('click', () => {
      if (r.kind === 'global') file.global = {}; else if (r.kind === 'rule') file.rules.splice(r.index, 1); else delete file.collections[r.slug];
      refreshAll(); say('Override removed (not saved yet).', 'ok');
    });
    ul.append(li);
  }
}

// ---------- preview ----------
function populatePreviewSlugs() {
  const pool = selected.size ? rings.filter(r => selected.has(r.id)) : rings;
  const sel = $('preview-slug'), cur = sel.value;
  sel.innerHTML = pool.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  if (pool.some(r => r.id === cur)) sel.value = cur;
}
function previewSettings(slug) {
  const f = clone(file);
  const patch = patchFromForm();
  if (!patchEmpty(patch)) { try { applyPatch(f, patch, [slug]); } catch { /* preview still shows saved settings */ } }
  return { f, resolved: resolveSettings(f, slug, factsOf(slug)).settings };
}
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(loadPreview, 700); }
function loadPreview() {
  const slug = $('preview-slug').value; if (!slug) return;
  const { f, resolved } = previewSettings(slug);
  const ps = encodeOverride({ settings: resolved, scenes: f.scenes || {} });
  const src = `../${slug}/?ps=${ps}`;
  $('preview-note').textContent = `${ring(slug).name}: opens with ${describe(resolved)}`;
  if ($('preview').dataset.src !== src) { $('preview').dataset.src = src; $('preview').src = src; }
}
async function useCurrentAngle() {
  try {
    const api = $('preview').contentWindow.__portal;
    if (!api) throw new Error('not ready');
    const a = api.getAngle();
    $('v-azimuth').value = a.azimuth; $('v-elevation').value = a.elevation; setMode('angle', 'set');
    say(`Angle captured from the preview: turn ${a.azimuth}°, height ${a.elevation}°.`, 'ok');
  } catch { say('The preview is still loading. Wait until the ring is visible, then try again.', 'warn'); }
}

// ---------- saving ----------
function refreshAll() { populateScenes(); renderTable(); renderPresets(); overrides(); updateDirty(); schedulePreview(); }
function updateDirty() {
  const text = toText(file); $('json').value = text;
  $('dirty').textContent = text === savedText ? '' : 'Unsaved changes';
  $('dirty').dataset.dirty = text === savedText ? 'false' : 'true';
}
function download() {
  const blob = new Blob([toText(file)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'portal-settings.json'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  say('Downloaded portal-settings.json. Put it in the repository root to publish it.', 'ok');
}
const b64 = text => { const bytes = new TextEncoder().encode(text); let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const unb64 = text => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));
async function saveToGitHub() {
  const token = $('token').value.trim(), repo = $('repo').value.trim(), branch = $('branch').value.trim() || 'main';
  if (!token) { say('Paste a GitHub token first (or use “Download settings JSON”).', 'err'); return; }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { say('Repository must look like owner/name.', 'err'); return; }
  const url = `https://api.github.com/repos/${repo}/contents/portal-settings.json`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  $('save-gh').disabled = true; say('Saving to GitHub…');
  try {
    let sha, remoteText = '';
    const get = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
    if (get.ok) { const j = await get.json(); sha = j.sha; remoteText = unb64(j.content || ''); }
    else if (get.status !== 404) throw new Error(get.status === 401 || get.status === 403 ? 'GitHub rejected the token (check it has Contents: Read and write for this repo).' : `GitHub answered ${get.status} while reading the file.`);
    if (sha && savedText && remoteText.trim() !== savedText.trim() && !confirm('portal-settings.json on GitHub changed since you loaded it. Overwrite it with your version?')) { say('Save cancelled. Use “Reload saved file” to see the latest version.', 'warn'); return; }
    const text = toText(file);
    const put = await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update portal start settings (admin page)', content: b64(text), branch, ...(sha ? { sha } : {}) }) });
    if (!put.ok) throw new Error(put.status === 401 || put.status === 403 ? 'GitHub rejected the token (needs Contents: Read and write).' : put.status === 409 || put.status === 422 ? 'The file changed on GitHub meanwhile. Reload the saved file and apply again.' : `GitHub answered ${put.status} while saving.`);
    const done = await put.json();
    localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(REPO_KEY, JSON.stringify({ repo, branch }));
    savedText = text; updateDirty();
    say(`Saved to GitHub (${(done.commit?.sha || '').slice(0, 7)}). The pages pick it up in about a minute.`, 'ok');
  } catch (error) { say(error.message || 'Saving failed.', 'err'); }
  finally { $('save-gh').disabled = false; }
}
async function loadFile() {
  try {
    const response = await fetch('../portal-settings.json', { cache: 'no-cache' });
    const text = response.ok ? await response.text() : '';
    file = normalize(text ? JSON.parse(text) : null);
    savedText = response.ok ? toText(file) : toText(emptyFile());
  } catch { file = emptyFile(); savedText = toText(file); say('portal-settings.json could not be read; starting empty.', 'warn'); }
}

// ---------- init ----------
async function init() {
  const list = await (await fetch('../configurators.json', { cache: 'no-cache' })).json();
  rings = list.configurators.map(c => { const f = pageFacts(c); return { id: c.id, name: c.name, tone: f.tone, band: f.band, count: c.rings || 0, carats: c.carats || [1, 5], status: c.status }; })
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  await loadFile();
  const tok = localStorage.getItem(TOKEN_KEY); if (tok) $('token').value = tok;
  try { const r = JSON.parse(localStorage.getItem(REPO_KEY) || 'null'); if (r) { $('repo').value = r.repo; $('branch').value = r.branch; } } catch { /* ignore */ }
  buildModes(); populateScenes(); populateCarats(); refreshAll();

  for (const id of ['f-tone', 'f-band', 'f-text', 'f-set']) $(id).addEventListener('input', () => { selectShown(); });
  $('sel-visible').addEventListener('click', selectShown);
  $('sel-none').addEventListener('click', () => { selected.clear(); renderTable(); });
  document.querySelector('#collections tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return; const id = tr.dataset.id;
    if (e.target.matches('.edit')) { selected = new Set([id]); renderTable(); loadForm(file.collections[id] || {}); $('preview-slug').value = id; say(`Editing ${ring(id).name}. Change what you need and press Apply.`, 'ok'); $('sec-set').scrollIntoView({ behavior: 'smooth' }); return; }
    if (e.target.matches('input[type=checkbox]')) { e.target.checked ? selected.add(id) : selected.delete(id); tr.classList.toggle('sel', e.target.checked); updateSummary(); }
  });
  $('apply').addEventListener('click', () => doApply());
  $('reset-form').addEventListener('click', resetForm);
  $('use-angle').addEventListener('click', useCurrentAngle);
  $('preview-slug').addEventListener('change', loadPreview);
  $('preview-refresh').addEventListener('click', () => { $('preview').dataset.src = ''; loadPreview(); });
  document.querySelectorAll('input[name="target"]').forEach(r => r.addEventListener('change', () => { $('rule-name-wrap').hidden = document.querySelector('input[name="target"]:checked').value !== 'rule'; schedulePreview(); }));
  document.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => {
    const q = b.dataset.quick;
    if (q === 'white-yellow') { $('v-headColor').value = 'white'; $('v-bodyColor').value = 'yellow'; }
    else { const c = q.replace('all-', ''); for (const k of ['headColor', 'bodyColor', 'bandColor']) $(`v-${k}`).value = c; }
    setMode('colors', 'set'); schedulePreview();
  }));
  $('preset-save').addEventListener('click', savePreset);
  $('presets').addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return; const i = Number(btn.closest('li').dataset.index), p = file.presets[i]; if (!p) return;
    if (btn.dataset.act === 'load') { loadForm(p.settings); say(`Preset “${p.name}” loaded into the form.`, 'ok'); }
    if (btn.dataset.act === 'apply') { loadForm(p.settings); doApply(`Preset “${p.name}” applied`); }
    if (btn.dataset.act === 'rename') {
      const name = (prompt('New preset name', p.name) || '').trim();
      if (name && !file.presets.some((q, j) => j !== i && q.name.toLowerCase() === name.toLowerCase())) { p.name = name; refreshAll(); say('Preset renamed (not saved yet).', 'ok'); }
      else if (name) say('A preset with that name already exists.', 'err');
    }
    if (btn.dataset.act === 'delete' && confirm(`Delete preset “${p.name}”?`)) { file.presets.splice(i, 1); refreshAll(); say('Preset deleted (not saved yet).', 'ok'); }
  });
  $('download').addEventListener('click', download);
  $('save-gh').addEventListener('click', saveToGitHub);
  $('forget-token').addEventListener('click', () => { localStorage.removeItem(TOKEN_KEY); $('token').value = ''; say('Token removed from this browser.', 'ok'); });
  $('reload').addEventListener('click', async () => { await loadFile(); refreshAll(); say('Saved file reloaded.', 'ok'); });
  $('import').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { file = normalize(JSON.parse(await f.text())); refreshAll(); say('File imported. Not saved yet.', 'ok'); } catch { say('That file is not valid JSON.', 'err'); }
    e.target.value = '';
  });
  window.addEventListener('beforeunload', e => { if ($('dirty').dataset.dirty === 'true') { e.preventDefault(); e.returnValue = ''; } });
  document.body.dataset.ready = 'true';
}
init().catch(error => { console.error(error); say('The admin page could not load its data: ' + error.message, 'err'); });
