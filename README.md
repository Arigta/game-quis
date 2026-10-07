# Adu IQ — Kuis Bareng

Game kuis berbahasa Indonesia yang bisa dimainkan sendiri atau bersama teman di ponsel dan desktop. Mode multiplayer memakai room privat, soal dan timer serentak, live chat, serta peringkat akhir yang dapat dibuka untuk melihat rincian hasil setiap pemain.

**Main sekarang:** [game-quis.pages.dev](https://game-quis.pages.dev)  
**Panel admin soal:** [game-quis.pages.dev/admin.html](https://game-quis.pages.dev/admin.html)

## Fitur yang sudah tersedia

| Fitur | Keterangan |
| --- | --- |
| Mode solo | 10 soal per sesi, timer 60 detik per soal, skor dan penjelasan jawaban. Tetap berjalan dengan 10 soal bawaan jika API soal tidak tersedia. |
| Room multiplayer | Room privat untuk 2–8 pemain. Host membagikan kode atau tautan dan memulai permainan setelah minimal dua pemain tersambung. |
| Kuis serentak | Semua pemain mendapat urutan soal dan timer yang sama. Server room mengunci jawaban, menghitung skor, dan memindahkan ronde. |
| Live chat | Terlihat selama kuis. Pemain dapat mengirim pesan setelah menjawab soal pada ronde berjalan; sebelumnya hanya dapat membaca. Komentar baru melintas di layar seperti komentar siaran langsung. |
| Hasil multiplayer | Peringkat per pertandingan. Ketuk nama pemain untuk melihat skor, jumlah jawaban benar, rata-rata waktu menjawab, dan rincian tiap soal. |
| Bank soal AI | Gemini membuat draft soal melalui backend. Admin meninjau dan mengaktifkan soal sebelum soal itu dapat dipakai. |
| Tampilan game | Responsif, animasi transisi dan pilihan jawaban, efek suara opsional, serta pengaturan animasi. |

## Cara bermain

### Sendiri

1. Buka situs dan pilih **Bermain sendiri**.
2. Pilih satu dari empat jawaban sebelum timer habis.
3. Lihat penjelasan, lanjutkan sampai soal terakhir, lalu lihat skor akhir.

### Bersama teman

1. Satu pemain memilih **Bermain bersama → Buat room privat**.
2. Bagikan tautan undangan atau kode room enam karakter.
3. Teman membuka tautan atau memilih **Gabung room** dan memasukkan kode.
4. Setelah minimal dua pemain tersambung, host menekan **Mulai pertandingan**.
5. Jawab 10 soal. Satu soal memiliki waktu 60 detik. Ronde berikutnya dimulai ketika semua pemain yang tersambung telah menjawab atau waktu habis.
6. Setelah menjawab, pemain dapat mengirim chat sambil menunggu. Di akhir pertandingan, ketuk nama pada peringkat untuk melihat ringkasan pemain tersebut.

Jawaban benar mendapat **500 poin dasar + bonus kecepatan sampai 500 poin**. Jawaban salah atau kosong mendapat 0. Skor dan batas waktu dihitung oleh server room.

### Aturan chat

- Maksimal 120 karakter per pesan; penghitung karakter terlihat di layar.
- Jeda minimal 2 detik antar pesan. Pesan yang sama dalam waktu singkat ditolak.
- Pesan dari pemain lain bisa dibaca sebelum menjawab, tetapi tombol kirim baru aktif setelah menjawab.
- Host dapat membisukan pemain dari papan skor.
- Di ponsel, panel chat tetap terlihat di bagian bawah selama kuis. Animasi komentar mengikuti pengaturan animasi pemain.

## Teknologi dan susunan proyek

- `index.html`, `app.js`, `multiplayer.js`, `styles.css`, `ai.css`: antarmuka game.
- `admin.html`, `admin.js`, `admin.css`: panel admin bank soal.
- `functions/api/`: Cloudflare Pages Functions untuk soal AI dan penghubung room.
- `room-worker/src/index.js`: Worker dengan satu Durable Object per room untuk WebSocket, timer, jawaban, skor, dan chat.
- `wrangler.toml`: konfigurasi Pages, binding KV `QUESTION_CACHE`, dan binding room `ROOMS`.
- `room-worker/wrangler.toml`: konfigurasi Worker room.
- `.dev.vars.example`: contoh nama variabel untuk pengembangan lokal; tidak berisi kunci asli.

Alur singkat: **browser → Cloudflare Pages Functions → Durable Object room**. Bank soal aktif disimpan di Cloudflare KV. Gemini hanya dipanggil dari backend admin untuk membuat draft, bukan saat pemain menjawab.

## Menjalankan secara lokal

Siapkan Git dan Node.js yang menyediakan `npx`. Dari folder proyek:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Isi `.dev.vars` di laptop sendiri jika ingin memakai fitur admin AI secara lokal. Jangan unggah file itu ke GitHub. Untuk antarmuka dan Pages Functions, jalankan:

```powershell
npx wrangler pages dev .
```

Mode multiplayer lokal juga memerlukan Worker pendamping. Jalankan `npx wrangler dev` dari folder `room-worker` di terminal terpisah. Membuka `index.html` dengan alamat `file://` tidak mengaktifkan Pages Functions atau multiplayer.

## Deploy ke Cloudflare Pages

Proyek ini sudah memakai [Git integration Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/git-integration/) dengan branch `main`. Untuk memasang di akun Cloudflare lain:

1. Buat namespace **Workers KV** untuk soal, lalu ganti `id` pada binding `QUESTION_CACHE` di `wrangler.toml` dengan Namespace ID akun tersebut. **Nama binding harus tetap `QUESTION_CACHE`.** Namespace ID bukan API key.
2. Deploy Worker room dari folder `room-worker` pada akun Cloudflare yang sama:

   ```powershell
   cd room-worker
   npx wrangler login
   npx wrangler deploy
   cd ..
   ```

3. Di **Workers & Pages → Create application → Pages**, hubungkan repository GitHub. Gunakan branch `main`, framework preset **None**, build command kosong, dan build output directory `.` (root proyek).
4. Pastikan project Pages membaca `wrangler.toml`: binding `QUESTION_CACHE` menunjuk ke KV, sedangkan `ROOMS` menunjuk ke kelas `QuizRoom` dalam Worker `adu-iq-rooms`. Worker harus ada lebih dulu karena [Durable Object tidak dibuat di dalam proyek Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/#durable-objects).
5. Untuk fitur AI, buka **Settings → Variables and Secrets** dan simpan `GEMINI_API_KEY` serta `AI_ADMIN_TOKEN` sebagai **Secret/Encrypt**. Keduanya harus tersedia sebelum deployment yang akan memakainya. Lakukan deployment baru sesudah menambah secret.
6. Setiap `git push` ke `main` akan memicu deployment Pages baru. Periksa tab **Deployments** sampai versi terbaru menjadi Production.

Konfigurasi saat ini memakai `AI_PROVIDER=gemini` dan `GEMINI_MODEL=gemini-3.5-flash-lite` di `wrangler.toml`. Ganti model melalui file itu lalu push jika perlu. **Jangan pernah menaruh API key atau token admin di `wrangler.toml`, JavaScript browser, README, atau commit Git.** Lihat [panduan secret Pages](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

### Membuat soal dengan AI

1. Buka `/admin.html` pada situs yang sudah di-deploy.
2. Masukkan nilai `AI_ADMIN_TOKEN` yang disimpan di Cloudflare.
3. Pilih kategori, tingkat kesulitan, dan jumlah soal; lalu klik **Generate soal**.
4. Tinjau draft. Aktifkan hanya soal yang jawaban dan penjelasannya sudah benar.
5. Soal aktif akan masuk kumpulan soal untuk permainan berikutnya. Jika Gemini sedang gagal, game tetap bisa memakai soal bawaan.

Detail endpoint dan alur AI ada di [README-AI.md](README-AI.md); detail server room di [README-MULTIPLAYER.md](README-MULTIPLAYER.md).

## Keamanan dan batasan saat ini

- Token admin dan kunci Gemini disimpan sebagai secret backend. Jika pernah terlanjur terpublikasi, cabut dan buat kunci baru.
- Room memakai kode undangan privat, bukan akun. Siapa pun yang mengetahui kode dapat masuk selama lobby masih terbuka. Room kedaluwarsa setelah sekitar 2 jam.
- Pemain yang terputus dapat kembali lewat tab yang sama selama sesi browser masih tersimpan. Room yang sudah mulai tidak menerima pemain baru.
- Host memilih kumpulan soal dari browser saat membuat room. Skor dan timer dihitung server, tetapi klien yang dimodifikasi masih dapat mengirim soal buatan sendiri saat membuat room.
- Peringkat yang tersedia adalah **peringkat per pertandingan**, bukan leaderboard global. Status siap pemain, pemindahan host otomatis, dan fitur olokan preset dari PRD belum tersedia.
- Layanan Cloudflare dan Gemini memiliki kuota serta aturan biaya yang dapat berubah. Periksa [harga Pages](https://developers.cloudflare.com/pages/functions/pricing/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/), dan [Gemini API](https://ai.google.dev/gemini-api/docs/billing/) sebelum penggunaan besar.

## Memperbarui situs

Setelah mengubah kode, jalankan dari folder proyek:

```bash
git add .
git commit -m "Jelaskan perubahan"
git push
```

Perubahan pada `room-worker/src/index.js` juga perlu di-deploy dengan `npx wrangler deploy` dari folder `room-worker`; push GitHub saja tidak memperbarui Worker pendamping.
