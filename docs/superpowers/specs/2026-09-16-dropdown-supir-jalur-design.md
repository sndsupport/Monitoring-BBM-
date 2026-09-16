# Design: Dropdown Supir Jalur BELUM_DIISI di Input Laporan

**Tanggal:** 2026-09-16  
**Status:** Disetujui (verbal)

---

## Ringkasan

Mengganti field `#nama_supir` pada form Input Laporan dari input bebas-ketik + datalist menjadi dropdown `<select>` yang hanya menampilkan supir yang memiliki Jalur Pengiriman dengan status `BELUM_DIISI` pada tanggal terpilih. Sejalan dengan UX dropdown kartu Flazz di halaman Rekonsiliasi.

## Masalah

PIC cabang bisa salah memasukkan nama supir yang tidak memiliki jalur BELUM_DIISI pada tanggal terpilih. Server menolaknya (SpreadsheetOps.js:168-170), tetapi baru terdeteksi **setelah klik submit** — menimbulkan frustrasi. Dropdown mencegah kesalahan ini di sumbernya.

## Desain

### 1. Perubahan HTML — `src/Index.html`

**Baris 261-262** — ganti `<input>` + `<datalist>` menjadi `<select>`:

```html
<select id='nama_supir' class='form-select form-select-sm' required
        onchange='onLaporanDriverChange(); this.classList.remove("is-invalid"); updateLiveSummary()'>
  <option value=''>Pilih Supir...</option>
</select>
```

- `<datalist id='supir-datalist'>` dihapus.
- `required` tetap dipakai (validasi HTML5).
- `onchange` memanggil `onLaporanDriverChange()` (sudah ada, akan diadaptasi).

### 2. Perubahan Client JS — `src/js.html`

#### 2a. Populasi dropdown dari jalur BELUM_DIISI

Tambah fungsi baru `populateJalurDriverSelect(list)`:

```js
function populateJalurDriverSelect(list) {
  var sel = document.getElementById('nama_supir');
  if (!sel) return;
  sel.innerHTML = '<option value="">Pilih Supir...</option>';
  (list || []).forEach(function(j) {
    var opt = document.createElement('option');
    opt.value = j.nama_driver;            // server mencocokkan ini dengan nama_driver di Jalur
    opt.text = j.nama_driver + (j.plat_nomor ? ' — ' + j.plat_nomor : '');
    opt.setAttribute('data-vehicle-id', j.vehicle_id || '');
    opt.setAttribute('data-flazz-card-id', j.flazz_card_id || '');
    sel.appendChild(opt);
  });
}
```

#### 2b. Adaptasi `onLaporanDateChange()` (baris 372-406)

Ganti pemanggilan `populateSupirDatalistFrom(names)` dengan `refreshJalurDriverOptions()`. Fungsi `onLaporanDateChange` tetap mereset supir/kendaraan/tol/tol-radio lalu memanggil pemuat:

```js
function onLaporanDateChange() {
  // ... (reset nama_supir, vehicle, tol card, radio tol seperti sekarang) ...

  // Isi dropdown supir dari jalur BELUM_DIISI untuk tanggal terpilih
  refreshJalurDriverOptions();
}
```

Tak ada lagi fallback ke `populateSupirDatalist()` (yang mengisi SEMUA supir master) — dropdown dibatasi hanya pada jalur BELUM_DIISI.

#### 2c. `onLaporanDriverChange()` (baris 408-433) — tak berubah

Fungsi ini sudah membaca `.value` dari `#nama_supir` dan mencocokkannya dengan `window.__jalurDrivers`. Dengan select, `.value` mengembalikan `nama_driver` (sama seperti sebelumnya). Tidak ada perubahan logika.

#### 2d. Populasi awal saat form dibuka dengan tanggal sudah terpilih

`prefillFormFromLast()` (:856) mengisi `#tanggal` dengan hari ini dan mengisi field laporan terakhir, tetapi tidak memuat daftar supir jalur. Tambahkan fungsi pemuat yang "tidak destruktif" (hanya mengisi dropdown, tidak mereset field lain), lalu panggil dari prefill:

```js
// Hanya memuat dropdown supir jalur untuk tanggal terpilih (tanpa reset field lain)
function refreshJalurDriverOptions() {
  var tglInput = document.getElementById('tanggal');
  var tgl = tglInput ? tglInput.value : '';
  if (!tgl) { populateJalurDriverSelect([]); return; }
  google.script.run
    .withFailureHandler(function(err) {
      console.error('Gagal load jalur drivers:', err);
      populateJalurDriverSelect([]);
    })
    .withSuccessHandler(function(res) {
      if (!res || !res.success || !res.list) { populateJalurDriverSelect([]); return; }
      window.__jalurDrivers = res.list;
      populateJalurDriverSelect(res.list);
    })
    .apiGetJalurDriversForDate(tgl, bbmToken());
}
```

- `onLaporanDateChange()` (:372) — mereset supir/kendaraan/tol lalu memanggil `refreshJalurDriverOptions()` untuk memuat.
- Di akhir `getLastLaporanPrefill` success handler:
  ```js
  // Isi dropdown jalur untuk tanggal terpilih tanpa mengganggu nilai prefill
  if (typeof refreshJalurDriverOptions === 'function') refreshJalurDriverOptions();
  ```
  (DI SINI TIDAK memanggil `onLaporanDateChange` karena itu akan mereset kendaraan/tol yang baru diisi prefill.)

