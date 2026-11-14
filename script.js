const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (b) => (b < 1048576 ? Math.round(b / 1024) + ' КБ' : (b / 1048576).toFixed(2) + ' МБ');
const baseName = (n) => n.replace(/\.[^.]+$/, '');
const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f) => f.type.startsWith('image/');
const state = {};
const fail = (msg) => Object.assign(new Error(msg), { friendly: true });

/* ── Перемикання інструментів ── */
function show(id) {
  if (!$$('.panel').some((p) => p.id === id)) id = 'pdf-compress';
  $$('.panel').forEach((p) => (p.hidden = p.id !== id));
  $$('.pick').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === id));
}
$$('.pick').forEach((b) => b.addEventListener('click', () => {
  history.replaceState(null, '', '#' + b.dataset.tool);
  show(b.dataset.tool);
  if (matchMedia('(max-width: 720px)').matches) $('#' + b.dataset.tool).scrollIntoView({ block: 'start' });
}));
show(location.hash.slice(1));

/* ── Завантаження файлів ── */
function setupDrop(id, accept, multiple, onChange) {
  const root = $('#' + id), zone = $('.drop', root), input = $('input', zone), status = $('.status', root);
  const take = (list) => {
    const ok = [...list].filter(accept);
    if (!ok.length) { status.textContent = 'Цей тип файлу не підтримується'; return; }
    state[id] = multiple ? [...(state[id] || []), ...ok] : [ok[0]];
    status.textContent = `Вибрано файлів: ${state[id].length}`;
    if (onChange) onChange();
  };
  input.addEventListener('change', () => { take(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.remove('is-over'); }));
  zone.addEventListener('drop', (e) => take(e.dataTransfer.files));
}

/* Запуск задачі: статус, блокування кнопки, результати зі посиланнями */
function setupRun(id, task) {
  const root = $('#' + id), btn = $('.run', root), status = $('.status', root), out = $('.out', root);
  btn.addEventListener('click', async () => {
    const files = state[id] || [];
    if (!files.length) { status.textContent = 'Спочатку оберіть файл'; return; }
    btn.disabled = true; out.replaceChildren(); status.textContent = 'Обробка…';
    try {
      const items = await task(files, (msg) => (status.textContent = msg));
      items.forEach(([name, meta, blob]) => out.append(resultItem(name, meta, blob)));
      status.textContent = 'Готово';
    } catch (err) {
      console.error(err);
      status.textContent = err.friendly ? err.message : 'Не вдалося обробити файл. Перевірте, що він не пошкоджений і не захищений паролем.';
    }
    btn.disabled = false;
  });
}

function resultItem(name, meta, blob) {
  const li = document.createElement('li'), a = document.createElement('a'), span = document.createElement('span'), small = document.createElement('small');
  li.className = 'item'; span.className = 'item__name'; small.textContent = meta;
  span.append(name, small);
  a.className = 'btn btn--soft'; a.textContent = 'Завантажити'; a.download = name; a.href = URL.createObjectURL(blob);
  li.append(span, a);
  return li;
}

/* ── Допоміжні функції для зображень ── */
function renderImage(bmp, w, h, type, quality) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(bmp, 0, 0, w, h);
  return new Promise((res) => c.toBlob(res, type, quality));
}
const sizes = (a, b) => `${fmt(a)} → ${fmt(b)}${b >= a ? ' (більше за оригінал)' : ''}`;

