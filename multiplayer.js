let mpSession = null;
let mpSocket = null;
let mpState = null;
let mpClock = null;
let mpReconnect = null;
let mpChatDraft = '';
let mpLastChatAt = 0;
let mpSelectedResultId = null;
const mpFlyingLayer = document.createElement('div');
mpFlyingLayer.className = 'mp-flying-layer';
mpFlyingLayer.setAttribute('aria-hidden', 'true');
document.body.append(mpFlyingLayer);

function mpFly(entry) {
  if (screen !== 'mpQuiz' || localStorage.getItem('adu-motion') === 'false') return;
  const bubble = document.createElement('div');
  const vertical = Math.random() < 0.28;
  bubble.className = `mp-flying-comment ${vertical ? 'mp-fly-vertical' : 'mp-fly-horizontal'}`;
  bubble.style.setProperty('--lane', `${8 + Math.random() * 68}%`);
  bubble.style.setProperty('--duration', `${5 + Math.random() * 3}s`);
  bubble.style.setProperty('--hue', `${Math.floor(Math.random() * 80 + 225)}`);
  const name = document.createElement('strong');
  name.textContent = entry.name;
  const text = document.createElement('span');
  text.textContent = entry.text;
  bubble.append(name, text);
  mpFlyingLayer.append(bubble);
  bubble.addEventListener('animationend', () => bubble.remove(), { once: true });
}

function mpChatHtml() {
  const history = (mpState?.chat || []).slice(-12);
  const canSend = Boolean(mpState?.me?.answered && !mpState.me.muted && (mpState.phase === 'question' || mpState.phase === 'reveal'));
  return `<section class="panel mp-chat-panel"><div class="mp-chat-heading"><div><span class="eyebrow">LIVE CHAT</span><h3>Komentar pemain</h3></div><span class="mp-live-dot">● LANGSUNG</span></div><div class="mp-chat-list" id="mp-chat-list" role="log" aria-live="polite">${history.length ? history.map(entry => `<div class="mp-chat-line" data-chat-id="${esc(entry.id)}"><strong>${esc(entry.name)}</strong><span>${esc(entry.text)}</span></div>`).join('') : '<p class="mp-chat-empty">Belum ada komentar. Jawab soal dulu, lalu mulai obrolan!</p>'}</div><div class="mp-chat-composer"><input id="mp-chat-input" class="input" type="text" maxlength="120" placeholder="${canSend ? 'Ketik komentar singkat…' : mpState?.me?.muted ? 'Chat kamu dibisukan host' : 'Jawab soal dulu untuk mengirim chat'}" value="${esc(mpChatDraft)}" ${canSend ? '' : 'disabled'} autocomplete="off"/><button class="btn btn-primary btn-small" id="mp-chat-send" data-action="mp-chat" disabled>Kirim</button></div><div class="mp-chat-meta"><span>${canSend ? 'Satu pesan setiap 2 detik' : 'Kamu tetap bisa membaca komentar pemain lain'}</span><span id="mp-chat-count">${Array.from(mpChatDraft).length}/120</span></div></section>`;
}

function mpUpdateComposer() {
  const input = document.querySelector('#mp-chat-input');
  const count = document.querySelector('#mp-chat-count');
  const send = document.querySelector('#mp-chat-send');
  if (!input || !count || !send) return;
  mpChatDraft = input.value;
  const size = Array.from(mpChatDraft).length;
  count.textContent = `${size}/120`;
  send.disabled = !mpState?.me?.answered || Boolean(mpState.me.muted) || !mpChatDraft.trim() || size > 120 || Date.now() - mpLastChatAt < 2000 || mpSocket?.readyState !== WebSocket.OPEN;
}

function mpAppendChat(entry) {
  if (!mpState) return;
  if (!mpState.chat) mpState.chat = [];
  if (mpState.chat.some(item => item.id === entry.id)) return;
  mpState.chat.push(entry);
  mpState.chat = mpState.chat.slice(-40);
  const list = document.querySelector('#mp-chat-list');
  if (list) {
    list.querySelector('.mp-chat-empty')?.remove();
    const line = document.createElement('div');
    line.className = 'mp-chat-line';
    line.dataset.chatId = entry.id;
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const text = document.createElement('span');
    text.textContent = entry.text;
    line.append(name, text);
    list.append(line);
    while (list.children.length > 12) list.firstElementChild.remove();
    list.scrollTop = list.scrollHeight;
  }
  mpFly(entry);
}

