# Desain: Dua Kartu Flazz per Jalur Pengiriman

**Tanggal:** 2026-09-26
**Status:** Disetujui untuk perencanaan

## 1. Latar Belakang & Masalah

Satu kendaraan pengiriman jarak jauh memerlukan **dua** kartu Flazz dalam satu trip: satu untuk pembelian BBM, satu untuk pembayaran tol. Alasan operasionalnya saldo satu kartu tidak cukup untuk rute jauh. Kadang dalam satu trip, kategori yang sama dipecah ke dua kartu — mis. tol dibayar dua kali di dua gerbang, kartu pertama kehabisan saldo di tengah jalan lalu sisanya memakai kartu kedua.

Saat ini sistem hanya mendukung **satu** kartu etoll per baris `Jalur_Pengiriman`:

- `Jalur_Pengiriman` hanya punya `flazz_card_id` + `flazz_card_name` (`DatabaseSetup.js:44`)
- Form Buat Jalur & Edit Jadwal hanya punya satu `<select>` etoll per baris (`JalurScript.html:214-217`, `JalurPages.html:187-193`)
- `saveJalur` hanya membuat satu entri handoff per baris jalur (`JalurOps.js:451-453`)
- Status jalur diturunkan secara biner dari satu kartu (`JalurOps.js:198`, `:379`, `:774`)
- `findJalurByCriteria` mencocokkan `flazz_card_id` dengan string equality persis (`JalurOps.js:137-140`)

Konsekuensinya, PIC tidak bisa mencatat 2 kartu untuk satu trip. Memecah menjadi 2 baris Jalur bukan solusi karena `Jalur_Pengiriman.laporan_id` hanya satu kolom, dan `getJalurDriversForDate` men-dedupe per `driver|vehicle` (`JalurOps.js:836`) sehingga form prefill menjadi ambigu.

## 2. Tujuan

1. Satu baris `Jalur_Pengiriman` dapat memegang **dua** kartu Flazz, dan keduanya berstatus `SEDANG_DIGUNAKAN` sejak jalur dibuat.
2. Satu laporan `Penggunaan_BBM` dapat mencatat pengeluaran yang dipecah ke **dua** kartu, dengan jumlah baris expenditures tak terbatas per kategori (BBM ×2, tol ×2).
3. Status jalur menjadi `SELESAI` **hanya setelah kedua kartu direkonsiliasi**.
4. Alur yang sudah berjalan dengan 1 kendaraan + 1 kartu **tidak berubah hasilanya** sama sekali.

## 3. Keputusan Desain

| # | Keputusan | Alasan |
|---|---|---|
| D1 | Grup-2 **tidak** punya kolom `metode_*_2`; metode diturunkan (kartu terisi → `FLAZZ`, nominal>0 tanpa kartu → `TUNAI`) | Satu sumber kebenaran; tidak ada kombinasi metode↔kartu yang bisa tidak konsisten. Konsisten dengan `resolveTollMethod` yang selalu menghasilkan metode eksplisit saat kartu ada |
| D2 | Grup-2 memakai `foto_struk_bbm` / `foto_struk_toll` milik grup-1 (tanpa kolom foto sendiri di v1) | Menambah 2 kolom foto + 2 input file tidak mengubah logika apa pun. Kekurangan: bila BBM terjadi di dua SPBU, hanya satu foto tersimpan. Upgrade-nya independen dan bisa menyusul |
| D3 | Penulisan status jalur dipusatkan ke satu fungsi `recomputeJalurStatus(jalurId)` | Saat ini ada tiga implementasi divergent (`JalurOps.js:198`, `:379`, `:774`). Memusatkan = satu sumber kebenaran, risiko site terlewat hilang |
| D4 | `usage_type='GANDUNGAN'` + isi `primary_card_id` / `backup_card_id` pada handoff pertama | Menghidupkan backfill schema yang selama ini mati (`DatabaseSetup.js:40`). Tidak mengubah ledger, yang tetap berbasis `card_id`. Terpisah sebagai Tahap 9 dan boleh dibatalkan |
| D5 | `isDuplicateTransaction` **tidak** diperbaiki | Sudah mati sejak awal: `headers.indexOf('km_awal')` dan `headers.indexOf('liter')` tidak cocok dengan header asli (`km_awal_confirmed`, `liter_bbm`), sehingga `sameKmAwal` selalu `false` dan deteksi duplikat tidak pernah menyala. Menghidupkannya berisiko memblokir laporan yang sah. Dilaporkan, tidak disentuh |

