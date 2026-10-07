import { json, requireAdmin, validateQuestion, normalizeQuestion } from "../../_shared.js";

const schema = { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "OBJECT", properties: { q: { type: "STRING" }, a: { type: "ARRAY", items: { type: "STRING" } }, c: { type: "INTEGER" }, e: { type: "STRING" }, cat: { type: "STRING" }, trap: { type: "BOOLEAN" } }, required: ["q", "a", "c", "e", "cat", "trap"] } } }, required: ["questions"] };

export async function roomQuestions(input, request, env) {
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 3 || count > 20) return { error: json({ error: "Jumlah soal harus 3–20." }, 400) };
  const source = String(input.source || "bank");
  if (source === "bank") {
    if (!env.QUESTION_CACHE) return { error: json({ error: "Bank soal belum terhubung." }, 503) };
    const listing = await env.QUESTION_CACHE.list({ prefix: "question:", limit: 1000 });
    const records = await Promise.all(listing.keys.map(key => env.QUESTION_CACHE.get(key.name, "json")));
    const category = String(input.category || "").trim().toLocaleLowerCase("id-ID");
    const difficulty = String(input.difficulty || "").trim().toLocaleLowerCase("id-ID");
    const pool = records.filter(q => q?.status === "active" && (!category || q.category?.toLocaleLowerCase("id-ID") === category) && (!difficulty || q.difficulty === difficulty)).map(q => validateQuestion({ q: q.question, a: q.options, c: q.answerIndex, e: q.explanation, cat: q.category, trap: q.isTrap })).filter(Boolean);
    if (pool.length < count) return { error: json({ error: `Bank soal aktif yang cocok hanya ${pool.length}. Kurangi jumlah atau ubah filter.` }, 400) };
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return { questions: pool.slice(0, count), source };
  }
  if (source !== "ai" && source !== "manual") return { error: json({ error: "Sumber soal tidak dikenal." }, 400) };
  const auth = requireAdmin(request, env);
  if (auth.error) return { error: auth.error };
  if (source === "manual") {
    if (!Array.isArray(input.questions) || input.questions.length !== count) return { error: json({ error: `Isi tepat ${count} soal manual.` }, 400) };
    const questions = input.questions.map(validateQuestion);
    if (questions.some(q => !q) || new Set(questions.map(q => normalizeQuestion(q.q))).size !== count) return { error: json({ error: "Ada soal manual yang tidak valid atau duplikat. Isi pertanyaan, empat opsi berbeda, jawaban benar, dan penjelasan." }, 400) };
    return { questions, source };
  }
  if (!env.GEMINI_API_KEY) return { error: json({ error: "Secret GEMINI_API_KEY belum diatur." }, 503) };
  const category = String(input.category || "Pengetahuan umum").replace(/[<>]/g, "").trim().slice(0, 60) || "Pengetahuan umum";
  const difficulty = ["mudah", "sedang", "sulit"].includes(input.difficulty) ? input.difficulty : "sedang";
  const model = String(env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: `Buat tepat ${count} soal kuis pilihan ganda berbahasa Indonesia. Materi: ${category}. Kesulitan: ${difficulty}. Setiap soal punya empat pilihan berbeda, satu jawaban benar, dan penjelasan akurat. Jangan gunakan soal ambigu. Kembalikan JSON sesuai skema.` }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.7 } }) }).catch(() => null);
  if (!response) return { error: json({ error: "Tidak dapat menghubungi Gemini." }, 502) };
  if (!response.ok) return { error: json({ error: response.status === 429 ? "Kuota Gemini tercapai." : `Gemini mengembalikan error (${response.status}).` }, response.status === 429 ? 429 : 502) };
  let raw;
  try { const data = await response.json(); raw = JSON.parse(data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "{}").questions; } catch { return { error: json({ error: "Jawaban Gemini tidak terbaca." }, 502) }; }
  const questions = Array.isArray(raw) ? raw.map(validateQuestion).filter(Boolean).slice(0, count) : [];
  if (questions.length !== count || new Set(questions.map(q => normalizeQuestion(q.q))).size !== count) return { error: json({ error: "Gemini belum menghasilkan jumlah soal valid yang diminta. Coba lagi." }, 502) };
  return { questions: questions.map(q => ({ ...q, cat: category })), source };
}
