import { json } from "../../../_shared.js";

export async function onRequestGet({ request, env, params }) {
  if (!env.ROOMS) return json({ error: "Server multiplayer belum dihubungkan." }, 503);
  const code = String(params.code || "").toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return json({ error: "Kode room tidak valid." }, 400);
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "Koneksi WebSocket diperlukan." }, 426);
  const token = new URL(request.url).searchParams.get("token") || "";
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
  return stub.fetch(`https://room/ws?token=${encodeURIComponent(token)}`, { headers: { Upgrade: "websocket" } });
}
