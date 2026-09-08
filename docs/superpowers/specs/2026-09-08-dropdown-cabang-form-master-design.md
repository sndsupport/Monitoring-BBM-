# Desain: Dropdown Cabang Form Master Dibatasi Sesuai Role

## Masalah

Pada form tambah/edit Master Kendaraan dan Master Supir, dropdown `m_cabang` / `m_cabang_supir`
diisi dari `data.cabangList` (seluruh warehouse) untuk SEMUA role (`js.html:244-263`).
Akibatnya PIC CABANG melihat daftar panjang semua cabang padahal hanya boleh mengelola
warehouse miliknya. Server sudah mengunci (`assertOwnWarehouse` di `insertKendaraan`
SpreadsheetOps.js:947 dan `insertSupir` :981), sehingga kesalahan pilih hanya menghasilkan
error. Ini murni masalah UX.

## Perilaku yang Diinginkan

1. Dropdown cabang form Master Kendaraan & Supir:
   - SUPERADMIN: semua cabang (perilaku saat ini).
   - PIC CABANG / non-superadmin: hanya cabang milik user login.
2. Fallback defensif: jika kode cabang user tidak ditemukan di daftar cabang (kasus data
   tidak konsisten, mis. `TSK` vs `TSM`), dropdown tetap menampilkan satu opsi kode cabang
   user agar form tidak tergantung pada konsistensi data dan PIC tidak kehilangan akses form.

## Implementasi

Di `src/js.html`, tambahkan helper:

```js
function cabangOptionsForRole(list, userCabang) {
  if (userRole === 'SUPERADMIN') return list || [];
  var mine = String(userCabang || '');
  var mineOpts = (list || []).filter(function(c) { return String(c.kode) === mine; });
  if (mineOpts.length) return mineOpts;
  return [{ kode: mine, nama: mine }];
}
```

Ganti populate di `js.html:250` (blok `data.cabangList.forEach` untuk `m_cabang` dan
`m_cabang_supir`) agar memakai `cabangOptionsForRole(data.cabangList, data.cabang)`.

`userRole` dan `data.cabang` sudah tersedia di titik tersebut (`userRole` di-set dari
`data.role` pada `js.html:159`, sebelum blok populate; `data.cabang` dipakai di `role-alert`)
— jadi tidak perlu fetch tambahan.

## Ruang Lingkup

- Hanya `src/js.html`.
- Tidak ada perubahan server-side (enforcement sudah ada).
- Select filter "Semua Warehouse" di halaman Master (`fillCabangSelect`) tetap tersembunyi
  untuk non-superadmin (`populateMasterFilter`), tidak disentuh.
- Select cabang di halaman admin Pengguna (`m_cabang_pengguna`) hanya diakses SUPERADMIN,
  tidak disentuh.

## Verifikasi

- `node --check` pada blok script inline js.html.
- Uji manual browser: login PIC Tasikmalaya → buka form Master Kendaraan → dropdown hanya
  berisi TSM; login SUPERADMIN → dropdown berisi semua cabang.