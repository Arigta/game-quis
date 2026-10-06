import { json } from "../../_shared.js";

export async function onRequestPost({ request, env, params }) {
  if (!env.ROOMS) return json({ error: "Server multiplayer belum dihubungkan." }, 503);
  const code = String(params.code || "").toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return json({ error: "Kode room harus 6 karakter." }, 400);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Permintaan tidak valid." }, 400); }
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
  return stub.fetch("https://room/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: input.name }) });
}
