import { DurableObject } from "cloudflare:workers";

const reply = (data, status = 200) => Response.json(data, { status });
const cleanName = value => String(value || "Pemain").trim().slice(0, 18) || "Pemain";
const cleanQuestion = q => {
  if (!q || typeof q.q !== "string" || !Array.isArray(q.a) || q.a.length !== 4 || !Number.isInteger(q.c) || q.c < 0 || q.c > 3) return null;
  return { q: q.q.slice(0, 400), a: q.a.map(x => String(x).slice(0, 180)), c: q.c, e: String(q.e || "").slice(0, 500), cat: String(q.cat || "Umum").slice(0, 60), trap: Boolean(q.trap) };
};

export default { fetch() { return reply({ error: "Gunakan situs game Adu IQ." }, 404); } };

export class QuizRoom extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    const room = await this.ctx.storage.get("room");
    if (url.pathname === "/create" && request.method === "POST") {
      if (room && room.expiresAt > Date.now()) return reply({ error: "Kode room sudah dipakai. Coba lagi." }, 409);
      const input = await request.json().catch(() => ({}));
      const questions = (Array.isArray(input.questions) ? input.questions : []).map(cleanQuestion).filter(Boolean).slice(0, 10);
      if (questions.length < 3) return reply({ error: "Soal untuk room belum cukup." }, 400);
      const player = { id: crypto.randomUUID(), token: crypto.randomUUID(), name: cleanName(input.name), score: 0, correct: 0, review: [], joinedAt: Date.now() };
      const next = { hostId: player.id, players: [player], questions, phase: "lobby", index: 0, endsAt: 0, answers: {}, chat: [], expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
      await this.ctx.storage.put("room", next);
      return reply({ playerId: player.id, token: player.token });
    }
    if (!room || room.expiresAt <= Date.now()) return reply({ error: "Room tidak ditemukan atau sudah kedaluwarsa." }, 404);
    if (url.pathname === "/join" && request.method === "POST") {
      if (room.phase !== "lobby") return reply({ error: "Pertandingan sudah dimulai." }, 409);
      if (room.players.length >= 8) return reply({ error: "Room sudah penuh (maksimal 8 pemain)." }, 409);
      const input = await request.json().catch(() => ({}));
      const player = { id: crypto.randomUUID(), token: crypto.randomUUID(), name: cleanName(input.name), score: 0, correct: 0, review: [], joinedAt: Date.now() };
      room.players.push(player);
      await this.ctx.storage.put("room", room);
      await this.broadcast(room);
      return reply({ playerId: player.id, token: player.token });
    }
    if (url.pathname === "/ws" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const player = room.players.find(p => p.token === url.searchParams.get("token"));
      if (!player) return reply({ error: "Sesi pemain tidak valid." }, 401);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId: player.id });
      this.sendState(server, room, player.id);
      await this.broadcast(room);
      return new Response(null, { status: 101, webSocket: client });
    }
    return reply({ error: "Aksi room tidak dikenal." }, 404);
  }

  view(room, playerId) {
    const own = room.players.find(p => p.id === playerId);
    const question = room.questions[room.index];
    const reveal = room.phase === "reveal" || room.phase === "finished";
    return {
      type: "state", phase: room.phase, index: room.index, total: room.questions.length,
      endsAt: room.endsAt, now: Date.now(), isHost: room.hostId === playerId,
      me: own ? { id: own.id, score: own.score, correct: own.correct, answered: room.answers[playerId] !== undefined, choice: room.answers[playerId]?.choice ?? null, muted: Boolean(own.muted) } : null,
      players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score, correct: p.correct, muted: Boolean(p.muted), connected: this.ctx.getWebSockets().some(ws => ws.deserializeAttachment()?.playerId === p.id) })),
      ...(room.phase === "finished" ? { results: room.players.map(p => ({
        id: p.id, name: p.name, score: p.score, correct: p.correct,
        averageSeconds: p.review?.length ? Math.round(p.review.reduce((sum, item) => sum + item.elapsedSeconds, 0) / p.review.length) : 0,
        answers: room.questions.map((q, index) => {
          const record = p.review?.find(item => item.index === index);
          return { index, question: q.q, options: q.a, correctIndex: q.c, explanation: q.e, choice: record?.choice ?? null, points: record?.points ?? 0, elapsedSeconds: record?.elapsedSeconds ?? null };
        }),
      })) } : {}),
      chat: (room.chat || []).slice(-20),
      question: room.phase === "lobby" || room.phase === "finished" ? null : { q: question.q, a: question.a, cat: question.cat, trap: question.trap, ...(reveal ? { c: question.c, e: question.e } : {}) },
    };
  }

  sendState(ws, room, playerId) {
    try { ws.send(JSON.stringify(this.view(room, playerId))); } catch {}
  }

  async broadcast(room) {
    for (const ws of this.ctx.getWebSockets()) this.sendState(ws, room, ws.deserializeAttachment()?.playerId);
  }

  broadcastEvent(event) {
    const payload = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(payload); } catch {}
    }
  }

  async webSocketMessage(ws, raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    const room = await this.ctx.storage.get("room");
    if (!room || room.expiresAt <= Date.now()) { ws.close(1000, "Room berakhir"); return; }
    const playerId = ws.deserializeAttachment()?.playerId;
    const sender = room.players.find(p => p.id === playerId);
    if (!sender) return;
    if (message.type === "chat") {
      if (room.phase !== "question" && room.phase !== "reveal") return;
      if (room.answers[playerId] === undefined) { ws.send(JSON.stringify({ type: "error", message: "Jawab soal dulu sebelum mengirim chat." })); return; }
      if (sender.muted) { ws.send(JSON.stringify({ type: "error", message: "Chat kamu sedang dibisukan oleh host." })); return; }
      const text = String(message.text || "").replace(/[\u0000-\u001F\u007F<>]/g, "").trim();
      if (!text || Array.from(text).length > 120) { ws.send(JSON.stringify({ type: "error", message: "Pesan harus berisi 1–120 karakter." })); return; }
      const now = Date.now();
      if (now - (sender.lastChatAt || 0) < 2000) { ws.send(JSON.stringify({ type: "error", message: "Tunggu 2 detik sebelum mengirim lagi." })); return; }
      if (text.toLocaleLowerCase() === sender.lastChatText && now - (sender.lastChatTextAt || 0) < 30000) { ws.send(JSON.stringify({ type: "error", message: "Pesan yang sama baru saja dikirim." })); return; }
      sender.lastChatAt = now;
      sender.lastChatTextAt = now;
      sender.lastChatText = text.toLocaleLowerCase();
      const entry = { id: crypto.randomUUID(), playerId, name: sender.name, text, at: now };
      room.chat = [...(room.chat || []).slice(-39), entry];
      await this.ctx.storage.put("room", room);
      this.broadcastEvent({ type: "chat", entry });
      return;
    }
    if (message.type === "mute" && playerId === room.hostId) {
      const target = room.players.find(p => p.id === message.playerId && p.id !== room.hostId);
      if (!target) return;
      target.muted = !target.muted;
      await this.ctx.storage.put("room", room);
      await this.broadcast(room);
      return;
    }
    if (message.type === "start" && playerId === room.hostId && room.phase === "lobby") {
      const connected = new Set(this.ctx.getWebSockets().map(s => s.deserializeAttachment()?.playerId));
      if (connected.size < 2) { ws.send(JSON.stringify({ type: "error", message: "Tunggu minimal 2 pemain tersambung." })); return; }
      room.phase = "question";
      room.index = 0;
      room.answers = {};
      room.endsAt = Date.now() + 60000;
      await this.ctx.storage.put("room", room);
      await this.ctx.storage.setAlarm(room.endsAt);
      await this.broadcast(room);
      return;
    }
    if (message.type === "answer" && room.phase === "question" && room.answers[playerId] === undefined) {
      if (!Number.isInteger(message.choice) || message.choice < 0 || message.choice > 3 || Date.now() > room.endsAt) return;
      const player = room.players.find(p => p.id === playerId);
      const correct = message.choice === room.questions[room.index].c;
      const remaining = Math.max(0, room.endsAt - Date.now());
      const points = correct ? Math.round(500 + 500 * remaining / 60000) : 0;
      player.score += points;
      if (correct) player.correct++;
      player.review ||= [];
      player.review.push({ index: room.index, choice: message.choice, points, elapsedSeconds: Math.round((60000 - remaining) / 1000) });
      room.answers[playerId] = { choice: message.choice, points };
      const connected = new Set(this.ctx.getWebSockets().map(s => s.deserializeAttachment()?.playerId));
      if ([...connected].every(id => room.answers[id] !== undefined)) {
        room.phase = "reveal";
        room.endsAt = Date.now() + 5000;
        await this.ctx.storage.setAlarm(room.endsAt);
      }
      await this.ctx.storage.put("room", room);
      await this.broadcast(room);
    }
  }

  async alarm() {
    const room = await this.ctx.storage.get("room");
    if (!room) return;
    if (room.expiresAt <= Date.now()) { await this.ctx.storage.delete("room"); return; }
    if (room.phase === "question") {
      room.phase = "reveal";
      room.endsAt = Date.now() + 5000;
      await this.ctx.storage.setAlarm(room.endsAt);
    } else if (room.phase === "reveal") {
      if (room.index + 1 >= room.questions.length) { room.phase = "finished"; room.endsAt = 0; }
      else { room.index++; room.phase = "question"; room.answers = {}; room.endsAt = Date.now() + 60000; await this.ctx.storage.setAlarm(room.endsAt); }
    } else return;
    await this.ctx.storage.put("room", room);
    await this.broadcast(room);
  }

  async webSocketClose(ws) {
    const room = await this.ctx.storage.get("room");
    if (room) await this.broadcast(room);
  }
}