## 4. Model Data

### 4.1 `Jalur_Pengiriman` — +2 kolom

| Kolom | Tipe | Isi |
|---|---|---|
| `flazz_card_id_2` | string | id kartu etoll kedua, boleh kosong |
| `flazz_card_name_2` | string | nama kartu (denormalized, mirror `flazz_card_name`) |

### 4.2 `Penggunaan_BBM` — +4 kolom

| Kolom | Tipe | Isi |
|---|---|---|
| `flazz_card_id_2` | string | kartu untuk BBM grup-2, boleh kosong |
| `biaya_bbm_2` | number | nominal BBM grup-2 |
| `flazz_card_id_toll_2` | string | kartu untuk tol grup-2, boleh kosong |
| `biaya_toll_2` | number | nominal tol grup-2 |

### 4.3 Aturan Migration

Semua kolom baru di-**append di ujung kanan** header, sehingga:

- indeks hardcoded `row[19]` di `Code.js:186` dan `SpreadsheetOps.js:928` tetap menunjuk kolom yang benar
- `setupDatabase()` (`DatabaseSetup.js:75-90`) sudah idempoten dan hanya menambahkan kolom yang belum ada
- **Nol backfill**: baris lama tidak tersentuh, kolom baru kosong
- Setiap penulisan kolom baru wajib dibungkus `if (idx['flazz_card_id_2'] !== undefined)` agar aman bila sheet belum dimigrasi

## 5. `PaymentLogic.js` — Generalisasi ke N Grup

Modul ini murni tanpa API Apps Script dan sudah punya harness test (`scratch/test-payment-logic.js`). Semua pembacaan dan pencocokan kartu di seluruh sistem melewati fungsi-fungsi di sini.

### 5.1 Helper baru

```js
// Baca nilai pertama yang terdefinisi dari kunci panjang (nama kolom sheet)
// atau kunci pendek (state object milik SpreadsheetOps/FlazzOps).
pickField(row, longKey, shortKey)

// Bangun grup-2 dari kolom *_2. Metode diturunkan (D1).
// Return null bila keempat kolom kosong/0 -> baris lama tidak tersentuh.
group2FromRow(row)

// Daftar grup pembayaran yang ada pada satu baris.
// Grup-1 selalu ada (back-compat); grup-2 opsional.
cardGroups(row)  // -> [grup1] | [grup1, grup2]
```

Grup-1 di dalam `cardGroups` tetap memakai `resolveTollMethod` / `resolveTollCard` sehingga semantik kompatibilitas lama (metode tol kosong + kartu tol kosong → tol ikut kartu BBM) tidak berubah.

### 5.2 Fungsi yang di-rewrite untuk iterate `cardGroups`

| Fungsi | Lokasi | Perubahan |
|---|---|---|
| `flazzBbmShare` | `PaymentLogic.js:32` | jumlahkan `biaya_bbm` tiap grup yang kartunya cocok |
| `flazzTolShare` | `PaymentLogic.js:41` | jumlahkan `biaya_toll` tiap grup yang kartunya cocok |
| `isFlazzRowForCard` | `PaymentLogic.js:55` | true bila kartu cocok di grup mana pun |
| `flazzCardCharge` | `PaymentLogic.js:77` | menjadi alias `flazzShareForCard` (`:50`) |
| `distinctFlazzCards` | `PaymentLogic.js:64` | diganti `distinctFlazzCardsOf(state)` yang iterate `cardGroups` |

`cardFields` (`:19`) dipertahankan sebagai pembaca grup-1 saja dan dipakai `cardGroups`. `flazzEditDelta` (`:91`) bentuknya tidak berubah.

### 5.3 Call site yang di-update

| Lokasi | Perubahan |
|---|---|
| `SpreadsheetOps.js:302` | `distinctFlazzCardsOf(payloadState)` |
| `SpreadsheetOps.js:1092-1093` | `distinctFlazzCardsOf(oldPayState)` + `distinctFlazzCardsOf(newPayState)`; kedua state objek ditambah 4 field grup-2 |
| `FlazzOps.js:1786` | `distinctFlazzCardsOf(payState)`; state objek ditambah 4 field grup-2 |

## 6. Jalur: Dua Kartu & Status Agregat

