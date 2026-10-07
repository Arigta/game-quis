import { json, requireAdmin, validateQuestion } from "../../_shared.js";

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (auth.error) return auth.error;
  if (!env.QUESTION_CACHE) return json({ error: "Bank soal belum terhubung." }, 503);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Isi permintaan harus berupa JSON." }, 400); }
  const clean = validateQuestion(input);
  if (!clean) return json({ error: "Soal tidak valid. Isi pertanyaan (15–320 karakter), empat opsi berbeda, jawaban benar, dan penjelasan (8–500 karakter)." }, 400);
  const record = { id: crypto.randomUUID(), question: clean.q, options: clean.a, answerIndex: clean.c, explanation: clean.e, category: clean.cat, difficulty: ["mudah", "sedang", "sulit"].includes(input.difficulty) ? input.difficulty : "sedang", isTrap: clean.trap, source: "manual", status: "active", createdAt: new Date().toISOString() };
  await env.QUESTION_CACHE.put(`question:${record.id}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 });
  return json({ question: record }, 201);
}

export async function onRequestGet({ request, env }) {
  const auth = requireAdmin(request, env);
  if (auth.error) return auth.error;
  if (!env.QUESTION_CACHE) return json({ error: "Cache belum terhubung. Hubungkan KV namespace QUESTION_CACHE." }, 503);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const listing = await env.QUESTION_CACHE.list({ prefix: "question:", limit: 1000 });
  const records = await Promise.all(listing.keys.map(key => env.QUESTION_CACHE.get(key.name, "json")));
  return json({ questions: records.filter(item => item && (!status || item.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}

export async function onRequestPatch({ request, env }) {
  const auth = requireAdmin(request, env);
  if (auth.error) return auth.error;
  if (!env.QUESTION_CACHE) return json({ error: "Cache belum terhubung." }, 503);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Isi permintaan harus berupa JSON." }, 400); }
  const id = String(input.id || "").trim();
  const status = String(input.status || "");
  if (!id || !["draft", "active", "rejected"].includes(status)) return json({ error: "ID atau status tidak valid." }, 400);
  const key = `question:${id}`;
  const record = await env.QUESTION_CACHE.get(key, "json");
  if (!record) return json({ error: "Soal tidak ditemukan atau cache sudah kedaluwarsa." }, 404);
  record.status = status;
  record.reviewedAt = new Date().toISOString();
  await env.QUESTION_CACHE.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 });
  return json({ question: record });
}
