# AI bank soal (Gemini + Cloudflare Pages Functions)

AI membuat soal **draft** saja. Admin meninjau tiap soal sebelum mengaktifkannya. Soal aktif baru masuk ke sesi solo berikutnya; kuis tetap memakai bank seed jika backend atau AI tidak tersedia.

## Konfigurasi sekali saja

1. Buat KV namespace di Cloudflare bernama misalnya `adu-iq-questions`, lalu tambahkan binding bernama `QUESTION_CACHE` pada Pages project: **Settings → Bindings → Add → KV namespace**. Redeploy sesudah binding ditambahkan.
2. Tambahkan **encrypted secrets** di **Settings → Variables and Secrets**: `GEMINI_API_KEY` dan `AI_ADMIN_TOKEN`. Buat token admin acak yang panjang dan simpan sendiri.
3. Tambahkan variable biasa `GEMINI_MODEL` (default `gemini-2.5-flash`) dan `AI_PROVIDER=gemini`.
4. Deploy lewat Git integration atau Wrangler Pages. Dashboard Direct Upload drag-and-drop tidak membangun folder `functions`; gunakan Git integration untuk mengaktifkan endpoint API.
5. Buka `/admin.html`, masukkan `AI_ADMIN_TOKEN`, lalu buat draft. Token hanya disimpan di memori tab selama halaman terbuka.

## Lokal

Salin `.dev.vars.example` menjadi `.dev.vars`, isi key dan token lokal, lalu jangan commit `.dev.vars`. Setelah membuat binding lokal bernama `QUESTION_CACHE`, jalankan `npx wrangler pages dev . --kv=QUESTION_CACHE`.

## Endpoint

- `POST /api/admin/generate` — membuat 1–10 soal draft dengan Gemini.
- `GET /api/admin/questions?status=draft` — daftar draft (atau `active`/`rejected`).
- `PATCH /api/admin/questions` — ubah status dengan `{ "id": "…", "status": "active" }`.
- `GET /api/questions` — soal yang sudah aktif untuk mode solo.

API key hanya digunakan oleh Pages Function di server. Jangan taruh key Gemini di `app.js`, `admin.html`, atau Git.
