# Multiplayer Adu IQ

Mode room memakai **Cloudflare Durable Object** agar 2–8 pemain di perangkat berbeda mendapat soal, timer, dan papan skor yang sama melalui WebSocket. Host membuat room dan membagikan tautan; host memulai setelah minimal dua pemain tersambung. Host memilih 3–20 soal dari bank soal aktif, membuat soal dengan Gemini, atau menulis soal manual. Untuk AI dan manual khusus room, host wajib memasukkan `AI_ADMIN_TOKEN`. Materi dan kesulitan dapat diatur. Pembuatan room dengan AI menampilkan status menunggu saat soal dihasilkan; soal langsung dipakai tanpa tinjauan sebelum bermain dan tidak masuk ke bank soal. Setiap soal berlangsung 60 detik, skor benar 500–1000 poin berdasarkan kecepatan, lalu jawaban ditampilkan selama 5 detik. Room yang belum selesai kedaluwarsa setelah 2 jam; hasil akhir tersedia 15 menit setelah pertandingan lalu data room, termasuk soal khusus room, dihapus.

Selama kuis, panel live chat selalu terlihat. Pemain dapat mengirim pesan setelah menjawab soal pada ronde berjalan; pemain yang belum menjawab hanya dapat membaca. Pesan maksimal 120 karakter, satu pesan setiap 2 detik, dan pengulangan pesan yang sama dalam 30 detik ditolak. Komentar baru melintas pada jalur dan arah acak seperti komentar siaran langsung. Host dapat membisukan pemain dari papan skor. Animasi mengikuti pilihan pengaturan animasi pemain.

Di layar ponsel, panel chat menempel di bagian bawah selama kuis agar tetap terlihat ketika pemain menggulir soal dan jawaban.

Setelah pertandingan selesai, ketuk nama siapa pun pada peringkat akhir untuk melihat total poin, jawaban benar, rata-rata waktu menjawab, dan rincian jawaban per soal. Rincian baru dikirim server sesudah pertandingan berakhir, sehingga jawaban pemain lain tidak terlihat selama kuis berlangsung.

## Deploy server room

Cloudflare Pages tidak bisa membuat kelas Durable Object di proyek Pages itu sendiri. Worker pendamping harus di-deploy satu kali pada akun Cloudflare yang sama:

```bash
cd room-worker
npx wrangler login
npx wrangler deploy
```

`room-worker/wrangler.toml` memakai `new_sqlite_classes`, yang tersedia pada paket Workers Free. Setelah Worker `adu-iq-rooms` berhasil dibuat, push perubahan proyek Pages ini ke GitHub. `wrangler.toml` di root sudah mengikat `ROOMS` ke kelas `QuizRoom` dalam Worker `adu-iq-rooms`. Periksa **Workers & Pages → game-quis → Settings → Bindings** untuk memastikan `ROOMS` muncul, lalu tunggu deployment Production terbaru sukses.

Saat membuka file `index.html` langsung lewat `file://`, multiplayer tidak aktif. Gunakan situs Cloudflare Pages. Secret Gemini tetap hanya di Pages; Worker room tidak memerlukan API key. Untuk membuat soal manual yang tersimpan di bank, buka `admin.html`, masukkan token admin, lalu isi formulir **Tambah soal manual**. Soal manual di bank langsung aktif.

## Batasan

- Kode room privat adalah undangan, bukan autentikasi akun. Siapa pun yang memiliki kode dapat masuk selama lobby terbuka.
- Pages Function mengambil soal bank atau memvalidasi soal AI/manual dengan token admin sebelum membuat room. Server menyimpan jawaban dan hanya mengirim kunci jawaban sesudah waktu menjawab berakhir.
- Room yang sudah dimulai tidak menerima pemain baru. Pemain yang terputus dapat kembali melalui tab yang sama selama sessionStorage masih ada.
- Kuota Workers Free berlaku. Lihat penggunaan di dashboard Cloudflare.