function mpSyncChat() {
  const list = document.querySelector('#mp-chat-list');
  if (!list) return;
  const history = (mpState?.chat || []).slice(-12);
  const shown = [...list.querySelectorAll('[data-chat-id]')].map(item => item.dataset.chatId);
  if (shown.length === history.length && shown.every((id, index) => id === history[index].id)) return;
  list.innerHTML = history.length ? history.map(entry => `<div class="mp-chat-line" data-chat-id="${esc(entry.id)}"><strong>${esc(entry.name)}</strong><span>${esc(entry.text)}</span></div>`).join('') : '<p class="mp-chat-empty">Belum ada komentar. Jawab soal dulu, lalu mulai obrolan!</p>';
  list.scrollTop = list.scrollHeight;
}

function mpLeave() {
  clearInterval(mpClock);
  clearTimeout(mpReconnect);
  mpFlyingLayer.replaceChildren();
  mpChatDraft = '';
  mpSelectedResultId = null;
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
    if (data.type === 'chat') { mpAppendChat(data.entry); return; }
    if (data.type !== 'state') return;
    const previous = mpState;
    mpChatDraft = document.querySelector('#mp-chat-input')?.value ?? mpChatDraft;
    mpState = data;
    const target = data.phase === 'lobby' ? 'lobby' : data.phase === 'finished' ? 'mpResults' : 'mpQuiz';
    if (screen !== target) setScreen(target);
    else if (target === 'mpQuiz') mpPatchQuiz(previous);
    else if (target === 'lobby') {
      const players = document.querySelector('.mp-scoreboard');
      if (players) players.outerHTML = mpPlayers();
      else window.mpRenderLobby();
    }
    mpUpdateClock();
    mpUpdateComposer();
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
  return `<div class="mp-scoreboard">${mpState.players.map((p, i) => `<div class="player-row"><span class="player-dot">${esc(p.name[0] || 'P')}</span><strong>${i + 1}. ${esc(p.name)}${p.id === mpState.me?.id ? ' (kamu)' : ''}</strong><small>${p.connected ? '● ' : '○ '}${p.score.toLocaleString('id-ID')} poin</small>${mpState.isHost && p.id !== mpState.me?.id && screen === 'mpQuiz' ? `<button class="mp-mute-btn" data-action="mp-mute" data-player-id="${esc(p.id)}">${p.muted ? 'Buka bisu' : 'Bisukan'}</button>` : ''}</div>`).join('')}</div>`;
}

function mpQuestionHtml() {
  const q = mpState.question;
  const reveal = mpState.phase === 'reveal';
  const answered = mpState.me?.answered;
  const progress = mpState.index / mpState.total * 100;
  return `<div class="quiz-top"><span class="progress-label">ROOM ${esc(mpSession.code)} · SOAL <b>${mpState.index + 1}</b> / ${mpState.total}</span><div id="mp-timer" class="timer">0</div></div><div class="progress"><div style="width:${progress}%"></div></div><section class="panel"><span class="category-tag">${esc(q.cat)}${q.trap ? ' · ⚠ Jebakan' : ''}</span><h2 class="question">${esc(q.q)}</h2><div class="answers">${q.a.map((option, i) => `<button class="answer ${reveal && i === q.c ? 'correct' : ''} ${reveal && answered && i === mpState.me.choice && i !== q.c ? 'wrong' : ''}" data-action="mp-answer" data-choice="${i}" ${answered || reveal ? 'disabled' : ''}><span class="letter">${'ABCD'[i]}</span><span>${esc(option)}</span></button>`).join('')}</div>${reveal ? `<div class="feedback show good"><strong>Jawaban: ${'ABCD'[q.c]}.</strong> ${esc(q.e)}</div>` : answered ? '<div class="feedback show good">Jawaban terkirim. Menunggu pemain lain…</div>' : ''}<div class="quiz-bottom"><span>${reveal ? 'Soal berikutnya segera dimulai' : 'Jawab sebelum waktu habis'}</span><span class="score-chip">⭐ ${mpState.me.score.toLocaleString('id-ID')} poin</span></div></section>`;
}