/* ── Стиснення PDF ── */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
setupDrop('pdf-compress', isPdf, false);
setupRun('pdf-compress', async ([file], progress) => {
  const [scale, quality] = $('#pc-level').value.split(',').map(Number);
  const src = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = await PDFLib.PDFDocument.create();
  for (let n = 1; n <= src.numPages; n++) {
    progress(`Сторінка ${n} з ${src.numPages}`);
    const page = await src.getPage(n), vp = page.getViewport({ scale }), pt = page.getViewport({ scale: 1 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const jpg = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    const img = await out.embedJpg(await jpg.arrayBuffer());
    out.addPage([pt.width, pt.height]).drawImage(img, { x: 0, y: 0, width: pt.width, height: pt.height });
  }
  const blob = new Blob([await out.save()], { type: 'application/pdf' });
  return [[baseName(file.name) + '-compressed.pdf', sizes(file.size, blob.size), blob]];
});

/* ── Об’єднання PDF ── */
function drawFiles() {
  const list = $('#pdf-merge .files');
  list.replaceChildren(...(state['pdf-merge'] || []).map((f, i) => {
    const li = document.createElement('li'), name = document.createElement('span'), small = document.createElement('small');
    li.className = 'item'; li.dataset.i = i; name.className = 'item__name'; small.textContent = fmt(f.size);
    name.append(f.name, small);
    li.append(name);
    li.insertAdjacentHTML('beforeend', '<span class="item__btns"><button type="button" data-a="up" aria-label="Вгору">↑</button><button type="button" data-a="down" aria-label="Вниз">↓</button><button type="button" data-a="del" aria-label="Видалити">✕</button></span>');
    return li;
  }));
}
$('#pdf-merge .files').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const i = +b.closest('li').dataset.i, list = state['pdf-merge'], j = b.dataset.a === 'up' ? i - 1 : i + 1;
  if (b.dataset.a === 'del') list.splice(i, 1);
  else if (list[j]) [list[i], list[j]] = [list[j], list[i]];
  $('#pdf-merge .status').textContent = list.length ? `Вибрано файлів: ${list.length}` : '';
  drawFiles();
});
setupDrop('pdf-merge', isPdf, true, drawFiles);
setupRun('pdf-merge', async (files) => {
  if (files.length < 2) throw fail('Додайте щонайменше два PDF-файли');
  const merged = await PDFLib.PDFDocument.create();
  for (const f of files) {
    const doc = await PDFLib.PDFDocument.load(await f.arrayBuffer());
    (await merged.copyPages(doc, doc.getPageIndices())).forEach((p) => merged.addPage(p));
  }
  const blob = new Blob([await merged.save()], { type: 'application/pdf' });
  return [['merged.pdf', fmt(blob.size), blob]];
});

/* ── Конвертація зображень ── */
const FORMATS = { jpg: ['image/jpeg', 'jpg'], png: ['image/png', 'png'], webp: ['image/webp', 'webp'] };
setupDrop('img-convert', isImage, true);
setupRun('img-convert', async (files, progress) => {
  const [type, ext] = FORMATS[$('#ic-format').value], items = [];
  for (const [i, f] of files.entries()) {
    progress(`Файл ${i + 1} з ${files.length}`);
    const bmp = await createImageBitmap(f);
    const blob = await renderImage(bmp, bmp.width, bmp.height, type, 0.92);
    items.push([baseName(f.name) + '.' + ext, sizes(f.size, blob.size), blob]);
  }
  return items;
});

/* ── Зменшення розміру фото ── */
$('#ir-quality').addEventListener('input', (e) => ($('#ir-qv').textContent = e.target.value));
setupDrop('img-reduce', isImage, true);
setupRun('img-reduce', async (files, progress) => {
  const max = Math.max(200, Number($('#ir-max').value) || 1600), quality = $('#ir-quality').value / 100, items = [];
  for (const [i, f] of files.entries()) {
    progress(`Файл ${i + 1} з ${files.length}`);
    const bmp = await createImageBitmap(f), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const blob = await renderImage(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k), 'image/jpeg', quality);
    items.push([baseName(f.name) + '-small.jpg', sizes(f.size, blob.size), blob]);
  }
  return items;
});

/* ── QR-коди ── */
const qrText = $('#qr-text'), qrCanvas = $('#qr-canvas'), qrSave = $('#qr-save'), qrStatus = $('#qr .status');
qrText.addEventListener('input', () => {
  const text = qrText.value.trim();
  qrStatus.textContent = '';
  qrCanvas.hidden = qrSave.hidden = !text;
  if (!text) return;
  QRCode.toCanvas(qrCanvas, text, { width: 240, margin: 2, color: { dark: '#172554', light: '#ffffff' } })
    .then(() => (qrSave.href = qrCanvas.toDataURL('image/png')))
    .catch(() => { qrCanvas.hidden = qrSave.hidden = true; qrStatus.textContent = 'Текст завеликий для QR-коду'; });
});

/* ── Підвал ── */
$('#year').textContent = new Date().getFullYear();

