/* Panel docente: clave, tabla, filtro por curso, promedios, eliminar (doble clic), borrar todo, CSV. */
import { EXAM_ID, TEACHER_KEY } from '../config.js';
import { SUPABASE_CONFIGURED, supabaseGetWithRetry, supabaseSend } from './supabase.js';
import { escapeHtml, isCompletedRow, courseAverages, toCSV } from './logic.js';

const $ = id => document.getElementById(id);
let authenticated = false;
let allRows = [];
let sampleMode = false;
let lastFocus = null;

/* Confirmación por doble clic (nunca confirm(), que se bloquea en los iframes). */
export function armButton(btn, fn, label) {
  const original = label || btn.dataset.label || btn.textContent;
  btn.dataset.label = original;
  if (btn.dataset.armed === '1') {
    btn.dataset.armed = '0';
    btn.classList.remove('armed');
    btn.textContent = original;
    fn();
    return;
  }
  btn.dataset.armed = '1';
  btn.classList.add('armed');
  btn.textContent = '¿CONFIRMAR?';
  setTimeout(() => {
    if (btn.dataset.armed === '1') { btn.dataset.armed = '0'; btn.classList.remove('armed'); btn.textContent = original; }
  }, 3000);
}

function filteredRows() {
  const f = $('teacherFilter').value;
  return f ? allRows.filter(r => (r.course || '1BGU') === f) : allRows;
}

function setMsg(html, cls) {
  $('teacherTableWrap').innerHTML = '<p class="t-msg ' + (cls || '') + '">' + html + '</p>';
}

function renderAverages() {
  const box = $('teacherAverages');
  const avgs = courseAverages(allRows);
  if (!avgs.length) { box.innerHTML = ''; return; }
  const total = allRows.reduce((s, r) => s + Number(r.grade || 0), 0) / allRows.length;
  box.innerHTML = avgs.map(a =>
    '<div class="avg-chip"><span class="avg-c">' + escapeHtml(a.course) + '</span><span class="avg-v">' + a.avg.toFixed(2) +
    '</span><span class="avg-n">' + a.n + ' nota' + (a.n === 1 ? '' : 's') + '</span></div>').join('') +
    '<div class="avg-chip all"><span class="avg-c">GENERAL</span><span class="avg-v">' + total.toFixed(2) + '</span><span class="avg-n">' + allRows.length + ' en total</span></div>';
}

function renderFilterOptions() {
  const sel = $('teacherFilter');
  const cur = sel.value;
  const courses = [...new Set(allRows.map(r => r.course || '1BGU'))].sort();
  sel.innerHTML = '<option value="">Todos los cursos</option>' + courses.map(c => '<option>' + escapeHtml(c) + '</option>').join('');
  if (courses.includes(cur)) sel.value = cur;
}

function renderTable() {
  const rows = filteredRows();
  $('teacherCount').textContent = rows.length ? rows.length + ' registro(s)' : '';
  if (!rows.length) { setMsg('No hay notas guardadas todavía.'); return; }
  let html = '<table><thead><tr><th>Nombre</th><th>Apellido</th><th>Curso</th><th>Correctas</th><th>Total</th>' +
    '<th>Nota /10</th><th>Puntos GP</th><th>Fecha</th><th></th></tr></thead><tbody>';
  rows.forEach(r => {
    const date = r.timestamp || r.created_at || '';
    const g = Number(r.grade || 0);
    const cls = g >= 7 ? 'g-ok' : (g >= 5 ? 'g-mid' : 'g-low');
    html += '<tr><td>' + escapeHtml(r.student_name || '') + '</td><td>' + escapeHtml(r.student_lastname || '') + '</td>' +
      '<td>' + escapeHtml(r.course || '1BGU') + '</td><td>' + (r.score || 0) + '</td><td>' + (r.total || 0) + '</td>' +
      '<td><strong class="grade-pill ' + cls + '">' + g.toFixed(1) + '</strong></td>' +
      '<td>' + ((r.answers && r.answers.score_game) || 0) + '</td>' +
      '<td>' + (date ? new Date(date).toLocaleString('es-EC') : '-') + '</td>' +
      '<td class="nowrap"><button class="mk-btn mk-red mk-xs" data-del="' + escapeHtml(String(r.id)) + '" aria-label="Eliminar nota de ' + escapeHtml(r.student_name || '') + '">ELIMINAR</button></td></tr>';
  });
  html += '</tbody></table>';
  $('teacherTableWrap').innerHTML = html;
  $('teacherTableWrap').querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', function () {
      const id = this.getAttribute('data-del');
      const row = allRows.find(r => String(r.id) === id);
      if (!row || row.id == null) return;
      armButton(this, () => {
        if (sampleMode) { allRows = allRows.filter(r => r !== row); refresh(); return; }
        supabaseSend('quiz_results?id=eq.' + encodeURIComponent(row.id), 'DELETE').then(load).catch(load);
      }, 'ELIMINAR');
    });
  });
}

