/**
 * Guard test Task 10 - Form Input Laporan dual kelompok pembayaran.
 * Source-level guard. Jalankan: node scratch/laporan-ui-dual-card-guard-test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const index = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'js.html'), 'utf8');
const config = fs.readFileSync(path.join(ROOT, 'Config.gs'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function count(src, re) { return (src.match(re) || []).length; }
function hasId(src, id) { return new RegExp('id=[\'"]' + id + '[\'"]').test(src); }

const scriptBody = (js.match(/<script[^>]*>([\s\S]*?)<\/script>/i) || ['', ''])[1];

// L1: markup blok grup-2 tersembunyi sampai diminta.
check('L1a tombol & pembungkus grup-2 ada', hasId(index, 'grup-kartu2-tombol-wrap') &&
  hasId(index, 'btn-grup-kartu2') && hasId(index, 'grup-kartu2-wrap'));
check('L1b blok grup-2 awal disembunyikan', /id='grup-kartu2-wrap' style='display:none'/.test(index));
check('L1c tombol memanggil toggleGrupKartu2()', /id='btn-grup-kartu2' onclick='toggleGrupKartu2\(\)'/.test(index));
check('L1d 4 field grup-2 ada di form utama',
  ['biaya_bbm_2', 'flazz_card_id_2', 'biaya_toll_2', 'flazz_card_id_toll_2'].every((id) => hasId(index, id)));
check('L1e helper explainer menyebut nominal tanpa kartu = tunai',
  /tanpa kartu[\s\S]{0,40}tunai/i.test(index));

// L2: popup grup-2 dibuka hanya saat ada isi (auto-show) & auto-clear saat ditutup.
check('L2a toggleGrupKartu2(force) ada', /function toggleGrupKartu2\(force\)/.test(js));
check('L2b auto-show dari input grup-2', /function onGrupKartu2Input\(\)/.test(js) &&
  /wrap\.style\.display === 'none' && grupKartu2Aktif\(\)\) toggleGrupKartu2\(true\)/.test(js));
check('L2c saat dimatikan, 4 field dikosongkan', (function () {
  const m = js.match(/function toggleGrupKartu2\(force\)[\s\S]*?\n  \}/);
  return m && /biaya_bbm_2', 'biaya_toll_2', 'flazz_card_id_2', 'flazz_card_id_toll_2'/.test(m[0]) &&
    /if \(el\) el\.value = ''/.test(m[0]);
})());
check('L2d grupKartu2Aktif() considers nominal & kartu', /function grupKartu2Aktif\(\)/.test(js) &&
  /parseFloat\(b2\.value\) > 0/.test(js) && /c2\.value !== ''/.test(js));

// L3: D1 - grup-2 tidak punya metode sendiri; nominal tanpa kartu = tunai.
check('L3a tidak ada input metode_* untuk grup-2', !/metode_pembayaran_2|metode_toll_2/.test(index) &&
  !/name=["']metode_pembayaran_2["']/.test(index));
check('L3b readGrupKartu2() tidak mengirim metode', /function readGrupKartu2\(\)/.test(js) &&
  !/function readGrupKartu2\(\)\s*\{[\s\S]*?metode_pembayaran_2/.test(js));
check('L3c grup-2 nonaktif mengirim 0/kosong', /aktif: false, biaya_bbm_2: 0, biaya_toll_2: 0, flazz_card_id_2: '', flazz_card_id_toll_2: ''/.test(js));
check('L3d label option slot-2 = "Tanpa kartu (tunai)"',
  /indexOf\('_2'\) > -1\) \? 'Tanpa kartu \(tunai\)' : 'Pilih Kartu\.\.\.'/.test(js));

// L4: keempat select grup-1 & grup-2 populate dari daftar kartu yang sama.
check('L4a init dropdown iterate 4 select', /\['flazz_card_id', 'flazz_card_id_toll', 'flazz_card_id_2', 'flazz_card_id_toll_2'\]\.forEach/.test(js));
check('L4b filter warehouse juga populate 2 select grup-2',
  /populateFlazzCardSelect\('flazz_card_id_2', cabang\)/.test(js) &&
  /populateFlazzCardSelect\('flazz_card_id_toll_2', cabang\)/.test(js));

// L5: payload create, edit-form, dan modal edit sama-sama membawa 4 field.
check('L5a payload create mengirim 4 field', /formDataPayload = \{[\s\S]*?biaya_bbm_2: g2\.biaya_bbm_2,[\s\S]*?biaya_toll_2: g2\.biaya_toll_2,[\s\S]*?flazz_card_id_2: g2\.flazz_card_id_2,[\s\S]*?flazz_card_id_toll_2: g2\.flazz_card_id_toll_2/.test(js));
check('L5b payload edit-form mengirim 4 field', /var payload = \{[\s\S]*?biaya_bbm_2: g2\.biaya_bbm_2,[\s\S]*?biaya_toll_2: g2\.biaya_toll_2,[\s\S]*?flazz_card_id_2: g2\.flazz_card_id_2,[\s\S]*?flazz_card_id_toll_2: g2\.flazz_card_id_toll_2/.test(js));
check('L5c payload modal edit mengirim 4 field',
  /ed_biaya_bbm_2/.test(js) && /ed_flazz_card_id_2/.test(js) &&
  /ed_biaya_toll_2/.test(js) && /ed_flazz_card_id_toll_2/.test(js));
check('L5d 4 field grup-2 ada di markup modal edit',
  ['ed_biaya_bbm_2', 'ed_flazz_card_id_2', 'ed_biaya_toll_2', 'ed_flazz_card_id_toll_2'].every((id) => hasId(index, id)));

// L6: balance gate menjumlahkan per kartu walau grup-1 & grup-2 memakai kartu sama.
check('L6a precheck memakai readGrupKartu2', /function checkFlazzBalanceBeforeSubmit[\s\S]*?readGrupKartu2/.test(js));
check('L6b pengeluaran grup-1 digabung bila kartu sama', /extra\[g2\.flazz_card_id_2\] \+= biayaBbm/.test(js) &&
  /extra\[g2\.flazz_card_id_toll_2\] \+= biayaTol/.test(js));
check('L6c tidak ada error "harus berbeda dari kartu ke-1" di form laporan',
  !/Kartu ke-2 harus berbeda dari kartu ke-1/.test(js));
check('L6d tidak ada error nominal grup-2 tanpa kartu (D1: jadi tunai)',
  !/Nominal BBM kartu 2 terisi tapi kartu Flazz-nya belum dipilih/.test(js) &&
  !/Nominal Tol kartu 2 terisi tapi kartu Flazz-nya belum dipilih/.test(js));

// L7: ringkasan review & total mencakup grup-2.
check('L7a baris ringkasan kartu ke-2 ada', hasId(index, 'sum_bayar_kartu2') &&
  hasId(index, 'sum_bayar_kartu2_wrap'));
check('L7b baris grup-2 disembunyikan saat tidak dipakai',
  /if \(elG2Wrap\) elG2Wrap\.style\.display = 'none';/.test(js) &&
  /if \(elG2Wrap\) elG2Wrap\.style\.display = '';/.test(js));
check('L7c total menjumlahkan grup-2', /var total = biayaBbm \+ biayaTol \+ \(g2\.aktif \? \(g2\.biaya_bbm_2 \+ g2\.biaya_toll_2\) : 0\)/.test(js));
check('L7d isi_bbm ikut memperhitungkan grup-2', /isi\.value = \(bb > 0 \|\| tt > 0 \|\| b2 > 0 \|\| t2 > 0\) \? 'Ya' : 'Tidak'/.test(js));
check('L7e prefill isi_bbm juga considering grup-2',
  /var biayaPrefill = p\.biaya_bbm > 0 \|\| p\.biaya_toll > 0 \|\| p\.biaya_bbm_2 > 0 \|\| p\.biaya_toll_2 > 0;/.test(js));

// L8: prefill (jalur, laporan terakhir) & edit mengisi ulang blok grup-2.
check('L8a prefill dari jalur mengisi slot-2 dari match.flazz_card_id_2', /match\.flazz_card_id_2/.test(js) &&
  /selCard2\.value = card2/.test(js));
check('L8b prefill jalur tidak menimpa radio metode grup-1', !/input\[name="metode_pembayaran"\][\s\S]{0,200}card2/.test(js));
check('L8c prefill laporan terakhir mengisi grup-2', /fillGrupKartu2\(\{[\s\S]*?biaya_bbm_2: p\.biaya_bbm_2/.test(js));
check('L8d loadEditInForm mengisi grup-2 dari row', /fillGrupKartu2\(\{[\s\S]*?biaya_bbm_2: row\.biaya_bbm_2/.test(js));
check('L8e fillGrupKartu2 tidak membuka blok saat data kosong', /if \(b2 <= 0 && t2 <= 0 && !c2 && !ct2\) return;/.test(js));
check('L8f resetDailyForm & filter warehouse mereset grup-2',
  /resetGrupKartu2\(\)/.test(js) && /resetGrupKartu2\(\);\s*$/m.test(js));

// L9: hygiene - sintaks, div balance, PAGE_VER, CJK.
check('L9a blok script terbaca & tidak kosong', scriptBody.length > 1000);
const cjk = [index, js].join('\n').split(/\r?\n/)
  .map((l, i) => [i + 1, l]).filter(([, l]) => /[\u3000-\u9fff\uff00-\uffef]/.test(l));
check('L9b tidak ada karakter CJK di file UI laporan (' + cjk.length + ')', cjk.length === 0);
if (cjk.length) cjk.slice(0, 5).forEach(([n, l]) => console.log('      baris ' + n + ': ' + l.trim()));
const openDiv = (index.match(/<div\b/g) || []).length;
const closeDiv = (index.match(/<\/div>/g) || []).length;
check('L9c div Index.html seimbang (' + openDiv + '/' + closeDiv + ')', openDiv === closeDiv);
check('L9d PAGE_VER sudah dinaikkan dari 20260918v3',
  /var PAGE_VER = '(\d+)v(\d+)'/.test(config) && !/var PAGE_VER = '20260918v3'/.test(config));
check('L9e tidak ada select grup-2 tanpa handler onchange/oninput',
  !/id='flazz_card_id_(2|toll_2)' class='form-select'>/.test(index));

console.log('');
console.log('HASIL: ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
