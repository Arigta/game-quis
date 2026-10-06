import { json, normalizeQuestion, requireAdmin, seedQuestionText, validateQuestion } from "../../_shared.js";

const schema = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          q: { type: "STRING" },
          a: { type: "ARRAY", items: { type: "STRING" } },
          c: { type: "INTEGER" },
          e: { type: "STRING" },
          cat: { type: "STRING" },
          trap: { type: "BOOLEAN" },
        },
        required: ["q", "a", "c", "e", "cat", "trap"],
      },
    },
  },
  required: ["questions"],
};

export async function onRequestPost({ request, env }) {
  const auth = requireAdmin(request, env);
  if (auth.error) return auth.error;
  if (!env.GEMINI_API_KEY) return json({ error: "Set secret GEMINI_API_KEY di backend sebelum membuat soal." }, 503);
  if (!env.QUESTION_CACHE) return json({ error: "Cache belum terhubung. Buat dan hubungkan KV namespace QUESTION_CACHE." }, 503);
  if ((env.AI_PROVIDER || "gemini").toLowerCase() !== "gemini") return json({ error: "AI_PROVIDER yang tersedia saat ini adalah gemini." }, 400);

  let input;
  try { input = await request.json(); } catch { return json({ error: "Isi permintaan harus berupa JSON." }, 400); }
  const count = Math.min(10, Math.max(1, Number.parseInt(input.count, 10) || 5));
  const category = String(input.category || "Pengetahuan umum").trim().slice(0, 60);
  const difficulty = ["mudah", "sedang", "sulit"].includes(String(input.difficulty).toLowerCase()) ? String(input.difficulty).toLowerCase() : "sedang";
  const model = String(env.GEMINI_MODEL || "gemini-2.5-flash").trim();

  let existing = [];
  try {
    const listing = await env.QUESTION_CACHE.list({ prefix: "question:", limit: 1000 });
    existing = await Promise.all(listing.keys.map(key => env.QUESTION_CACHE.get(key.name, "json")));
  } catch { return json({ error: "Cache soal gagal dibaca. Periksa binding QUESTION_CACHE." }, 503); }

  const used = new Set(seedQuestionText.map(normalizeQuestion));
  for (const item of existing) if (item?.question) used.add(normalizeQuestion(item.question));
  const avoid = [...seedQuestionText, ...existing.map(x => x?.question).filter(Boolean)].slice(0, 80);
  const prompt = `Buat tepat ${count} soal kuis pilihan ganda berbahasa Indonesia untuk pelajar SMP kelas 2. Kategori: ${category}. Kesulitan: ${difficulty}. Setiap soal harus memiliki tepat empat pilihan yang berbeda dan hanya satu jawaban benar. Penjelasan ringkas, akurat, dan adil. Soal jebakan hanya menguji ketelitian atau logika, tidak boleh ambigu. Jangan mengulang atau memparafrasekan soal contoh yang harus dihindari berikut: ${JSON.stringify(avoid)}. Kembalikan hanya objek JSON sesuai skema.`;

  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.7 },
      }),
    });
  } catch { return json({ error: "Tidak dapat menghubungi Gemini. Coba lagi nanti." }, 502); }
  if (!response.ok) {
    const status = response.status;
    return json({ error: status === 429 ? "Kuota atau batas laju Gemini sedang tercapai." : status === 400 ? "Model atau format permintaan Gemini ditolak. Periksa GEMINI_MODEL." : `Gemini mengembalikan error (${status}).` }, status === 429 ? 429 : 502);
  }

  let generated;
  try {
    const payload = await response.json();
    const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
    generated = JSON.parse(raw || "{}").questions;
  } catch { return json({ error: "Jawaban Gemini tidak terbaca sebagai JSON soal." }, 502); }
  if (!Array.isArray(generated)) return json({ error: "Gemini tidak mengembalikan daftar soal." }, 502);

  const drafts = [];
  for (const raw of generated.slice(0, count)) {
    const clean = validateQuestion(raw);
    if (!clean) continue;
    const normalized = normalizeQuestion(clean.q);
    if (used.has(normalized)) continue;
    used.add(normalized);
    const record = {
      id: crypto.randomUUID(), question: clean.q, options: clean.a, answerIndex: clean.c,
      explanation: clean.e, category: category || clean.cat, difficulty,
      isTrap: clean.trap, source: "ai", status: "draft", model,
      createdAt: new Date().toISOString(),
    };
    await env.QUESTION_CACHE.put(`question:${record.id}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 });
    drafts.push(record);
  }
  return json({ drafts, model, requested: count, skipped: generated.length - drafts.length });
}
