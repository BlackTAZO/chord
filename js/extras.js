/* 프로젝트 저장/불러오기, 진행 프리셋, 악보 가져오기 UI */
(function () {
  'use strict';
  const API = window.AppAPI, S = API.state, P = window.Presets, Imp = window.Importer, T = window.Theory;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const open = (id) => { $(id).hidden = false; };
  const close = (id) => { $(id).hidden = true; };

  document.querySelectorAll('.modal-overlay').forEach((ov) => {
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.hidden = true; });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach((o) => (o.hidden = true)); });

  /* ---------- 프로젝트 저장소 ---------- */
  const KEY = 'chordviewer.projects.v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function store(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { API.toast('브라우저 저장소를 사용할 수 없습니다'); return false; }
  }
  const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function snapshot(title) {
    return { id: S.projectId || uid(), title, chords: S.chords.slice(), custom: S.custom.slice(), type: S.type, capo: S.capo, updated: Date.now() };
  }
  function saveCurrent(nameInput) {
    const title = (nameInput || S.title || '').trim() || '제목 없음';
    if (!S.chords.length) { API.toast('저장할 코드가 없습니다'); return; }
    const list = load();
    let existing = list.find((p) => p.id === S.projectId) || list.find((p) => p.title === title);
    if (existing && existing.title !== title && existing.id === S.projectId) existing = null; // 이름을 바꾸면 새 프로젝트로 저장
    S.projectId = existing ? existing.id : null;
    const snap = snapshot(title);
    if (existing) list[list.indexOf(existing)] = snap; else list.unshift(snap);
    if (!store(list)) return;
    S.projectId = snap.id; S.title = title; $('songTitle').value = title;
    API.toast(existing ? `"${title}" 을(를) 덮어써서 저장했습니다` : `"${title}" 저장 완료`);
    renderProjects();
  }
  function applyProject(p) {
    const chords = (p.chords || []).map((c) => API.parse(c)).filter(Boolean).map((c) => c.name);
    S.chords = chords; S.orig = chords.slice();
    S.custom = (p.custom || []).filter((c) => chords.includes(c));
    S.title = p.title || ''; S.projectId = p.id;
    if (p.type) S.type = p.type;
    S.capo = p.capo || 0;
    API.refreshAll();
  }
  function renderProjects() {
    const list = load();
    $('projName').value = S.title || '';
    $('projList').innerHTML = list.length ? list.map((p) =>
      `<div class="proj-item" data-id="${esc(p.id)}"><div class="info"><div class="t">${esc(p.title)}${p.id === S.projectId ? ' ✓' : ''}</div><div class="s">${p.chords.length}개 코드 · ${esc(p.chords.slice(0, 8).join(' '))}${p.chords.length > 8 ? '…' : ''} · ${new Date(p.updated).toLocaleDateString('ko-KR')}</div></div><button class="btn btn-primary" data-load>불러오기</button><button class="btn btn-danger" data-del>삭제</button></div>`).join('')
      : '<div class="empty-list">저장된 프로젝트가 없습니다</div>';
  }
  $('projectBtn').addEventListener('click', () => { renderProjects(); open('projectModal'); });
  $('quickSave').addEventListener('click', () => saveCurrent(S.title));
  $('projSave').addEventListener('click', () => saveCurrent($('projName').value));
  $('projList').addEventListener('click', (e) => {
    const row = e.target.closest('.proj-item'); if (!row) return;
    const list = load(); const p = list.find((x) => x.id === row.dataset.id); if (!p) return;
    if (e.target.closest('[data-load]')) { applyProject(p); close('projectModal'); API.toast(`"${p.title}" 불러옴`); }
    else if (e.target.closest('[data-del]')) {
      if (!confirm(`"${p.title}" 프로젝트를 삭제할까요?`)) return;
      store(list.filter((x) => x.id !== p.id));
      if (S.projectId === p.id) S.projectId = null;
      renderProjects();
    }
  });
  $('projExport').addEventListener('click', () => {
    const list = load();
    if (!list.length) { API.toast('내보낼 프로젝트가 없습니다'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'chord-viewer', projects: list }, null, 2)], { type: 'application/json' }));
    a.download = 'chord-viewer-projects.json';
    a.click(); URL.revokeObjectURL(a.href);
  });
  $('projImportFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const incoming = (Array.isArray(data) ? data : data.projects || []).filter((p) => p && Array.isArray(p.chords));
      const list = load();
      incoming.forEach((p) => {
        const clean = { id: list.some((x) => x.id === p.id) ? uid() : (p.id || uid()), title: String(p.title || '제목 없음'), chords: p.chords.map(String), custom: (p.custom || []).map(String), type: p.type, capo: p.capo || 0, updated: p.updated || Date.now() };
        list.unshift(clean);
      });
      store(list); renderProjects();
      API.toast(`${incoming.length}개 프로젝트를 가져왔습니다`);
    } catch (err) { API.toast('올바른 프로젝트 파일이 아닙니다'); }
  });

  /* ---------- 프리셋 ---------- */
  const NAMES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
  $('presetKey').innerHTML = NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  function renderPresets() {
    const key = +$('presetKey').value;
    $('presetList').innerHTML = P.PRESETS.map((p, i) => {
      const ch = P.build(p, key);
      return `<div class="proj-item" data-i="${i}"><div class="info"><div class="t">${esc(p.n)}${p.minor ? ' (단조)' : ''}</div><div class="s">${esc(p.d)} · ${esc(p.r.join(' – '))}</div><div class="s" style="color:#1e40af;font-weight:600">${esc(ch.join('  '))}</div></div><button class="btn btn-primary" data-apply>적용</button></div>`;
    }).join('');
  }
  $('presetBtn').addEventListener('click', () => { renderPresets(); open('presetModal'); });
  $('presetKey').addEventListener('change', renderPresets);
  $('presetList').addEventListener('click', (e) => {
    const row = e.target.closest('.proj-item'); if (!row || !e.target.closest('[data-apply]')) return;
    const p = P.PRESETS[+row.dataset.i], key = +$('presetKey').value;
    const seq = P.build(p, key);
    applySequence(seq, $('presetAppend').checked, `${p.n} (${NAMES[key].split('/')[0]}${p.minor ? 'm' : ''})`);
    close('presetModal');
  });

  /* 코드 시퀀스를 현재 화면에 적용: 목록(중복 제거) + 나만의 진행(순서 유지) */
  function applySequence(seq, append, title) {
    const names = seq.map((c) => API.parse(c)).filter(Boolean).map((c) => c.name);
    if (!names.length) { API.toast('적용할 코드가 없습니다'); return; }
    if (!append) { S.chords = []; S.orig = []; S.custom = []; S.projectId = null; if (title) S.title = title; }
    else if (!S.title && title) S.title = title;
    names.forEach((n) => { if (!S.chords.includes(n)) { S.chords.push(n); S.orig.push(n); } });
    S.custom = S.custom.concat(names).slice(0, 64);
    API.refreshAll();
    document.getElementById('notationBar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    API.toast(`${names.length}개 코드 적용 — 위 탭에서 원하는 악기 표기를 선택하세요`);
  }

  /* ---------- 악보 가져오기 ---------- */
  let importTitle = '';
  const status = (msg, err) => { const el = $('importStatus'); el.textContent = msg || ''; el.className = 'status' + (err ? ' err' : ''); };
  function showResult(res) {
    if (!res.seq.length) {
      $('importResult').style.display = 'none';
      status('코드를 찾지 못했습니다. 코드 기호(Am, G7 …)가 선명하게 보이는 사진/파일인지 확인하거나 아래에 직접 입력해 보세요.', true);
      $('importResult').style.display = '';
      $('importChords').value = '';
      return;
    }
    status(`${res.kind}에서 ${res.seq.length}개 코드를 읽었습니다. 확인 후 "이 코드로 열기"를 누르세요.`);
    $('importChords').value = res.seq.join(' ');
    $('importResult').style.display = '';
  }
  async function handleFile(file) {
    if (!file) return;
    importTitle = file.name.replace(/\.[^.]+$/, '');
    status('불러오는 중…');
    try { showResult(await Imp.importFile(file, status)); }
    catch (err) { status(err.message || '파일을 처리하지 못했습니다', true); }
  }
  $('importBtn').addEventListener('click', () => open('importModal'));
  $('importFile').addEventListener('change', (e) => { handleFile(e.target.files[0]); e.target.value = ''; });
  const dz = $('dropZone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
  $('importAnalyze').addEventListener('click', () => {
    const t = $('importText').value.trim();
    if (!t) { status('텍스트를 붙여넣어 주세요', true); return; }
    importTitle = '';
    showResult(Imp.fromText(t));
  });
  $('importApply').addEventListener('click', () => {
    const toks = $('importChords').value.split(/[\s,]+/).filter(Boolean);
    const bad = toks.filter((t) => !API.parse(t));
    if (bad.length) API.toast(`인식 못한 코드는 건너뜁니다: ${bad.slice(0, 5).join(', ')}`);
    applySequence(toks, $('importAppend').checked, importTitle);
    close('importModal');
  });
})();