### 6.1 `saveJalur` (`JalurOps.js:319-477`)

- `assertFlazzAccess` untuk kartu 2 (`:416`)
- **Validasi keberadaan kartu untuk kedua slot** — `saveJalur` saat ini tidak memvalidasi, sedangkan `updateJalur:507` melakukannya. Gap ini ditutup
- Tolak `flazz_card_id` == `flazz_card_id_2` bila keduanya terisi
- Tulis `flazz_card_id_2` / `flazz_card_name_2` dengan guard `idx[...] !== undefined` (`:434`)
- `cardHandoffs` push 2 entri (`:451-453`)
- Pesan warning handoff (`JalurOps.js:465`) tetap menunjuk nama kartu yang bentrok

### 6.2 `updateJalur` (`JalurOps.js:479-579`) — Symmetric Difference

Kartu lama dan baru masing-masing jadi array. Kartu yang dikembalikan hanya yang **tidak lagi muncul di slot mana pun**:

```
oldCards = [flazz_card_id,  flazz_card_id_2 ].filter(nonEmpty)
newCards = [etoll_card_id,  etoll_card_id_2 ].filter(nonEmpty)
returnFlazzUsage    untuk c in oldCards where c not in newCards
autoCreateFlazzUsage untuk c in newCards where c not in oldCards
```

Mencegah kartu dikembalikan padahal masih dipakai di slot 2 — kekaburan yang tidak mungkin terjadi pada logika `if (oldCard !== newCard)` sekarang. Bila slot 2 kosong, hasilnya identik dengan sekarang.

### 6.3 `deleteJalur` (`JalurOps.js:581-611`)

`returnFlazzUsage` dipanggil untuk setiap kartu non-kosong.

### 6.4 `findJalurByCriteria` (`JalurOps.js:106-159`)

- Match bila `criteria.flazz_card_id` cocok dengan **slot 1 atau slot 2**
- Pembandingan memakai `canonicalCardId()` (`PaymentLogic.js:11-13`) alih-alih `String()` mentah, agar konsisten dengan seluruh pencocokan kartu di sistem
- Tie-break: pilih baris dengan `tanggal` terbaru, lalu `rowIndex` terbesar

### 6.5 Status Jalur — Pemisahan Gate vs Penulis (penting)

Dua peran berbeda yang hari ini tercampur:

**A. Gate mobilitas** — "bolehkah kendaraan ini dipakai lagi?" (`checkIncompleteJalurForVehicle:198`, `saveJalur:379`, `updateJalur:532`)

```
expected = (ada kartu ter-assign) ? 'SELESAI' : 'SUDAH_LAPORAN'
blocked  = (status_actual !== expected)
```

Rumus ini **tidak berubah**. Karena `SELESAI` hanya boleh ditulis setelah semua kartu ter-rekon (lihat B), gate tetap menuntut penutupan penuh. Untuk jalur 1 kartu hasilnya identik dengan sekarang.

**B. Penulis status** — kapan `SELESAI` ditulis (`recomputeJalurStatus`, baru di `JalurOps.js`)

```
laporan_id kosong                                  → BELUM_DIISI
ada kartu ter-assign dan SEMUA kartu punya rekon
  dengan tanggal >= tanggal jalur                   → SELESAI
selainnya                                          → SUDAH_LAPORAN
```

Kartu yang diperiksa = semua slot non-kosong. Jalur tanpa kartu menghasilkan `SUDAH_LAPORAN`, sama seperti sekarang.

Fungsi ini menggantikan tiga implementasi yang sebelumnya berbeda:
- `saveFlazzRecon` (`FlazzOps.js:1094-1105`) — "rekon kartu ini → jalur SELESAI"
- hapus rekon (`FlazzOps.js:1311-1322`) — downgrade `SELESAI` → `SUDAH_LAPORAN`
- `backfillJalurStatus` (`JalurOps.js:719-792`)

Fungsi ini memakai definisi "sudah selesai" yang sama persis dengan `backfillJalurStatus:774`, sehingga tidak ada lagi definisi yang berbeda antar tempat.

### 6.6 Fungsi lain

- `findJalurRow:39` — tambahkan kolom baru ke daftar baca `want`
- `getJalurDriversForDate:794-855` — kembalikan 4 field: `flazz_card_id`, `flazz_card_name`, `flazz_card_id_2`, `flazz_card_name_2`