function refresh() { renderFilterOptions(); renderAverages(); renderTable(); }

function load() {
  if (sampleMode) { refresh(); return; }
  if (!SUPABASE_CONFIGURED) { allRows = []; setMsg('Supabase no está configurado. Revisa las credenciales.', 'err'); return; }
  setMsg('Cargando notas…');
  supabaseGetWithRetry('quiz_results?exam_id=eq.' + EXAM_ID + '&select=*&order=timestamp.desc', 2)
    .then(rows => { allRows = (rows || []).filter(isCompletedRow); refresh(); })
    .catch(() => { allRows = []; refresh(); setMsg('Error de conexión con el servidor. Verifica que el proyecto esté activo.', 'err'); });
}

function showPanel() {
  $('teacherLogin').hidden = true;
  $('teacherPanel').hidden = false;
  load();
}

export function openTeacher(opts = {}) {
  lastFocus = document.activeElement;
  const m = $('modal-teacher');
  m.hidden = false;
  requestAnimationFrame(() => m.classList.add('open'));
  if (opts.sampleRows) { sampleMode = true; authenticated = true; allRows = opts.sampleRows.slice(); }
  if (authenticated) showPanel();
  else {
    $('teacherLogin').hidden = false; $('teacherPanel').hidden = true;
    $('teacherKeyError').classList.remove('show');
    $('teacherKeyInput').value = '';
    setTimeout(() => $('teacherKeyInput').focus(), 50);
  }
}
export function closeTeacher() {
  const m = $('modal-teacher');
  m.classList.remove('open');
  m.hidden = true;
  if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
}
export function isTeacherOpen() { return !$('modal-teacher').hidden; }

function validateKey() {
  const key = $('teacherKeyInput').value.trim();
  const err = $('teacherKeyError');
  if (key !== TEACHER_KEY) { err.textContent = 'Clave incorrecta.'; err.classList.add('show'); return; }
  err.classList.remove('show');
  authenticated = true;
  showPanel();
}

function clearAll() {
  armButton($('btnClearAll'), () => {
    if (sampleMode) { allRows = []; refresh(); return; }
    supabaseSend('quiz_results?exam_id=eq.' + EXAM_ID, 'DELETE').then(load).catch(load);
  }, 'BORRAR TODAS');
}

function exportCSV() {
  const rows = filteredRows();
  if (!rows.length) { $('teacherCount').textContent = 'No hay notas para exportar.'; return; }
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const f = $('teacherFilter').value;
  a.download = 'super_economia_kart_notas' + (f ? '_' + f.replace(/\s+/g, '_') : '') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function initTeacher() {
  $('teacherTrigger').addEventListener('click', () => openTeacher());
  $('btnCloseTeacher').addEventListener('click', closeTeacher);
  $('btnValidateKey').addEventListener('click', validateKey);
  $('teacherKeyInput').addEventListener('keydown', e => { if (e.key === 'Enter') validateKey(); });
  $('btnExport').addEventListener('click', exportCSV);
  $('btnClearAll').addEventListener('click', clearAll);
  $('btnReloadTeacher').addEventListener('click', load);
  $('teacherFilter').addEventListener('change', renderTable);
  $('modal-teacher').addEventListener('click', function (e) { if (e.target === this) closeTeacher(); });
}
