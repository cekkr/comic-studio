import { Bubble, Comical } from '../vendor/comical-js/src/index';
import type { BubbleSpec, TailSpec } from '../vendor/comical-js/src/bubbleSpec';
import { toCanvas } from 'html-to-image';
import { styles, fonts, registerFonts, History, clamp, validateProject, MAX_PIXELS, MAX_DIMENSION } from './model.mjs';

type Balloon = { id: string; text: string; x: number; y: number; width: number; height: number; fontFamily: string; fontSize: number; textColor: string; align: string; bold: boolean; italic: boolean; spec: BubbleSpec };
type Project = { version: number; image: { src: string; name: string; width: number; height: number } | null; balloons: Balloon[] };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const value = (id: string) => ($<HTMLInputElement | HTMLSelectElement>(id)).value;
const number = (id: string, min: number, max: number) => clamp(Number(value(id)) || 0, min, max);
const stage = $('stage'), viewport = $('viewport'), wrapper = $('stage-wrapper');
const history = new History();
let project: Project = { version: 1, image: null, balloons: [] };
let selectedId: string | null = null, tailIndex = 0, zoom = 1, fitted = true, busy = false;
let historyTimer: ReturnType<typeof setTimeout>, toastTimer: ReturnType<typeof setTimeout>;
const selected = () => project.balloons.find(b => b.id === selectedId);
const element = (b: Balloon) => stage.querySelector<HTMLElement>(`[data-id="${CSS.escape(b.id)}"]`)!;
const systemFontIds = new Set(Object.keys(fonts));
const fontCatalogReady = fetch('/fonts/catalog.json').then(async response => {
  if (!response.ok) throw new Error('Font catalog is unavailable.');
  const { fonts: catalog } = await response.json(); registerFonts(catalog);
  for (const font of catalog) if (!systemFontIds.has(font.id)) $<HTMLSelectElement>('font-family').add(new Option(font.name, font.id));
}).catch(() => toast('Custom fonts could not be loaded. Refresh the editor to try again.'));

function toast(message: string) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000);
}

function syncFromDom() {
  for (const b of project.balloons) {
    const el = element(b); if (!el) continue;
    b.spec = structuredClone(Bubble.getBubbleSpec(el));
    b.x = parseFloat(el.style.left); b.y = parseFloat(el.style.top);
    b.width = parseFloat(el.style.width); b.height = parseFloat(el.style.height);
  }
}
function commit() {
  clearTimeout(historyTimer); syncFromDom(); history.push(project); updateHistory();
}
function commitSoon() { clearTimeout(historyTimer); historyTimer = setTimeout(commit, 350); }
function updateHistory() { input('undo').disabled = !history.canUndo; input('redo').disabled = !history.canRedo; }

