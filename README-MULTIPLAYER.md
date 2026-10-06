# Multiplayer Adu IQ

Mode room memakai **Cloudflare Durable Object** agar 2–8 pemain di perangkat berbeda mendapat soal, timer, dan papan skor yang sama melalui WebSocket. Host membuat room dan membagikan tautan; host memulai setelah minimal dua pemain tersambung. Setiap soal berlangsung 60 detik, skor benar 500–1000 poin berdasarkan kecepatan, lalu jawaban ditampilkan selama 5 detik. Room kedaluwarsa setelah 2 jam.

Selama kuis, panel live chat selalu terlihat. Pemain dapat mengirim pesan setelah menjawab soal pada ronde berjalan; pemain yang belum menjawab hanya dapat membaca. Pesan maksimal 120 karakter, satu pesan setiap 2 detik, dan pengulangan pesan yang sama dalam 30 detik ditolak. Komentar baru melintas pada jalur dan arah acak seperti komentar siaran langsung. Host dapat membisukan pemain dari papan skor. Animasi mengikuti pilihan pengaturan animasi pemain.

## Deploy server room

Cloudflare Pages tidak bisa membuat kelas Durable Object di proyek Pages itu sendiri. Worker pendamping harus di-deploy satu kali pada akun Cloudflare yang sama:

```bash
cd room-worker
npx wrangler login
npx wrangler deploy
```

`room-worker/wrangler.toml` memakai `new_sqlite_classes`, yang tersedia pada paket Workers Free. Setelah Worker `adu-iq-rooms` berhasil dibuat, push perubahan proyek Pages ini ke GitHub. `wrangler.toml` di root sudah mengikat `ROOMS` ke kelas `QuizRoom` dalam Worker `adu-iq-rooms`. Periksa **Workers & Pages → game-quis → Settings → Bindings** untuk memastikan `ROOMS` muncul, lalu tunggu deployment Production terbaru sukses.

Saat membuka file `index.html` langsung lewat `file://`, multiplayer tidak aktif. Gunakan situs Cloudflare Pages. Secret Gemini tetap hanya di Pages; Worker room tidak memerlukan API key.

## Batasan

- Kode room privat adalah undangan, bukan autentikasi akun. Siapa pun yang memiliki kode dapat masuk selama lobby terbuka.
- Host mengirim kumpulan soal saat membuat room. Server menyimpan jawaban dan hanya mengirim kunci jawaban sesudah waktu menjawab berakhir; klien yang dimodifikasi masih bisa mengirim soal buatan sendiri saat membuat room.
- Room yang sudah dimulai tidak menerima pemain baru. Pemain yang terputus dapat kembali melalui tab yang sama selama sessionStorage masih ada.
- Kuota Workers Free berlaku. Lihat penggunaan di dashboard Cloudflare.
