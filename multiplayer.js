let mpSession = null;
let mpSocket = null;
let mpState = null;
let mpClock = null;
let mpReconnect = null;

function mpLeave() {
  clearInterval(mpClock);
  clearTimeout(mpReconnect);
  mpSession = null;
  mpState = null;
  if (mpSocket) { mpSocket.onclose = null; mpSocket.close(); mpSocket = null; }
  sessionStorage.removeItem('adu-mp-session');
  history.replaceState(null, '', location.pathname);
}

function mpConnect() {
  if (!mpSession) return;
  if (mpSocket) { mpSocket.onclose = null; mpSocket.close(); }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  mpSocket = new WebSocket(`${protocol}//${location.host}/api/room/${mpSession.code}/ws?token=${encodeURIComponent(mpSession.token)}`);
  mpSocket.onmessage = event => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === 'error') { toast(data.message); return; }
    if (data.type !== 'state') return;
    mpState = data;
    const target = data.phase === 'lobby' ? 'lobby' : data.phase === 'finished' ? 'mpResults' : 'mpQuiz';
    if (screen !== target) setScreen(target);
    else render();
    mpUpdateClock();
  };
  mpSocket.onclose = () => {
    if (!mpSession) return;
    toast('Koneksi room terputus. Menghubungkan ulang…');
    mpReconnect = setTimeout(mpConnect, 2500);
  };
  mpSocket.onerror = () => mpSocket.close();
}

function mpUpdateClock() {
  clearInterval(mpClock);
  if (!mpState || !mpState.endsAt) return;
  const tick = () => {
    const timer = document.querySelector('#mp-timer');
    if (!timer) return;
    const remaining = Math.max(0, Math.ceil((mpState.endsAt - Date.now()) / 1000));
    timer.textContent = remaining;
    timer.classList.toggle('urgent', remaining <= 10);
  };
  tick();
  mpClock = setInterval(tick, 250);
}

function mpPlayers() {
  return `<div class="mp-scoreboard">${mpState.players.map((p, i) => `<div class="player-row"><span class="player-dot">${esc(p.name[0] || 'P')}</span><strong>${i + 1}. ${esc(p.name)}${p.id === mpState.me?.id ? ' (kamu)' : ''}</strong><small>${p.connected ? '● ' : '○ '}${p.score.toLocaleString('id-ID')} poin</small></div>`).join('')}</div>`;
}

window.mpRenderLobby = function () {
  const code = mpSession?.code || '';
  app.innerHTML = `<div class="page-wrap"><button class="back-link" data-action="mp-leave">← Keluar dari room</button><span class="eyebrow">Ruang tunggu langsung</span><h1 class="page-title">Room ${esc(code)}</h1><p class="page-sub">Bagikan kode atau tautan ini ke teman. Pertandingan dimulai setelah minimal 2 pemain tersambung.</p><section class="panel"><label class="field-label">KODE ROOM</label><div class="room-code">${esc(code)}<button data-action="mp-copy">Salin undangan</button></div>${mpState ? mpPlayers() : '<p class="page-sub">Menghubungkan ke room…</p>'}<div class="notice">${mpState?.isHost ? 'Kamu host. Klik mulai setelah teman masuk.' : 'Menunggu host memulai pertandingan.'}</div>${mpState?.isHost ? '<button class="btn btn-primary full" data-action="mp-start">Mulai pertandingan →</button>' : ''}</section></div>`;
};

window.mpRenderQuiz = function () {
  if (!mpState?.question) return;
  const q = mpState.question;
  const reveal = mpState.phase === 'reveal';
  const answered = mpState.me?.answered;
  const progress = mpState.index / mpState.total * 100;
  app.innerHTML = `<div class="page-wrap"><button class="back-link" data-action="mp-leave">← Keluar dari room</button><div class="quiz-top"><span class="progress-label">ROOM ${esc(mpSession.code)} · SOAL <b>${mpState.index + 1}</b> / ${mpState.total}</span><div id="mp-timer" class="timer">0</div></div><div class="progress"><div style="width:${progress}%"></div></div><section class="panel"><span class="category-tag">${esc(q.cat)}${q.trap ? ' · ⚠ Jebakan' : ''}</span><h2 class="question">${esc(q.q)}</h2><div class="answers">${q.a.map((option, i) => `<button class="answer ${reveal && i === q.c ? 'correct' : ''} ${reveal && answered && i === mpState.me.choice && i !== q.c ? 'wrong' : ''}" data-action="mp-answer" data-choice="${i}" ${answered || reveal ? 'disabled' : ''}><span class="letter">${'ABCD'[i]}</span><span>${esc(option)}</span></button>`).join('')}</div>${reveal ? `<div class="feedback show good"><strong>Jawaban: ${'ABCD'[q.c]}.</strong> ${esc(q.e)}</div>` : answered ? '<div class="feedback show good">Jawaban terkirim. Menunggu pemain lain…</div>' : ''}<div class="quiz-bottom"><span>${reveal ? 'Soal berikutnya segera dimulai' : 'Jawab sebelum waktu habis'}</span><span class="score-chip">⭐ ${mpState.me.score.toLocaleString('id-ID')} poin</span></div></section><section class="panel mp-players-panel"><h3>Papan skor</h3>${mpPlayers()}</section></div>`;
  mpUpdateClock();
};