function applyText(b: Balloon, el = element(b)) {
  Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px`, fontFamily: fonts[b.fontFamily], fontSize: `${b.fontSize}px`, color: b.textColor, textAlign: b.align, fontWeight: b.bold ? '700' : '400', fontStyle: b.italic ? 'italic' : 'normal' });
  // Imported families may not supply every weight/style combination.
  el.style.fontSynthesis = systemFontIds.has(b.fontFamily) ? 'none' : 'weight style';
  if (el.contentEditable !== 'true') el.firstElementChild!.textContent = b.text;
}
function writeSpec(b: Balloon) { new Bubble(element(b)).setBubbleSpec(structuredClone(b.spec)); }
function redraw() {
  if (!project.image) return;
  Comical.update(stage); Comical.activateElement(selected() ? element(selected()!) : undefined);
  refreshSelection();
}
function createBalloonElement(b: Balloon) {
  const el = document.createElement('div'); el.className = 'comic-text'; el.dataset.id = b.id;
  const text = document.createElement('span'); el.append(text); stage.append(el); applyText(b, el); writeSpec(b);
  el.addEventListener('pointerdown', e => { if (el.contentEditable !== 'true') beginDrag(e, false, b.id); });
  el.addEventListener('dblclick', () => {
    select(b.id); el.contentEditable = 'true'; el.setAttribute('role', 'textbox'); el.setAttribute('aria-label', 'Edit balloon dialogue'); el.focus();
    const range = document.createRange(); range.selectNodeContents(el); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    toast('Type to edit. Press Escape or click outside to finish.');
  });
  el.addEventListener('input', () => {
    b.text = el.innerText.slice(0, 10000); $<HTMLTextAreaElement>('text').value = b.text; renderList(); commitSoon();
  });
  el.addEventListener('paste', e => {
    e.preventDefault(); const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text.slice(0, 10000));
  });
  el.addEventListener('blur', () => {
    b.text = el.innerText.slice(0, 10000); el.contentEditable = 'false'; el.removeAttribute('role'); el.removeAttribute('aria-label'); el.replaceChildren(document.createElement('span'));
    applyText(b); renderList(); commit();
  });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); el.blur(); } });
}

async function loadImage(src: string) {
  const image = new Image(); image.src = src; await image.decode(); return image;
}
function clearComical() {
  const data = Comical.activeContainers.get(stage);
  Comical.activateElement(undefined); Comical.stopEditing(); data?.project.remove();
  stage.querySelectorAll('.comic-text,.comical-generated').forEach(el => el.remove());
}
async function restore(next: Project) {
  if (next.image) await loadImage(next.image.src);
  clearComical(); project = next; selectedId = project.balloons.at(-1)?.id || null;
  wrapper.hidden = !project.image; $('empty-state').hidden = !!project.image;
  if (project.image) {
    const { width, height, src, name } = project.image;
    stage.style.transform = 'none'; stage.style.width = `${width}px`; stage.style.height = `${height}px`;
    $<HTMLImageElement>('background').src = src;
    $('document-name').textContent = name; $('dimensions').textContent = `${width} × ${height}`;
    project.balloons.forEach(createBalloonElement); Comical.startEditing([stage]); fit();
    $('workspace-hint').textContent = 'Drag to move · double-click to edit · orange dots shape tails';
  } else { $('document-name').textContent = 'A fresh start'; $('dimensions').textContent = ''; $('workspace-hint').textContent = 'A blank canvas. A thousand possibilities.'; }
  renderList(); refreshInspector(); refreshSelection(); updateHistory();
  document.querySelectorAll<HTMLButtonElement>('.style-card').forEach(button => button.disabled = !project.image);
  input('export').disabled = !project.image; input('save-project').disabled = !project.image;
  if (selected()) Comical.activateElement(element(selected()!));
}
function setZoom(scale: number) {
  if (!project.image) return;
  // Comical is initialized at scale 1; only its completed stage is scaled.
  zoom = clamp(scale, .02, 3); stage.style.transform = `scale(${zoom})`;
  wrapper.style.width = `${project.image.width * zoom}px`; wrapper.style.height = `${project.image.height * zoom}px`;
  $('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  // Keep UI handles usable on high resolution photos.
  const move = $('move-handle'), resize = $('resize-handle');
  move.style.transform = `scale(${1 / zoom})`; move.style.transformOrigin = 'bottom left'; move.style.top = '-24px';
  resize.style.transform = `scale(${1 / zoom})`; resize.style.transformOrigin = 'center';
}
function fit() {
  if (!project.image) return; fitted = true;
  const padding = parseFloat(getComputedStyle(viewport).paddingLeft) * 2;
  setZoom(Math.min((viewport.clientWidth - padding) / project.image.width, (viewport.clientHeight - padding) / project.image.height, 1));
}
new ResizeObserver(() => { if (fitted) fit(); }).observe(viewport);

function select(id: string | null) {
  selectedId = id; tailIndex = 0;
  Comical.activateElement(selected() ? element(selected()!) : undefined);
  renderList(); refreshInspector(); refreshSelection();
}
Comical.setActiveBubbleListener(el => {
  const id = el?.dataset.id;
  if (id && id !== selectedId) { selectedId = id; tailIndex = 0; renderList(); refreshInspector(); refreshSelection(); }
});
function refreshSelection() {
  const b = selected(); const overlay = $('selection'); overlay.hidden = !b;
  if (!b) return;
  Object.assign(overlay.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px` });
}
function renderList() {
  $('balloon-count').textContent = String(project.balloons.length); const list = $('balloon-list'); list.replaceChildren();
  if (!project.balloons.length) { const p = document.createElement('p'); p.className = 'empty-list'; p.textContent = 'Your dialogue starts here.'; list.append(p); }
  project.balloons.forEach((b, index) => {
    const button = document.createElement('button'); button.className = `balloon-item${b.id === selectedId ? ' active' : ''}`;
    const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
    const text = document.createElement('span'); text.className = 'balloon-label'; text.textContent = b.text || '(Empty balloon)'; button.append(number, text);
    button.addEventListener('click', () => select(b.id)); list.append(button);
  });
}
function setValue(id: string, v: unknown) { ($<HTMLInputElement | HTMLSelectElement>(id)).value = String(v ?? 0); }
function refreshInspector() {
  const b = selected(); $('properties').hidden = !b; $('no-selection').hidden = !!b;
  $('selection-number').textContent = b ? ` / ${String(project.balloons.indexOf(b) + 1).padStart(2, '0')}` : '';
  if (!b) return;
  const s = b.spec;
  const fields = { text: b.text, style: s.style, 'font-family': b.fontFamily, 'font-size': b.fontSize, 'text-color': b.textColor, 'text-align': b.align, shadow: s.shadowOffset || 0, 'corner-x': s.cornerRadiusX || 0, 'corner-y': s.cornerRadiusY || 0, 'position-x': Math.round(b.x), 'position-y': Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height), level: s.level, order: s.order || 0, 'outer-color': s.outerBorderColor || '#90aa61' };
  Object.entries(fields).forEach(([id, v]) => setValue(id, v));
  $('bold').setAttribute('aria-pressed', String(b.bold)); $('italic').setAttribute('aria-pressed', String(b.italic)); input('outer-border').checked = !!s.outerBorderColor;
  const rectangular = ['caption', 'caption-withTail', 'rectangle', 'none'].includes(s.style);
  input('corner-x').disabled = input('corner-y').disabled = !rectangular;
  const colors = s.backgroundColors || ['#ffffff'];
  setValue('fill-mode', colors[0] === 'transparent' ? 'transparent' : colors.length > 1 ? 'gradient' : 'solid');
  renderColors(); refreshTails(); input('link-previous').disabled = project.balloons.indexOf(b) === 0;
}
function renderColors() {
  const b = selected(); if (!b) return;
  const colors = b.spec.backgroundColors || ['#ffffff']; const container = $('color-stops'); container.replaceChildren();
  const mode = value('fill-mode'); container.hidden = mode === 'transparent'; $('add-color').hidden = mode !== 'gradient'; input('add-color').disabled = colors.length >= 8;
  colors.forEach((c, index) => {
    const row = document.createElement('div'); row.className = 'color-stop';
    const picker = document.createElement('input'); picker.type = 'color'; picker.value = c === 'transparent' ? '#ffffff' : c; picker.setAttribute('aria-label', `Fill color ${index + 1}`);
    const label = document.createElement('span'); label.textContent = mode === 'gradient' ? `Color stop ${index + 1}` : 'Balloon color';
    picker.addEventListener('input', () => edit(b => { b.spec.backgroundColors ||= ['#ffffff']; b.spec.backgroundColors[index] = picker.value; }, false));
    row.append(picker, label);
    if (colors.length > 2) { const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove fill color ${index + 1}`); remove.addEventListener('click', () => edit(b => { b.spec.backgroundColors!.splice(index, 1); })); row.append(remove); }
    container.append(row);
  });
}
function refreshTails() {
  const b = selected(); if (!b) return;
  tailIndex = clamp(tailIndex, 0, Math.max(0, b.spec.tails.length - 1));
  const dropdown = $<HTMLSelectElement>('tail-index'); dropdown.replaceChildren();
  if (!b.spec.tails.length) dropdown.add(new Option('No tail', '0'));
  b.spec.tails.forEach((t, i) => dropdown.add(new Option(`Tail ${i + 1}${t.joiner ? ' · joiner' : ''}`, String(i)))); dropdown.value = String(tailIndex);
  const t = b.spec.tails[tailIndex]; $('tail-properties').hidden = !t;
  input('remove-tail').disabled = !t; input('add-tail').disabled = b.spec.tails.length >= 8; input('joiner').disabled = !t;
  if (!t) return;
  input('auto-curve').checked = t.autoCurve !== false; input('joiner').checked = !!t.joiner;
  Object.entries({ 'tip-x': t.tipX, 'tip-y': t.tipY, 'mid-x': t.midpointX, 'mid-y': t.midpointY }).forEach(([id, n]) => setValue(id, Math.round(n)));
  // Midpoints only apply to curved tails, and manual curves keep their shape.
  const curved = !['caption', 'rectangle', 'none'].includes(b.spec.style);
  input('mid-x').disabled = input('mid-y').disabled = !curved || t.autoCurve !== false;
  input('auto-curve').disabled = !curved;
}
function edit(change: (b: Balloon) => void, refresh = true) {
  const b = selected(); if (!b || busy) return;
  syncFromDom(); change(b); applyText(b); writeSpec(b); redraw(); renderList();
  if (refresh) refreshInspector(); commitSoon();
}
function defaultTail(b: Balloon): TailSpec {
  const image = project.image!;
  return { tipX: clamp(b.x + b.width * .75, 0, image.width), tipY: clamp(b.y + b.height + image.height * .13, 0, image.height), midpointX: b.x + b.width * .65, midpointY: b.y + b.height + image.height * .04, autoCurve: true };
}
function nextLevel() {
  const used = new Set(project.balloons.map(b => b.spec.level || 1));
  const next = Math.max(0, ...used) + 1;
  if (next <= 999) return next;
  for (let level = 1; level <= 999; level++) if (!used.has(level)) return level;
  return 1;
}
function addBalloon(style: string, text = 'What happens next?') {
  if (!project.image || busy) return;
  if (project.balloons.length >= 100) return toast('The canvas supports up to 100 balloons.');
  commit(); const image = project.image, count = project.balloons.length;
  const b: Balloon = { id: crypto.randomUUID(), text, x: image.width * (.18 + (count % 3) * .18), y: image.height * (.15 + (count % 3) * .16), width: Math.max(20, Math.min(300, image.width * .25)), height: Math.max(20, Math.min(120, image.height * .14)), fontFamily: 'comic', fontSize: clamp(Math.round(image.width * .023), 6, 48), textColor: '#252823', align: 'center', bold: false, italic: false, spec: { version: '1.0', style, level: nextLevel(), tails: [], backgroundColors: ['#ffffff'] } };
  if (['speech', 'thought', 'shout', 'ellipse', 'caption-withTail'].includes(style)) b.spec.tails = [defaultTail(b)];
  if (style === 'caption') { b.spec.shadowOffset = 5; b.spec.backgroundColors = ['#fff6cc', '#e9d797']; }
  if (style === 'none') b.spec.backgroundColors = ['transparent'];
  project.balloons.push(b); createBalloonElement(b); redraw(); select(b.id); commit();
}
function deleteBalloon() {
  const b = selected(); if (!b || busy) return; commit();
  Comical.deleteBubbleFromFamily(element(b), stage); project.balloons = project.balloons.filter(other => other.id !== b.id);
  syncFromDom(); selectedId = project.balloons.at(-1)?.id || null; redraw(); renderList(); refreshInspector(); commit();
}
function beginDrag(event: PointerEvent, resize: boolean, id = selectedId) {
  if (event.button !== 0 || !id || busy) return;
  const target = event.currentTarget as HTMLElement; event.preventDefault(); commit(); select(id);
  const b = selected()!, startX = event.clientX, startY = event.clientY;
  const start = { x: b.x, y: b.y, width: b.width, height: b.height };
  target.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) => {
    const dx = (e.clientX - startX) / zoom, dy = (e.clientY - startY) / zoom;
    if (resize) { b.width = clamp(start.width + dx, 20, project.image!.width); b.height = clamp(start.height + dy, 20, project.image!.height); }
    else { b.x = clamp(start.x + dx, 0, Math.max(0, project.image!.width - b.width)); b.y = clamp(start.y + dy, 0, Math.max(0, project.image!.height - b.height)); }
    applyText(b); refreshSelection();
  };
  const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); syncFromDom(); refreshInspector(); commit(); };
  target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
}
$('move-handle').addEventListener('pointerdown', e => beginDrag(e, false)); $('resize-handle').addEventListener('pointerdown', e => beginDrag(e, true));
let tailDragging = false;
stage.addEventListener('pointerdown', e => { tailDragging = e.target === stage.querySelector('canvas'); });
document.addEventListener('pointerup', () => {
  if (!tailDragging) return; tailDragging = false;
  requestAnimationFrame(() => { syncFromDom(); refreshTails(); commit(); });
});

async function openImage(file?: File) {
  if (!file || busy) return;
  if (!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type)) return toast('Choose a PNG, JPEG, WebP, GIF, AVIF, or BMP image.');
  if (file.size > 30_000_000) return toast('Choose an image smaller than 30 MB.');
  busy = true;
  try {
    const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read this image.')); reader.readAsDataURL(file); });
    const img = await loadImage(src);
    if (img.naturalWidth > MAX_DIMENSION || img.naturalHeight > MAX_DIMENSION || img.naturalWidth * img.naturalHeight > MAX_PIXELS) throw new Error('Choose an image up to 8192 px per side and 32 megapixels.');
    commit(); await restore({ version: 1, image: { src, name: file.name.slice(0, 255), width: img.naturalWidth, height: img.naturalHeight }, balloons: [] }); commit(); toast('Image ready. Pick a balloon from the toolbox.');
  } catch (e) { toast(e instanceof Error ? e.message : 'This image could not be opened.'); } finally { busy = false; }
}
['upload', 'empty-upload'].forEach(id => $(id).addEventListener('click', () => input('image-file').click()));
input('image-file').addEventListener('change', () => { void openImage(input('image-file').files?.[0]); input('image-file').value = ''; });
viewport.addEventListener('dragover', e => { e.preventDefault(); viewport.classList.add('dragover'); });
viewport.addEventListener('dragleave', e => { if (!viewport.contains(e.relatedTarget as Node)) viewport.classList.remove('dragover'); });
viewport.addEventListener('drop', e => { e.preventDefault(); viewport.classList.remove('dragover'); void openImage(e.dataTransfer?.files[0]); });

const icons: Record<string, string> = {
  speech: '<path d="M8 5Q30-4 51 6Q62 22 43 26L29 26L17 35L21 25Q-2 22 8 5Z"/>',
  thought: '<path d="M12 5Q8-2 22 2Q33-5 39 3Q54-2 54 9Q65 13 54 21Q56 29 41 25Q27 33 22 25Q7 28 7 18Q-1 9 12 5Z"/><circle cx="14" cy="31" r="3"/><circle cx="9" cy="36" r="1.5"/>',
  shout: '<path d="M2 10L14 10L12 0L24 7L32-2L37 8L51 1L48 12L60 15L48 20L54 30L39 25L34 35L27 26L12 32L15 22L0 23L8 16Z"/>',
  ellipse: '<ellipse cx="30" cy="14" rx="27" ry="16"/><path d="M20 28L13 35L30 28"/>',
  pointedArcs: '<path d="M0 7Q13 11 13-1Q28 7 33-3Q38 10 53 1Q48 16 61 20Q42 19 49 33Q33 27 29 37Q23 25 8 32Q14 20 0 20Q12 14 0 7Z"/>',
  circle: '<circle cx="30" cy="15" r="18"/>',
  caption: '<rect x="4" y="1" width="52" height="28"/><path d="M7 32H59V4" fill="none"/>',
  'caption-withTail': '<path d="M3 1H57V28H27L13 36L18 28H3Z"/>',
  rectangle: '<rect x="4" y="1" width="52" height="29" rx="2"/>',
  none: '<text x="30" y="23" text-anchor="middle" stroke="none" fill="#46563b" font-size="27" font-family="Georgia">Aa</text>',
};
styles.forEach(([name, label]) => {
  $<HTMLSelectElement>('style').add(new Option(label, name));
  const button = document.createElement('button'); button.className = 'style-card'; button.disabled = true;
  button.innerHTML = `<svg viewBox="-2 -5 66 46" aria-hidden="true">${icons[name]}</svg><span>${label}</span>`;
  button.addEventListener('click', () => addBalloon(name)); $('style-library').append(button);
});
$('text').addEventListener('input', () => edit(b => { b.text = $<HTMLTextAreaElement>('text').value.slice(0, 10000); }, false));
$('style').addEventListener('change', () => edit(b => {
  const s = value('style'); b.spec.style = s;
  if (['caption', 'rectangle', 'circle', 'pointedArcs', 'none'].includes(s)) b.spec.tails = [];
  else if (!b.spec.tails.length) b.spec.tails = [defaultTail(b)];
  if (s === 'none') b.spec.backgroundColors = ['transparent'];
  else if (b.spec.backgroundColors?.[0] === 'transparent') b.spec.backgroundColors = ['#ffffff'];
}));
for (const [id, key] of [['font-family', 'fontFamily'], ['text-color', 'textColor'], ['text-align', 'align']] as const) $(id).addEventListener('input', () => edit(b => { b[key] = value(id); }, false));
$('font-size').addEventListener('input', () => edit(b => { b.fontSize = number('font-size', 6, 300); }, false));
['bold', 'italic'].forEach(key => $(key).addEventListener('click', () => edit(b => { b[key] = !b[key]; })));
$('fill-mode').addEventListener('change', () => edit(b => {
  const mode = value('fill-mode'), colors = b.spec.backgroundColors || ['#ffffff'];
  b.spec.backgroundColors = mode === 'transparent' ? ['transparent'] : mode === 'solid' ? [colors[0] === 'transparent' ? '#ffffff' : colors[0]] : [colors[0] === 'transparent' ? '#ffffff' : colors[0], '#e9f48b'];
}));
$('add-color').addEventListener('click', () => edit(b => { if (b.spec.backgroundColors!.length < 8) b.spec.backgroundColors!.push('#ffffff'); }));
$('outer-border').addEventListener('change', () => edit(b => { b.spec.outerBorderColor = input('outer-border').checked ? value('outer-color') : undefined; }));
$('outer-color').addEventListener('input', () => edit(b => { if (input('outer-border').checked) b.spec.outerBorderColor = value('outer-color'); }, false));
for (const [id, key, max] of [['shadow', 'shadowOffset', 100], ['corner-x', 'cornerRadiusX', 300], ['corner-y', 'cornerRadiusY', 300]] as const) $(id).addEventListener('input', () => edit(b => { b.spec[key] = number(id, 0, max); }, false));
$('tail-index').addEventListener('change', () => { tailIndex = Number(value('tail-index')); refreshTails(); });
$('add-tail').addEventListener('click', () => edit(b => { if (b.spec.tails.length < 8) { const t = defaultTail(b); t.tipX += b.spec.tails.length * 40; b.spec.tails.push(t); tailIndex = b.spec.tails.length - 1; } }));
$('remove-tail').addEventListener('click', () => edit(b => { b.spec.tails.splice(tailIndex, 1); }));
$('auto-curve').addEventListener('change', () => edit(b => { b.spec.tails[tailIndex].autoCurve = input('auto-curve').checked; }));
$('joiner').addEventListener('change', () => edit(b => { if (b.spec.tails[tailIndex]) b.spec.tails[tailIndex].joiner = input('joiner').checked; }));
for (const [id, key] of [['tip-x', 'tipX'], ['tip-y', 'tipY'], ['mid-x', 'midpointX'], ['mid-y', 'midpointY']] as const) $(id).addEventListener('input', () => edit(b => { if (b.spec.tails[tailIndex]) b.spec.tails[tailIndex][key] = number(id, -MAX_DIMENSION, MAX_DIMENSION * 2); }, false));
for (const [id, key] of [['position-x', 'x'], ['position-y', 'y'], ['width', 'width'], ['height', 'height']] as const) $(id).addEventListener('change', () => edit(b => { b[key] = number(id, key === 'width' || key === 'height' ? 20 : 0, key === 'x' || key === 'width' ? project.image!.width : project.image!.height); }));
for (const key of ['level', 'order'] as const) $(key).addEventListener('change', () => edit(b => { b.spec[key] = Math.round(number(key, key === 'level' ? 1 : 0, 999)); }));
$('link-previous').addEventListener('click', () => {
  const b = selected(); if (!b) return; const prev = project.balloons[project.balloons.indexOf(b) - 1]; if (!prev) return;
  commit(); syncFromDom();
  if (!prev.spec.order) prev.spec.order = 1; writeSpec(prev);
  b.spec.level = prev.spec.level; b.spec.order = Math.max(...project.balloons.filter(other => other.spec.level === prev.spec.level).map(other => other.spec.order || 0)) + 1;
  const t = defaultTail(b); t.joiner = true; t.tipX = prev.x + prev.width / 2; t.tipY = prev.y + prev.height / 2; b.spec.tails = [t];
  writeSpec(b); redraw(); syncFromDom(); refreshInspector(); commit(); toast('Connected. The first balloon controls the family’s appearance.');
});
$('unlink').addEventListener('click', () => edit(b => { b.spec.level = nextLevel(); delete b.spec.order; b.spec.tails.forEach(t => { delete t.joiner; }); }));
$('duplicate').addEventListener('click', () => {
  const b = selected(); if (!b || busy) return;
  if (project.balloons.length >= 100) return toast('The canvas supports up to 100 balloons.');
  commit(); const copy = structuredClone(b); copy.id = crypto.randomUUID(); copy.x = clamp(copy.x + 35, 0, Math.max(0, project.image!.width - copy.width)); copy.y = clamp(copy.y + 35, 0, Math.max(0, project.image!.height - copy.height)); copy.spec.level = nextLevel(); delete copy.spec.order; copy.spec.tails.forEach(t => { t.tipX += 35; t.tipY += 35; t.midpointX += 35; t.midpointY += 35; delete t.joiner; }); project.balloons.push(copy); createBalloonElement(copy); redraw(); select(copy.id); commit();
});
$('delete').addEventListener('click', deleteBalloon);
async function undo(redo = false) {
  if (busy) return; commit(); const next = redo ? history.redo() : history.undo(); if (!next) return;
  busy = true; try { await restore(next); } finally { busy = false; }
}
$('undo').addEventListener('click', () => void undo()); $('redo').addEventListener('click', () => void undo(true));
document.addEventListener('keydown', e => {
  if (busy || $<HTMLDialogElement>('export-dialog').open) return;
  const target = e.target as HTMLElement;
  if (target.matches('input,textarea,select,[contenteditable=true]') || target.closest('[contenteditable=true]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); void undo(e.shiftKey); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); void undo(true); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteBalloon(); }
  else if (e.key === 'Escape') select(null);
  else if (selected() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault(); const distance = e.shiftKey ? 10 : 1;
    edit(b => { b.x = clamp(b.x + (e.key === 'ArrowLeft' ? -distance : e.key === 'ArrowRight' ? distance : 0), 0, Math.max(0, project.image!.width - b.width)); b.y = clamp(b.y + (e.key === 'ArrowUp' ? -distance : e.key === 'ArrowDown' ? distance : 0), 0, Math.max(0, project.image!.height - b.height)); });
  }
});
$('fit').addEventListener('click', fit); $('zoom-in').addEventListener('click', () => { fitted = false; setZoom(zoom * 1.25); }); $('zoom-out').addEventListener('click', () => { fitted = false; setZoom(zoom / 1.25); });

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function basename() { return (project.image?.name || 'comic').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'comic'; }
$('save-project').addEventListener('click', () => { if (!project.image || busy) return; commit(); download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${basename()}.comic.json`); toast('Project saved, including the original image and editable balloons.'); });
$('open-project').addEventListener('click', () => input('project-file').click());
input('project-file').addEventListener('change', async () => {
  const file = input('project-file').files?.[0]; input('project-file').value = ''; if (!file || busy) return;
  if (file.size > 50_000_000) return toast('Choose a project smaller than 50 MB.');
  busy = true;
  try {
    await fontCatalogReady;
    const data = validateProject(JSON.parse(await file.text())); const image = await loadImage(data.image.src);
    if (image.naturalWidth !== data.image.width || image.naturalHeight !== data.image.height) throw new Error('Project image dimensions do not match the embedded image.');
    commit(); await restore(data); commit(); toast('Project opened. Your story is ready to edit.');
  } catch (e) { toast(e instanceof Error ? e.message : 'This project could not be opened.'); } finally { busy = false; }
});
$('export').addEventListener('click', () => { if (!project.image || busy) return; $('export-dimensions').textContent = `${project.image.width} × ${project.image.height} pixels · original resolution`; $<HTMLDialogElement>('export-dialog').showModal(); });
$('export-format').addEventListener('change', () => $('quality-field').hidden = value('export-format') === 'png');
$('download').addEventListener('click', async () => {
  if (!project.image || busy) return; busy = true; input('download').disabled = true; $('download').textContent = 'Rendering your image…';
  let exportHost: HTMLElement | undefined;
  try {
    await document.fonts.ready; commit();
    // Export Comical's SVG into a copy without modifying the live editor or tail handles.
    const copy = stage.cloneNode(true) as HTMLElement; copy.id = 'export-stage';
    Object.assign(copy.style, { transform: 'none', position: 'relative', isolation: 'isolate' }); copy.querySelector('#selection')?.remove();
    copy.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    Comical.exportSvgToCopyOfParent(stage, copy);
    const svg = copy.querySelector<SVGElement>('.comical-generated');
    if (svg) Object.assign(svg.style, { position: 'absolute', top: '0', left: '0', zIndex: '1' });
    // Move the host offscreen, leaving the exported node itself at its origin.
    exportHost = document.createElement('div'); exportHost.className = 'export-copy'; exportHost.append(copy); document.body.append(exportHost);
    const format = value('export-format');
    const canvas = await toCanvas(copy, { width: project.image.width, height: project.image.height, pixelRatio: 1, skipAutoScale: true, skipFonts: false, backgroundColor: format === 'jpeg' ? '#ffffff' : undefined });
    const mime = `image/${format}`;
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('The browser could not encode this image.')), mime, Number(value('export-quality'))));
    const actualExtension = blob.type === mime ? format : 'png';
    download(blob, `${basename()}-comic.${actualExtension}`); $<HTMLDialogElement>('export-dialog').close(); toast(`Exported ${project.image.width} × ${project.image.height} ${actualExtension.toUpperCase()}.`);
  } catch (e) { console.error(e); toast('Export failed. Try PNG or use a smaller image. Your project is still editable.'); }
  finally { exportHost?.remove(); busy = false; input('download').disabled = false; $('download').textContent = 'Download image ↗'; }
});