## 7. Flazz & Rekonsiliasi

| Lokasi | Perubahan |
|---|---|
| `computeFlazzLedger:766-795` | otomatis benar — `flazzBbmShare`/`flazzTolShare` sudah iterate `cardGroups` |
| `hasCompliantFlazzLaporan:803-879` | otomatis benar — `isFlazzRowForCard` sudah iterate `cardGroups` |
| `saveFlazzRecon:1094-1105` | ganti penulisan langsung dengan `recomputeJalurStatus(jalurMatch.id)`. **Mencegah rekon kartu A menandai jalur `SELESAI` padahal kartu B belum** |
| hapus rekon `:1311-1322` | `recomputeJalurStatus` juga (menaikkan kembali bila sudah lengkap) |
| `backfillFlazzCardName:142-163` | backfill **kedua** pasangan kolom |
| `getFlazzDashboardData:1578-1640` | bangun objek ber-kunci panjang, iterate `cardGroups`, push entri per grup. Wajib, jika tidak daftar pengeluaran per kartu kehilangan grup-2 |
| `deleteFlazzTransaction:1753,1786,1813` | `payState` ditambah 4 field grup-2 |

## 8. Dashboard & Ringkasan

Titik paling rawan: kelalaian di sini menghasilkan total bawah secara diam-diam.

| Lokasi | Perubahan |
|---|---|
| `SummaryOps.js:71-82` | `recomputeMonthlySummary` menjumlahkan `biaya_bbm + biaya_bbm_2` dan `biaya_toll + biaya_toll_2` |
| `SpreadsheetOps.js:297` | `adjustMonthlySummary` saat create — masukkan grup-2 |
| `SpreadsheetOps.js:343` | `adjustMonthlySummary` saat edit — masukkan grup-2 |
| `SpreadsheetOps.js:1337` | jalur edit lainnya — masukkan grup-2 |
| `FlazzOps.js:1806` | `adjustMonthlySummary` saat hapus transaksi — masukkan grup-2 |
| `Code.js:186` | `getRecentTransactions` expose 4 field baru via **lookup header** (bukan index tetap) |
| `SpreadsheetOps.js:350-379` | `isDuplicateTransaction` masukkan nominal grup-2 ke key pembanding. Tidak mengubah perilaku (key-nya sudah mati — D5) |

## 9. Backend Laporan

`SpreadsheetOps.js`:

- `:240-272` balance gate — 2 `addFlazzCheck` baru untuk grup-2. Karena `flazzChecks` sudah di-key per `cardId`, grup-1 + grup-2 yang jatuh ke kartu sama **otomatis ter-aggregate**, sehingga overdraft gabungan tetap tertangkap
- `:277-290` — append 4 nilai baru ke `row`, posisi mengikuti `headers.indexOf`
- `:299-328` — `distinctFlazzCardsOf` + 2 `recordFlazzExpense` untuk grup-2 (BBM-2, TOL-2), foto mengikuti D2
- `:986-1155` `editTransaction` — baca/tulis 4 kolom baru; guard saldo lewat `flazzEditDelta` otomatis ikut menangani grup-2

## 10. UI

### 10.1 Form Jalur

| Lokasi | Perubahan |
|---|---|
| `JalurScript.html:214-217` | template baris tambah `<select class="jalur-row-etoll2">` + 2 hidden input |
| `JalurScript.html:151-165` | `jalurPopulateEtollOptions` dipakai ulang untuk kedua select (tidak diubah) |
| `JalurScript.html:167-174` | `jalurSyncEtollRow` diubah menerima selector class, bukan `closest('.jalur-row')` hardcode, agar bisa dipakai untuk slot 1 maupun 2 |
| `JalurScript.html:203-224` | `jalurAddRow` inisialisasi select ke-2 (default kosong) |
| `JalurScript.html:433-442` | payload `jalurSave` + `etoll_card_id_2` / `etoll_card_name_2` |
| `JalurScript.html:518-553` | `jalurEdit` preset & `jalurSaveEdit` kirim kartu ke-2 |
| `JalurPages.html:187-193` | select ke-2 di modal Edit Jadwal |
| `JalurScript.html:328, 391` | render listing & summary menampilkan kedua nama kartu |