/* ── Зображення в PDF ── */
setupDrop('img-pdf', isImage, true);
setupRun('img-pdf', async (files, progress) => {
  const pdf = await PDFLib.PDFDocument.create();
  for (const [i, f] of files.entries()) {
    progress(`Файл ${i + 1} з ${files.length}`);
    const bmp = await createImageBitmap(f), w = bmp.width * 0.75, h = bmp.height * 0.75;
    const jpg = await renderImage(bmp, bmp.width, bmp.height, 'image/jpeg', 0.9);
    pdf.addPage([w, h]).drawImage(await pdf.embedJpg(await jpg.arrayBuffer()), { x: 0, y: 0, width: w, height: h });
  }
  const blob = new Blob([await pdf.save()], { type: 'application/pdf' });
  return [['images.pdf', fmt(blob.size), blob]];
});

/* ── Витяг сторінок PDF ── */
setupDrop('pdf-split', isPdf, false);
setupRun('pdf-split', async ([file]) => {
  const src = await PDFLib.PDFDocument.load(await file.arrayBuffer()), total = src.getPageCount(), pages = new Set();
  $('#ps-pages').value.split(',').forEach((part) => {
    const [a, b = a] = part.trim().split('-').map(Number);
    if (a >= 1 && b >= a) for (let n = a; n <= Math.min(b, total); n++) pages.add(n - 1);
  });
  if (!pages.size) throw fail(`Вкажіть сторінки, наприклад 1-3, 5 (у файлі їх ${total})`);
  const out = await PDFLib.PDFDocument.create();
  (await out.copyPages(src, [...pages])).forEach((p) => out.addPage(p));
  const blob = new Blob([await out.save()], { type: 'application/pdf' });
  return [[baseName(file.name) + '-pages.pdf', `Сторінок: ${pages.size}, ${fmt(blob.size)}`, blob]];
});

/* ── Генератор паролів ── */
const SETS = { letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', symbols: '!@#$%^&*()-_=+?' };
function newPassword() {
  const pool = SETS.letters + ($('#pw-digits').checked ? SETS.digits : '') + ($('#pw-symbols').checked ? SETS.symbols : '');
  $('#pw-out').value = Array.from(crypto.getRandomValues(new Uint32Array(+$('#pw-len').value)), (n) => pool[n % pool.length]).join('');
}
$('#pw-len').addEventListener('input', (e) => { $('#pw-len-v').textContent = e.target.value; newPassword(); });
['#pw-digits', '#pw-symbols'].forEach((s) => $(s).addEventListener('change', newPassword));
$('#pw-new').addEventListener('click', newPassword);
$('#pw-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#pw-out').value); $('#password .status').textContent = 'Скопійовано'; }
  catch { $('#pw-out').select(); }
});
newPassword();

/* ── Лічильник тексту ── */
$('#tc-text').addEventListener('input', (e) => {
  const t = e.target.value.trim(), words = t ? t.split(/\s+/).length : 0;
  $('#tc-chars').textContent = e.target.value.length;
  $('#tc-words').textContent = words;
  $('#tc-sent').textContent = (t.match(/[^.!?…]+[.!?…]*/g) || []).filter((s) => /\S/.test(s)).length;
  $('#tc-time').textContent = !words ? '0 хв' : words < 200 ? '<1 хв' : Math.ceil(words / 200) + ' хв';
});

/* ── Відсотки ── */
function calcPercent() {
  const p = parseFloat($('#pr-p').value), n = parseFloat($('#pr-n').value), r = (x) => (+x.toFixed(2)).toLocaleString('uk-UA');
  const lines = Number.isNaN(p) || Number.isNaN(n) ? [] : [
    `${p}% від ${r(n)} = ${r((n * p) / 100)}`,
    `${r(n)} + ${p}% = ${r(n * (1 + p / 100))}`,
    `${r(n)} − ${p}% = ${r(n * (1 - p / 100))}`
  ];
  $('#pr-out').replaceChildren(...lines.map((t) => Object.assign(document.createElement('li'), { className: 'item', textContent: t })));
}
['#pr-p', '#pr-n'].forEach((s) => $(s).addEventListener('input', calcPercent));