$('demo').addEventListener('click', async () => {
  if (busy) return; busy = true;
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850"><rect width="1200" height="850" fill="#d8e4d0"/><circle cx="927" cy="191" r="76" fill="#f7e5a1"/><path d="M0 450L240 215L533 495L738 320L1033 553L1200 400V850H0Z" fill="#a6b695"/><path d="M0 544L257 364L516 603L799 421L1200 621V850H0Z" fill="#7e997b"/><path d="M0 680Q330 558 651 718Q943 527 1200 610V850H0Z" fill="#486c59"/><path d="M0 790Q307 657 580 790Q926 715 1200 828V850H0Z" fill="#304d3c"/><path d="M423 850Q695 709 714 605Q729 559 779 551" fill="none" stroke="#e0d8ac" stroke-width="35"/><g fill="#253f32"><rect x="937" y="431" width="15" height="211"/><path d="M944 320L888 458H920L866 534H1024L969 458H1000Z"/><rect x="162" y="548" width="12" height="163"/><path d="M168 446L113 584H140L106 646H232L196 584H223Z"/></g><g stroke="#263c31" stroke-width="12" stroke-linecap="round"><path d="M590 659L580 723M598 659L619 720M583 594L557 648M607 594L625 645"/><path d="M694 652L680 716M700 652L719 714M682 590L661 638M706 590L733 613"/></g><g><path d="M573 588Q594 575 616 588L622 659H565Z" fill="#f2d08a"/><circle cx="594" cy="560" r="25" fill="#d4a080"/><path d="M570 556Q571 519 609 533L619 552Z" fill="#283c32"/><path d="M672 585Q696 572 714 585L720 653H665Z" fill="#a9c1b1"/><circle cx="695" cy="557" r="24" fill="#e2b999"/><path d="M670 548Q678 519 706 531Q724 539 721 566L709 547Z" fill="#694f3c"/><path d="M567 599L559 637L578 649L588 604Z" fill="#bf784e"/></g><text x="43" y="803" font-family="Arial" font-size="13" letter-spacing="4" fill="#b9cdb1">A GOOD DAY TO GET LOST.</text></svg>`;
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 850; canvas.getContext('2d')!.drawImage(img, 0, 0);
    commit(); await restore({ version: 1, image: { src: canvas.toDataURL('image/png'), name: 'a-good-day.png', width: 1200, height: 850 }, balloons: [] }); busy = false;
    addBalloon('speech', 'Are we lost?'); const first = selected()!; first.x = 355; first.y = 255; first.width = 210; first.height = 80; first.spec.tails = [{ tipX: 595, tipY: 554, midpointX: 508, midpointY: 403, autoCurve: true }]; applyText(first); writeSpec(first);
    addBalloon('speech', 'Only if we stop exploring.'); const second = selected()!; second.x = 744; second.y = 349; second.width = 242; second.height = 91; second.spec.tails = [{ tipX: 700, tipY: 552, midpointX: 769, midpointY: 497, autoCurve: true }]; applyText(second); writeSpec(second); redraw(); refreshInspector(); commit();
  } catch (e) { console.error(e); toast('The sample could not be loaded. Choose a local image to begin.'); } finally { busy = false; }
});

history.push(project); renderList(); updateHistory(); input('export').disabled = true; input('save-project').disabled = true;
