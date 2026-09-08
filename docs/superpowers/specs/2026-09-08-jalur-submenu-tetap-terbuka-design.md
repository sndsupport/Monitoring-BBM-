# Desain: Sub-menu Sidebar Tetap Terbuka Saat Berpindah Antar Item Group

## Masalah

Di sidebar desktop, setiap klik item sub-menu menjalankan `switchTab(tab)`, yang pada
`src/js.html:556` menutup SEMUA `.menu-group.open`:

```js
document.querySelectorAll('.menu-group.open').forEach(function(g) { g.classList.remove('open'); });
```

Akibatnya group (misal JALUR PENGIRIMAN yang berisi Buat Jalur / Daftar Jalur / Summary)
langsung terlipat setiap kali pengguna memilih salah satu sub-menu-nya, sehingga pengguna
harus membuka ulang group untuk berpindah ke item lain dalam group yang sama.

## Perilaku yang Diinginkan

1. Klik sub-menu dalam group yang sama (Buat Jalur <-> Daftar Jalur <-> Summary Pengiriman)
   -> group tetap terbuka.
2. Klik sub-menu group lain, atau menu standalone (Dashboard), -> semua group menutup.
3. Berlaku untuk semua sidebar group (JALUR PENGIRIMAN, LAPORAN OPERASIONAL, KARTU FLAZZ, ADMIN).
4. Sidebar DESKTOP saja. Drawer mobile tetap menutup setelah memilih item (perilaku overlay standar).
5. Klik judul group (`toggleNavMenu`) tetap berperilaku akordeon seperti sekarang.

## Implementasi

Di `switchTab` (src/js.html sekitra baris 556), ganti penutupan seluruh group dengan
penutupan semua group KECUALI group yang memuat link tab aktif:

```js
var activeGroup = activeTab ? activeTab.closest('.menu-group') : null;
document.querySelectorAll('.menu-group.open').forEach(function(g) {
  if (g !== activeGroup) g.classList.remove('open');
});
if (activeGroup) activeGroup.classList.add('open');
```

`activeTab` sudah tersedia di baris 550 (`document.getElementById('tab-' + tab)`).
Untuk tab standalone (dashboard) `closest('.menu-group')` bernilai null -> semua group menutup
sesuai perilaku yang diinginkan.

## Verifikasi

- `node --check` pada blok script inline js.html.
- Inspeksi manual di browser: pindah antar sub-menu JALUR PENGIRIMAN (group tetap terbuka),
  lalu ke Dashboard (group menutup), lalu ke item KARTU FLAZZ (group flazz terbuka, lain menutup).