window.mpRenderResults = function () {
  if (!mpState) return;
  const ranked = [...mpState.players].sort((a, b) => b.score - a.score);
  const rank = ranked.findIndex(p => p.id === mpState.me?.id) + 1;
  app.innerHTML = `<div class="page-wrap"><div class="result-head"><div class="result-emoji">${rank === 1 ? '🏆' : '🎮'}</div><span class="eyebrow">Pertandingan selesai</span><h1 class="page-title">${rank === 1 ? 'Kamu juaranya!' : `Peringkat ${rank}`}</h1><p>Semua pemain sudah menyelesaikan ${mpState.total} soal.</p><div class="result-score">${mpState.me.score.toLocaleString('id-ID')} <small>POIN</small></div></div><section class="panel"><h3>Papan skor akhir</h3>${mpPlayers()}<button class="btn btn-primary full" data-action="mp-leave" style="margin-top:20px">Kembali ke menu</button></section></div>`;
  if (rank === 1) confettiBurst();
};

async function mpRequest(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Permintaan gagal (${response.status})`);
  return data;
}

window.mpAction = async function (action, button) {
  if (action === 'mp-leave') { mpLeave(); home(); return; }
  if (action === 'mp-copy') {
    const link = `${location.origin}/?room=${mpSession.code}`;
    navigator.clipboard?.writeText(link).then(() => toast('Tautan undangan disalin!')).catch(() => toast(`Kode room: ${mpSession.code}`));
    return;
  }
  if (action === 'mp-start') { mpSocket?.send(JSON.stringify({ type: 'start' })); return; }
  if (action === 'mp-answer') {
    if (mpState?.phase !== 'question' || mpState.me?.answered) return;
    button.closest('.answers').querySelectorAll('button').forEach(item => item.disabled = true);
    mpSocket?.send(JSON.stringify({ type: 'answer', choice: Number(button.dataset.choice) }));
    return;
  }
  button.disabled = true;
  try {
    let result;
    if (action === 'mp-create') {
      const name = document.querySelector('#host-name').value.trim() || 'Pemain';
      localStorage.setItem('adu-name', name);
      let pool = [...seedQuestions];
      try {
        const response = await fetch('/api/questions', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          pool.push(...(data.questions || []).filter(q => q?.q && Array.isArray(q.a) && q.a.length === 4 && Number.isInteger(q.c)));
        }
      } catch {}
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      result = await mpRequest('/api/room', { name, questions: pool.slice(0, 10) });
    } else if (action === 'mp-join') {
      const name = document.querySelector('#guest-name').value.trim() || 'Pemain';
      const code = document.querySelector('#room-code-input').value.trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('Kode room harus 6 karakter.');
      localStorage.setItem('adu-name', name);
      result = await mpRequest(`/api/room/${code}`, { name });
      result.code = code;
    }
    mpSession = result;
    sessionStorage.setItem('adu-mp-session', JSON.stringify(result));
    history.replaceState(null, '', `/?room=${result.code}`);
    mpConnect();
    setScreen('lobby');
  } catch (error) { toast(error.message); button.disabled = false; }
};

app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;
  if (action?.startsWith('mp-')) { event.stopImmediatePropagation(); window.mpAction(action, button); }
  else if (action === 'home' && mpSession) mpLeave();
}, true);

const saved = sessionStorage.getItem('adu-mp-session');
if (saved) {
  try { mpSession = JSON.parse(saved); if (mpSession?.code && mpSession?.token) { mpConnect(); setScreen('lobby'); } } catch { sessionStorage.removeItem('adu-mp-session'); }
} else {
  const invited = new URLSearchParams(location.search).get('room');
  if (invited && /^[A-HJ-NP-Z2-9]{6}$/i.test(invited)) { setScreen('room'); document.querySelector('#room-code-input').value = invited.toUpperCase(); }
}
