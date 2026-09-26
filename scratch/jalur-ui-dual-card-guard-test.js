/**
 * Guard test Task 9 - UI Form Jalur dual dropdown etoll.
 * Source-level guard. Jalankan: node scratch/jalur-ui-dual-card-guard-test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const js = fs.readFileSync(path.join(ROOT, 'JalurScript.html'), 'utf8');
const pages = fs.readFileSync(path.join(ROOT, 'JalurPages.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function count(src, re) { return (src.match(re) || []).length; }

// Ekstrak <script> pertama untuk cek sintaks nyata (bukan cek teks mentah).
function scriptOf(src) {
  const m = src.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  return m ? m[1] : '';
}
const jsBody = scriptOf(js);

// U1: jalurSyncEtollRow generik per-slot.
check('U1a jalurSyncEtollRow menerima idClass & nameClass',
  /function jalurSyncEtollRow\(selectEl, idClass, nameClass\)/.test(js));
check('U1b default slot-1 tetap kompatibel',
  /row\.querySelector\(idClass \|\| '\.jalur-row-etoll-id'\)/.test(js) &&
  /row\.querySelector\(nameClass \|\| '\.jalur-row-etoll-name'\)/.test(js));

// U2: template baris punya dua dropdown.
check('U2a template baris punya select slot-2 + hidden id + hidden name',
  /class="form-select jalur-row-etoll2"/.test(js) &&
  /class="jalur-row-etoll2-id"/.test(js) &&
  /class="jalur-row-etoll2-name"/.test(js));
check('U2b onchange slot-2 meneruskan class slot-2',
  /onchange="jalurSyncEtollRow\(this, \\'\.jalur-row-etoll2-id\\', \\'\.jalur-row-etoll2-name\\'\)"/.test(js));
check('U2c slot-1 & slot-2 sama-sama di-populate saat addRow',
  count(js, /jalurPopulateEtollOptions\(row\.querySelector\('\.jalur-row-etoll2?'\)/g) === 2);
check('U2d label kolom menjelaskan opsionalitas',
  /Kartu Etoll 2 \(opsional\)/.test(js));
check('U2e baris rute tetap full width (tidak terpotong 4 kolom)',
  /<div class="col-12"><label class="form-label text-muted small text-uppercase fw-bold">Rute Tujuan<\/label>/.test(js));

// U3: helper pembanding id kartu.
check('U3a canonicalCardIdLocal ada & menormalkan tanda hubung',
  /function canonicalCardIdLocal\(v\)/.test(js) &&
  /replace\(\/-\/g, ''\)/.test(js));
check('U3b helper dipakai di jalurSave', /canonicalCardIdLocal\(id1\) === canonicalCardIdLocal\(id2\)/.test(js));
check('U3c helper dipakai di jalurSaveEdit', /canonicalCardIdLocal\(data\.etoll_card_id\) === canonicalCardIdLocal\(data\.etoll_card_id_2\)/.test(js));

// U4: jalurSave mengirim 4 field.
check('U4a jalurSave mengirim etoll_card_id_2 & etoll_card_name_2',
  /etoll_card_id_2: id2/.test(js) && /etoll_card_name_2: etoll2Name \? etoll2Name\.value : ''/.test(js));
check('U4b pesan error duplikat spesifik, bukan pesan validasi umum',
  /rowError = 'Kartu etoll ke-2 harus berbeda dari kartu etoll ke-1'/.test(js) &&
  /if \(rowError\) \{ showToast\(rowError, 'error'\); return; \}/.test(js));
check('U4c jalurSave tetap menolak driver tak dikenal (tidak diregresi)',
  /if \(!valid\) \{ showToast\('Ada nama driver yang tidak dikenal/.test(js));

// U5: slot-2 tidak mewarisi kartu default driver.
check('U5a jalurRefreshEtoll2 ada & mengosongkan slot-2 bila sama dengan slot-1',
  /function jalurRefreshEtoll2\(row, sel1\)/.test(js) &&
  /canonicalCardIdLocal\(keep\) === canonicalCardIdLocal\(sel1\.value\)/.test(js));
check('U5b autofill driver menyelaraskan slot-2 tanpa memberi kartu default',
  /jalurRefreshEtoll2\(row, row\.querySelector\('\.jalur-row-etoll'\)\)/.test(js));
check('U5c ganti cabang menyelaraskan kedua slot',
  /jalurRefreshEtoll2\(r, sel\)/.test(js));
check('U5d autofill modal edit menyelaraskan slot-2',
  /function jalurAutofillEditEtoll[\s\S]{0,1600}jalurPopulateEtollOptions\(sel2, keep\)/.test(js));

// U6: modal edit punya field ke-2.
check('U6a JalurPages punya select & hidden jalur-edit-etoll2',
  /id='jalur-edit-etoll2'/.test(pages) && /id='jalur-edit-etoll2-id'/.test(pages));
check('U6b kedua select memakai onchange jalurSyncEditEtoll',
  count(pages, /onchange="jalurSyncEditEtoll\(\)"/g) === 2);
check('U6c jalurSyncEditEtoll menyalin kedua select ke hidden',
  /function jalurSyncEditEtoll\(\)/.test(js) &&
  /h1\.value = sel1\.value \|\| ''/.test(js) && /h2\.value = sel2\.value \|\| ''/.test(js));
check('U6d jalurEdit memuat nilai slot-2 dari data listing',
  /editEtoll2 = document\.getElementById\('jalur-edit-etoll2'\)/.test(js) &&
  /jalurPopulateEtollOptions\(editEtoll2, id2\)/.test(js));
check('U6e jalurSaveEdit mengirim 4 field',
  /etoll_card_id_2: etoll2Id \? \(etoll2Id\.value \|\| ''\) : ''/.test(js) &&
  /etoll_card_name_2: etoll2Opt && etoll2Opt\.value/.test(js));

// U7: listing & summary menampilkan dua kartu.
check('U7a jalurEtollCell ada & menangani 4 kombinasi (none/1/2/both)',
  /function jalurEtollCell\(it\)/.test(js) &&
  /if \(!a && !b\) return esc\('-'\);/.test(js) &&
  /if \(!b\) return esc\(a\);/.test(js) &&
  /if \(!a\) return esc\(b\);/.test(js));
check('U7b kedua tabel memakai jalurEtollCell',
  count(js, /'<td>' \+ jalurEtollCell\(it\) \+ '<\/td>' \+/g) === 2);
check('U7c tidak ada lagi esc(it.flazz_card_name) mentah di script',
  !/esc\(it\.flazz_card_name \|\| '-'\)/.test(js));
check('U7d judul kolom tabel menyebut dua kartu',
  count(pages, /<th>Etoll 1<br><span class='fw-normal small'>Etoll 2<\/span><\/th>/g) === 2);

// U8: sinaksis & hygiene.
check('U8a blok script JalurScript terbaca & tidak kosong', jsBody.length > 1000);
const cjk = [js, pages].join('\n').split(/\r?\n/)
  .map((l, i) => [i + 1, l]).filter(([, l]) => /[\u3000-\u9fff\uff00-\uffef]/.test(l));
check('U8b tidak ada karakter CJK di file UI Jalur (label ' + cjk.length + ')', cjk.length === 0);
if (cjk.length) cjk.slice(0, 5).forEach(([n, l]) => console.log('      baris ' + n + ': ' + l.trim()));
check('U8c tidak ada select etoll lama dengan onchange inline yang tersisa', !/id='jalur-edit-etoll'[^>]*onchange="document\.getElementById/.test(pages));

console.log('');
console.log('HASIL: ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
