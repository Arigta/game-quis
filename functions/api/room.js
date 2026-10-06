import { json } from "../_shared.js";

export async function onRequestPost({ request, env }) {
  if (!env.ROOMS) return json({ error: "Server multiplayer belum dihubungkan." }, 503);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Permintaan tidak valid." }, 400); }
  if (!Array.isArray(input.questions) || input.questions.length < 3) return json({ error: "Soal room belum cukup." }, 400);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32]).join("");
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const response = await stub.fetch("https://room/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: input.name, questions: input.questions }) });
    if (response.status === 409) continue;
    const data = await response.json();
    return json({ ...data, code }, response.status);
  }
  return json({ error: "Gagal membuat kode room. Coba lagi." }, 503);
}