Auto-fill: slot 1 terisi kartu default driver (`jalurResolveDefaultCard:126-137`), slot 2 **tidak** terisi otomatis — dipilih manual bila memang dibutuhkan. Validasi: slot 2 harus berbeda dari slot 1.

### 10.2 Form Laporan

- `Index.html` + `js.html` — section "Pengeluaran kartu ke-2", **collapsed dan hidden by default**
- Isi: 2 input nominal (`biaya_bbm_2`, `biaya_toll_2`) + 2 select kartu (`flazz_card_id_2`, `flazz_card_id_toll_2`)
- Auto-show saat salah satu terisi; auto-clear dan kirim 0/kosong saat dikosongkan
- Modal edit (`Index.html:1284-1300`) mencerminkan field yang sama
- `js.html:485-492` prefill dari jalur: kartu slot 1 → `flazz_card_id`, kartu slot 2 → `flazz_card_id_toll` bila berbeda
- Bump `PAGE_VER` sesuai konvensi repo

## 11. Bug Lama yang Diperbaiki

`SpreadsheetOps.js:433` — `const id = 'USE-' + now.getTime()`.

Dua panggilan `autoCreateFlazzUsage` dalam milidetik yang sama menghasilkan **id `Flazz_Usage` duplikat**. Bug ini sudah ada hari ini (multi-baris simpan jalur), tetapi 2 kartu per baris membuatnya hampir pasti terjadi.

Perbaikan: `'USE-' + now.getTime() + '-' + (++seq)` dengan penghitung modul, plus cek collision terhadap id yang sudah ada.

## 12. Jaminan Backward Compatibility

Alur 1 kendaraan + 1 kartu menghasilkan nilai identik dengan sekarang di semua titik:

- `group2FromRow()` return `null` untuk semua baris lama → `cardGroups()` hanya mengembalikan `[grup1]` → seluruh fungsi share/match identik
- `SummaryOps` menjumlahkan `biaya_bbm + 0` → sama
- `isDuplicateTransaction` — key pembanding sudah mati (D5), perubahan tidak berdampak
- `saveJalur:423` `new Array(Object.keys(idx).length)` dihitung dari header aktual → otomatis menyesuaikan panjang baris
- symmetric difference di `updateJalur` menghasilkan identik saat slot 2 kosong
- `deleteJalur` — loop atas 1 kartu = perilaku lama
- Gate mobilitas memakai rumus yang tidak berubah (§6.5A)

Perubahan yang terlihat oleh user 1 kartu semuanya kosmetik: section grup-2 yang tersembunyi, dropdown ke-2 yang kosong, sel listing yang kosong, dan format id `Flazz_Usage` untuk baris baru saja (`ref_id` / `card_id` tidak berubah dan tidak ada lookup berdasarkan id).

## 13. Ruang Lingkup

**Di luar lingkup (disengaja):**

- Jumlah kartu per jalur dibatasi **2**. Tidak ada slot kartu ke-3.
- Nama kolom foto struk grup-2 (D2) — upgrade independen.
- Perbaikan `isDuplicateTransaction` (D5).
- `usage_type='GANDUNGAN'` (D4 / Tahap 9) — boleh dibatalkan tanpa memengaruhi Tahap 1-8.
- `Flazz_Tol` sebagai kanal overflow tidak dipakai; semua pengeluaran trip tercatat di `Penggunaan_BBM`.

## 14. Strategi Pengujian

| Harness | Cakupan |
|---|---|
| `scratch/test-payment-logic.js` (ada; `node scratch/test-payment-logic.js`) | grup-2 absent → identik sekarang; share per kartu; tol terbagi 2 kartu; `isFlazzRowForCard` tiap kartu; `flazzEditDelta` pindah beban antar grup; `flazzCardCharge` |
| Baru — test `recomputeJalurStatus` | 0/1/2 kartu; rekon parsial; jalur tanpa laporan |
| Baru — test `recomputeMonthlySummary` | baris dengan grup-2 terisi ikut terhitung |
| `scratch/jalur-autofill-guard-test.js` | dual-card warehouse guard |
| `scratch/test-jalur-release.js` | fixture header + kolom baru |
| Verifikasi manual Apps Script Editor | 1 trip 2 kartu → 2 handoff dengan id berbeda → 1 laporan → 2 rekon → jalur `SELESAI` hanya setelah keduanya |
| Verifikasi regresi | 1 trip 1 kartu → hasil identik dengan sebelum perubahan |