#### 2e. `isSupirNameValid()` (baris 2316-2320) — dilonggarkan

```js
function isSupirNameValid() {
  var sel = document.getElementById('nama_supir');
  return sel && sel.value !== '';   // sudah cukup — pilihan hanya dari jalur BELUM_DIISI
}
```

Karena select hanya berisi supir dari jalur BELUM_DIISI, validasi cukup memastikan ada yang dipilih. Tidak perlu lagi memeriksa apakah nama ada di master supir.

#### 2f. `getSupirSelectedName()` (baris 2181) — tak berubah

`document.getElementById('nama_supir').value` tetap mengembalikan nama supir (string). Compatible dengan semua pemanggil.

#### 2g. Fungsi yang tidak lagi dipanggil dari form (tapi masih dipanggil tempat lain)

| Fungsi | Pemanggil saat ini | Status |
|--------|-------------------|--------|
| `populateSupirDatalist()` | js.html:346, 2338 | Jadikan no-op atau redirect ke `populateJalurDriverSelect([])` |
| `populateSupirDatalistFrom()` | hanya dari `onLaporanDateChange` | Hapus |
| `onSupirChange()` | hanya dari HTML `oninput` (dihapus) | Hapus |
| `applySupirAutofill()` | js.html:2339, `onSupirChange` | Hapus dari pemanggilan 2339; `onSupirChange` dihapus |

### 3. Tidak ada perubahan server

Payload `nama_supir` tetap berisi nama supir (string). Backend `findJalurByCriteria` mencocokkan dengan `nama_driver` di sheet Jalur_Pengiriman. `SpreadsheetOps.js` tidak diubah.

### 4. Kontrak Data

Backend `getJalurDriversForDate` sudah mengembalikan (JalurOps.js:682-743):
```json
{
  "success": true,
  "list": [
    {
      "nama_driver": "Yudiman",
      "vehicle_id": "V-001",
      "flazz_card_id": "FLZ-123",
      "flazz_card_name": "Kartu Utama",
      "kode_cabang": "CBG-01"
    }
  ]
}
```

Field yang dipakai dropdown:
- `nama_driver` → value opsi + teks awal
- `vehicle_id` → data-attribute untuk referensi (tidak dipakai langsung, tetapi berguna untuk debugging)

> **Catatan:** field `plat_nomor` belum dikembalikan `getJalurDriversForDate`. Jika ingin menampilkan plat, tambahkan ke query backend (JalurOps.js:728). Ini opsional dan dapat dilakukan terpisah.

### 5. Kontrak UI

| State | Perilaku |
|-------|----------|
| Tanggal kosong | Select = placeholder "Pilih Supir..." saja |
| Tanggal dipilih, 1+ jalur BELUM_DIISI | Select berisi opsi supir + placeholder |
| Tanggal dipilih, 0 jalur BELUM_DIISI | Select = placeholder saja + tidak ada submit (server akan tolak jika dipaksa) |
| Supir dipilih | Kendaraan + kartu tol otomatis terisi (via `onLaporanDriverChange`) |

### 6. PAGE_VER

Bump dari `20260916v2` ke `20260916v3` (Config.gs). File UI berubah → cache busting diperlukan.

---

## Cakupan file yang berubah

| File | Perubahan |
|------|-----------|
| `src/Index.html` | Ganti input+datalist → select |
| `src/js.html` | Tambah `populateJalurDriverSelect()`, adapt `onLaporanDateChange()`, longgarkan `isSupirNameValid()`, trigger awal di `prefillFormFromLast()`, bersihkan referensi datalist |
| `src/Config.gs` | PAGE_VER `20260916v2` → `20260916v3` |

## Tidak berubah

- Backend (SpreadsheetOps.js, JalurOps.js, Code.js) — tidak tersentuh.
- `onLaporanDriverChange()` — logika autofill kendaraan+tol tetap.
- `getSupirSelectedName()` — tetap mengembalikan nama string.
- Server-side balance gate — tetap berjalan seperti sebelumnya.

## Risiko & Mitigasi

1. **`refreshJalurDriverOptions` dipanggil di prefill sebelum `window.__jalurDrivers` siap** → tidak masalah: fungsi memanggil backend, dan success handler-nya yang menetapkan `__jalurDrivers` + mengisi select secara asinkron.
2. **Dropdown kosong saat tidak ada jalur** → user tidak bisa submit. Ini **diumumkan** via placeholder kosong, bukan error. UX lebih jelas daripada submit lalu ditolak server.
3. **Supir dari jalur tidak ada di master supir** → `isSupirNameValid` tidak memeriksa master lagi. Server tetap otoritatif. Tidak ada risiko.
4. **Prefill vs reset** → `refreshJalurDriverOptions` tidak mereset field lain; hanya `onLaporanDateChange` (pemicu dari user mengganti tanggal) yang mereset. Jadi prefill laporan terakhir tetap utuh.

## Test Strategy

- Extract script block js.html → `node --check`.
- Test harness simulasi: `populateJalurDriverSelect` menghasilkan opsi yang benar, `refreshJalurDriverOptions` memanggil API mock dan populasi select, `isSupirNameValid` return true jika select terisi.
- Uji manual: buka form dengan tanggal hari ini → dropdown harus terisi jalur BELUM_DIISI (tanpa perlu mengubah tanggal). Pilih supir → kendaraan+tol auto. Coba submit tanpa memilih → ditolak HTML5 `required`.
