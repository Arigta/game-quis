export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

export function requireAdmin(request, env) {
  if (!env.AI_ADMIN_TOKEN) return { error: json({ error: "Backend belum dikonfigurasi: set secret AI_ADMIN_TOKEN." }, 503) };
  const supplied = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.AI_ADMIN_TOKEN}`;
  let mismatch = supplied.length ^ expected.length;
  for (let i = 0; i < Math.max(supplied.length, expected.length); i++) mismatch |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  return mismatch === 0 ? { ok: true } : { error: json({ error: "Token admin tidak cocok." }, 401) };
}

export function normalizeQuestion(text = "") {
  return text.toLocaleLowerCase("id-ID").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export const seedQuestionText = [
  "Sebuah kolam ditumbuhi teratai. Luas teratai menjadi dua kali lipat setiap hari. Jika kolam penuh pada hari ke-20, kapan kolam terisi setengahnya?",
  "Ibu membeli 3 bungkus pensil. Setiap bungkus berisi 6 pensil. Berapa jumlah pensil seluruhnya?",
  "Semua kucing adalah mamalia. Miko adalah kucing. Kesimpulan yang tepat adalah…",
  "Sebuah jam menunjukkan pukul 14.20. Berapa menit lagi menuju pukul 15.00?",
  "Rina lebih tinggi daripada Budi. Budi lebih tinggi daripada Sari. Siapa yang paling pendek?",
  "Sebuah bus membawa 12 penumpang. Di halte pertama, 3 orang turun dan 5 orang naik. Berapa penumpang sekarang?",
  "Angka berikutnya dari pola 2, 4, 8, 16, … adalah…",
  "Ada 5 lilin menyala. Dua lilin dipadamkan. Jika sisanya habis terbakar, berapa lilin yang tersisa?",
  "Jika hari ini hari Selasa, hari apakah 10 hari lagi?",
  "Dalam lomba lari, kamu menyalip orang yang berada di posisi kedua. Sekarang kamu berada di posisi…",
];

export function validateQuestion(value) {
  if (!value || typeof value !== "object") return null;
  const cleanText = text => String(text || "").replace(/[<>]/g, "").trim();
  const q = cleanText(value.q);
  const a = Array.isArray(value.a) ? value.a.map(cleanText) : [];
  const c = Number(value.c);
  const e = cleanText(value.e);
  const cat = cleanText(value.cat).slice(0, 40);
  if (q.length < 15 || q.length > 320 || a.length !== 4 || a.some(x => !x || x.length > 120)) return null;
  if (new Set(a.map(x => x.toLocaleLowerCase("id-ID"))).size !== 4 || !Number.isInteger(c) || c < 0 || c > 3 || e.length < 8 || e.length > 500) return null;
  return { q, a, c, e, cat: cat || "Pengetahuan umum", trap: Boolean(value.trap) };
}