function mpPatchQuiz(previous) {
  const round = document.querySelector('#mp-round');
  if (!round) { window.mpRenderQuiz(); return; }
  if (!previous || previous.index !== mpState.index || previous.phase !== mpState.phase || previous.me?.answered !== mpState.me?.answered || previous.me?.score !== mpState.me?.score) round.innerHTML = mpQuestionHtml();
  const board = document.querySelector('#mp-scoreboard');
  if (board) board.innerHTML = mpPlayers();
  const input = document.querySelector('#mp-chat-input');
  if (input) {
    const canSend = Boolean(mpState.me?.answered && !mpState.me.muted && (mpState.phase === 'question' || mpState.phase === 'reveal'));
    input.disabled = !canSend;
    input.placeholder = canSend ? 'Ketik komentar singkat…' : mpState.me?.muted ? 'Chat kamu dibisukan host' : 'Jawab soal dulu untuk mengirim chat';
  }
  mpSyncChat();
  mpUpdateComposer();
}

window.mpRenderLobby = function () {
  const code = mpSession?.code || '';
  app.innerHTML = `<div class="page-wrap"><button class="back-link" data-action="mp-leave">← Keluar dari room</button><span class="eyebrow">Ruang tunggu langsung</span><h1 class="page-title">Room ${esc(code)}</h1><p class="page-sub">Bagikan kode atau tautan ini ke teman. Pertandingan dimulai setelah minimal 2 pemain tersambung.</p><section class="panel"><label class="field-label">KODE ROOM</label><div class="room-code">${esc(code)}<button data-action="mp-copy">Salin undangan</button></div>${mpState ? mpPlayers() : '<p class="page-sub">Menghubungkan ke room…</p>'}<div class="notice">${mpState?.isHost ? 'Kamu host. Klik mulai setelah teman masuk.' : 'Menunggu host memulai pertandingan.'}</div>${mpState?.isHost ? '<button class="btn btn-primary full" data-action="mp-start">Mulai pertandingan →</button>' : ''}</section></div>`;
};

window.mpRenderQuiz = function () {
  if (!mpState?.question) return;
  app.innerHTML = `<div class="page-wrap"><button class="back-link" data-action="mp-leave">← Keluar dari room</button><div id="mp-round">${mpQuestionHtml()}</div>${mpChatHtml()}<section class="panel mp-players-panel"><h3>Papan skor</h3><div id="mp-scoreboard">${mpPlayers()}</div></section></div>`;
  mpSyncChat();
  mpUpdateClock();
  mpUpdateComposer();
};

function mpResultDetailHtml() {
  const selected = mpState.results?.find(item => item.id === mpSelectedResultId);
  if (!selected) return '<p class="page-sub">Ringkasan pemain belum tersedia.</p>';
  return `<div class="mp-result-summary"><h3>Hasil ${esc(selected.name)}${selected.id === mpState.me?.id ? ' (kamu)' : ''}</h3><div class="result-stats"><div class="stat"><strong>${selected.score.toLocaleString('id-ID')}</strong><span>Total poin</span></div><div class="stat"><strong>${selected.correct}/${mpState.total}</strong><span>Jawaban benar</span></div><div class="stat"><strong>${selected.averageSeconds} dtk</strong><span>Rata-rata menjawab</span></div></div><h3 class="mp-result-subtitle">Rincian soal</h3><div class="review-list">${selected.answers.map(item => {
    const missed = item.choice === null;
    const correct = item.choice === item.correctIndex;
    const answer = missed ? 'Tidak dijawab' : `${'ABCD'[item.choice]}. ${esc(item.options[item.choice] || '')}`;
    const key = `${'ABCD'[item.correctIndex]}. ${esc(item.options[item.correctIndex] || '')}`;
    return `<article class="mp-review-card"><div class="mp-review-head"><strong>${correct ? '✅' : missed ? '⏱️' : '❌'} Soal ${item.index + 1}</strong><span>${item.points.toLocaleString('id-ID')} poin</span></div><p>${esc(item.question)}</p><small>Jawaban ${esc(selected.name)}: ${answer}${item.elapsedSeconds !== null ? ` · ${item.elapsedSeconds} dtk` : ''}</small><small>Jawaban benar: ${key}</small><small>${esc(item.explanation || '')}</small></article>`;
  }).join('')}</div></div>`;
}

