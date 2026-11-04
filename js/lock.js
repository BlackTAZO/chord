/* 편집 도구 잠금: 방문자는 보기·재생만, 비밀번호를 입력하면 편집 도구가 열린다 (브라우저 탭 단위 유지) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SK = 'chordviewer.unlocked';
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

  function setLocked(locked) {
    document.body.classList.toggle('locked', locked);
    $('lockBtn').textContent = locked ? '🔒 편집 잠금해제' : '🔓 잠그기';
    $('songTitle').readOnly = locked;
    try { locked ? sessionStorage.removeItem(SK) : sessionStorage.setItem(SK, '1'); } catch (e) { /* 무시 */ }
  }
  async function check(pw) {
    const L = window.LOCK;
    if (!L || !window.crypto || !crypto.subtle) throw new Error('이 환경에서는 잠금을 확인할 수 없습니다 (https 또는 localhost 필요)');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(L.salt), iterations: L.iter, hash: 'SHA-256' }, key, 256);
    return hex(bits) === L.hash;
  }

  /* 실패 횟수 제한: 10회 틀리면 10분간 입력 차단 (이 브라우저 기준) */
  const FK = 'chordviewer.lockfail', MAX_FAIL = 10, BLOCK_MS = 10 * 60 * 1000;
  let mem = { count: 0, until: 0 };
  const getFail = () => { try { return JSON.parse(localStorage.getItem(FK)) || mem; } catch (e) { return mem; } };
  const setFail = (v) => { mem = v; try { localStorage.setItem(FK, JSON.stringify(v)); } catch (e) { /* 메모리로만 유지 */ } };
  const remainMs = () => Math.max(0, getFail().until - Date.now());
  const remainText = () => `시도 횟수를 초과했습니다. 약 ${Math.ceil(remainMs() / 60000)}분 뒤에 다시 시도하세요.`;
  let tick = null;
  function refreshBlock() {
    const blocked = remainMs() > 0;
    $('lockInput').disabled = blocked; $('lockSubmit').disabled = blocked;
    if (blocked) { msg.textContent = remainText(); if (!tick) tick = setInterval(refreshBlock, 15000); }
    else if (tick) { clearInterval(tick); tick = null; if (msg.textContent.startsWith('시도 횟수')) msg.textContent = ''; }
  }

  const modal = $('lockModal'), input = $('lockInput'), msg = $('lockMsg');
  function openModal() { msg.textContent = ''; input.value = ''; modal.hidden = false; refreshBlock(); if (!input.disabled) input.focus(); }
  async function submit() {
    if (remainMs() > 0) { refreshBlock(); return; }
    msg.textContent = '확인 중…';
    try {
      if (await check(input.value)) {
        setFail({ count: 0, until: 0 });
        setLocked(false); modal.hidden = true; window.AppAPI.toast('편집 도구가 열렸습니다');
      } else {
        const count = (getFail().count || 0) + 1;
        if (count >= MAX_FAIL) { setFail({ count: 0, until: Date.now() + BLOCK_MS }); input.value = ''; refreshBlock(); }
        else { setFail({ count, until: 0 }); msg.textContent = `비밀번호가 맞지 않습니다 (${MAX_FAIL - count}회 남음)`; }
      }
    } catch (e) { msg.textContent = e.message; }
  }
  $('lockBtn').addEventListener('click', () => (document.body.classList.contains('locked') ? openModal() : setLocked(true)));
  $('lockSubmit').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.hidden = true; });

  let was = false;
  try { was = sessionStorage.getItem(SK) === '1'; } catch (e) { /* 무시 */ }
  setLocked(!was);
})();