window.mpRenderResults = function () {
  if (!mpState) return;
  const ranked = [...mpState.players].sort((a, b) => b.score - a.score || b.correct - a.correct || (mpState.results?.find(x => x.id === a.id)?.averageSeconds ?? 60) - (mpState.results?.find(x => x.id === b.id)?.averageSeconds ?? 60));
  const rank = ranked.findIndex(p => p.id === mpState.me?.id) + 1;
  if (!mpSelectedResultId || !mpState.results?.some(item => item.id === mpSelectedResultId)) mpSelectedResultId = mpState.me?.id;
  app.innerHTML = `<div class="page-wrap"><div class="result-head"><div class="result-emoji">${rank === 1 ? '🏆' : '🎮'}</div><span class="eyebrow">Pertandingan selesai</span><h1 class="page-title">${rank === 1 ? 'Kamu juaranya!' : `Peringkat ${rank}`}</h1><p>Ketuk nama pemain untuk melihat ringkasan jawaban mereka.</p><div class="result-score">${mpState.me.score.toLocaleString('id-ID')} <small>POIN</small></div></div><section class="panel"><h3 class="mp-result-subtitle">Peringkat akhir</h3><div class="mp-result-players">${ranked.map((p, index) => `<button class="mp-result-player ${p.id === mpSelectedResultId ? 'selected' : ''}" data-action="mp-inspect" data-player-id="${esc(p.id)}"><span class="player-dot">${esc(p.name[0] || 'P')}</span><strong>${index + 1}. ${esc(p.name)}${p.id === mpState.me?.id ? ' (kamu)' : ''}</strong><span>${p.score.toLocaleString('id-ID')} poin →</span></button>`).join('')}</div><div id="mp-result-detail">${mpResultDetailHtml()}</div><button class="btn btn-primary full" data-action="mp-leave" style="margin-top:20px">Kembali ke menu</button></section></div>`;
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
  if (action === 'mp-inspect') {
    mpSelectedResultId = button.dataset.playerId;
    document.querySelectorAll('.mp-result-player').forEach(item => item.classList.toggle('selected', item.dataset.playerId === mpSelectedResultId));
    const detail = document.querySelector('#mp-result-detail');
    if (detail) detail.innerHTML = mpResultDetailHtml();
    return;
  }
  if (action === 'mp-chat') {
    const text = document.querySelector('#mp-chat-input')?.value.trim() || '';
    if (!mpState?.me?.answered || mpState.me.muted || !text || Array.from(text).length > 120 || Date.now() - mpLastChatAt < 2000 || mpSocket?.readyState !== WebSocket.OPEN) return;
    mpSocket.send(JSON.stringify({ type: 'chat', text }));
    mpLastChatAt = Date.now();
    mpChatDraft = '';
    document.querySelector('#mp-chat-input').value = '';
    mpUpdateComposer();
    setTimeout(mpUpdateComposer, 2050);
    return;
  }
  if (action === 'mp-mute') {
    if (mpState?.isHost && mpSocket?.readyState === WebSocket.OPEN) mpSocket.send(JSON.stringify({ type: 'mute', playerId: button.dataset.playerId }));
    return;
  }
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

app.addEventListener('input', event => {
  if (event.target.id === 'mp-chat-input') mpUpdateComposer();
});

app.addEventListener('keydown', event => {
  if (event.target.id === 'mp-chat-input' && event.key === 'Enter') {
    event.preventDefault();
    const button = document.querySelector('#mp-chat-send');
    if (button && !button.disabled) window.mpAction('mp-chat', button);
  }
});

const saved = sessionStorage.getItem('adu-mp-session');
if (saved) {
  try { mpSession = JSON.parse(saved); if (mpSession?.code && mpSession?.token) { mpConnect(); setScreen('lobby'); } } catch { sessionStorage.removeItem('adu-mp-session'); }
} else {
  const invited = new URLSearchParams(location.search).get('room');
  if (invited && /^[A-HJ-NP-Z2-9]{6}$/i.test(invited)) { setScreen('room'); document.querySelector('#room-code-input').value = invited.toUpperCase(); }
}
