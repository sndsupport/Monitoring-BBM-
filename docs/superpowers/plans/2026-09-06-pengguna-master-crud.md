# Tab Pengguna (Data Master) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full CRUD management of user accounts from the application via a new "Pengguna" tab in Data Master, visible only to SUPERADMIN.

**Architecture:** New server functions in `SpreadsheetOps.js` (list/create/update/soft-delete users) driven by new wrappers in `Code.js` that also expose `penggunaList` only to SUPERADMIN. UI mirrors the existing Warehouse-master pattern: nav tab + card/list + Bootstrap modal form in `Index.html`, render/CRUD handlers in `js.html`.

**Tech Stack:** Google Apps Script (V8), Bootstrap 5, vanilla JS, `google.script.run` RPC.

## Global Constraints

- Sheet `Pengguna` schema UNCHANGED: `['user_id','username','password','nama','role','kode_cabang','status']`
- Login (`authenticateUser`) UNCHANGED — plaintext password compare, `status === 'Aktif'`
- Password MUST NEVER be returned to the client
- Tab & data visible ONLY to SUPERADMIN; non-SUPERADMIN gets `penggunaList: []`
- Guardrails: cannot deactivate your own account; cannot leave 0 active SUPERADMIN
- Follow existing conventions: inline HTML in `.html` files, `google.script.run` RPC, unescaped message strings via `showToast(msg, 'success'|'error')`, escape user text with `escapeAttr()` (js.html:1333)
- Indonesian toast messages (existing style)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/SpreadsheetOps.js` | `getAllUsers`, `insertUser`, `updateUser`, `setUserStatus` + helpers (`getUserByUsername`, `countActiveSuperadmin`) |
| `src/Code.js` | Wrappers `saveMasterPengguna`/`updateMasterPengguna`/`deleteMasterPengguna`/`activateMasterPengguna`; add `penggunaList` to `getMasterData` & `processInitialData` |
| `src/Index.html` | Nav-tab button `pengguna`, `master-pengguna` section, `#modal-pengguna` form |
| `src/js.html` | Hide tab for non-SUPERADMIN, `loadMasterData` case, `renderPenggunaList` + CRUD handlers |

---

### Task 1: Backend — user CRUD in SpreadsheetOps.js

**Files:**
- Modify: `src/SpreadsheetOps.js` (append after `deleteSupirById`, around line 879–883)

**Interfaces:**
- Produces:
  - `getAllUsers()` → `[{user_id, username, nama, role, cabang, status}]` (NO `password` key)
  - `insertUser(data)` → `{msg}` or throws
  - `updateUser(data, userInfo)` → `{msg}` or throws
  - `setUserStatus(userId, status, userInfo)` → `{msg}` or throws
- Used by: Task 2 wrappers

- [ ] **Step 1: Append the user CRUD functions**

Append after `deleteSupirById` (before the final closing of the file / after line 883). Exact code:

```javascript
// ==========================================
// PENGGUNA (AKUN) CRUD
// ==========================================

function getAllUsers() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const ci = {};
  headers.forEach((h, i) => { ci[String(h)] = i; });
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    list.push({
      user_id: row[ci['user_id']],
      username: row[ci['username']],
      nama: row[ci['nama']],
      role: row[ci['role']],
      cabang: (ci['kode_cabang'] !== undefined) ? row[ci['kode_cabang']] : '',
      status: (ci['status'] !== undefined) ? row[ci['status']] : ''
    });
  }
  return list;
}

function getUserByUsername(sheet, uname) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase() === String(uname).toLowerCase()) {
      return { rowIndex: i + 1, row: data[i] };
    }
  }
  return null;
}

function countActiveSuperadmin(sheet) {
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === 'SUPERADMIN' && data[i][6] === 'Aktif') count++;
  }
  return count;
}

function insertUser(data) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const uname = String(data.username || '').trim();
  const nama = String(data.nama || '').trim();
  const password = String(data.password || '');
  const role = data.role || '';
  const cabang = (data.cabang || '').trim();
  if (!uname) throw new Error('Username wajib diisi');
  if (!nama) throw new Error('Nama wajib diisi');
  if (!password) throw new Error('Password wajib diisi');
  if (role !== 'SUPERADMIN' && role !== 'PIC CABANG') throw new Error('Role tidak valid');
  if (role === 'PIC CABANG' && !cabang) throw new Error('Warehouse wajib diisi untuk PIC CABANG');
  if (getUserByUsername(sheet, uname)) throw new Error('Username sudah terpakai');
  const id = 'U-' + new Date().getTime();
  sheet.appendRow([id, uname, password, nama, role, cabang, 'Aktif']);
  return { msg: 'Pengguna Berhasil Ditambahkan' };
}

function updateUser(data, userInfo) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const userId = String(data.user_id || '');
  const uname = String(data.username || '').trim();
  const nama = String(data.nama || '').trim();
  const role = data.role || '';
  const cabang = (data.cabang || '').trim();

  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === userId) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) throw new Error('Pengguna tidak ditemukan');

  if (!uname) throw new Error('Username wajib diisi');
  if (!nama) throw new Error('Nama wajib diisi');
  if (role !== 'SUPERADMIN' && role !== 'PIC CABANG') throw new Error('Role tidak valid');
  if (role === 'PIC CABANG' && !cabang) throw new Error('Warehouse wajib diisi untuk PIC CABANG');

  const existing = getUserByUsername(sheet, uname);
  if (existing && String(existing.row[0]) !== userId) throw new Error('Username sudah terpakai');

  const currentRow = values[rowIndex - 1];
  if (userInfo && String(userInfo.username) === String(currentRow[1]) &&
      currentRow[4] === 'SUPERADMIN' && role !== 'SUPERADMIN' &&
      countActiveSuperadmin(sheet) <= 1) {
    throw new Error('Tidak bisa menghapus peran SUPERADMIN terakhir');
  }

  const password = String(data.password || '');
  const newPassword = password ? password : String(currentRow[2]);
  sheet.getRange(rowIndex, 2, 1, 5).setValues([[uname, newPassword, nama, role, cabang]]);
  return { msg: 'Pengguna Berhasil Diupdate' };
}

function setUserStatus(userId, status, userInfo) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(userId)) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) throw new Error('Pengguna tidak ditemukan');
  const row = values[rowIndex - 1];
  if (status === 'Non-Aktif') {
    if (userInfo && String(userInfo.username) === String(row[1])) {
      throw new Error('Tidak bisa menonaktifkan akun sendiri');
    }
    if (row[4] === 'SUPERADMIN' && countActiveSuperadmin(sheet) <= 1) {
      throw new Error('Tidak bisa menonaktifkan SUPERADMIN aktif terakhir');
    }
  }
  sheet.getRange(rowIndex, 7).setValue(status);
  return { msg: status === 'Aktif' ? 'Pengguna Berhasil Diaktifkan Kembali' : 'Pengguna Berhasil Dinonaktifkan' };
}
```

- [ ] **Step 2: Syntax check**

Run:
```powershell
node --check src/SpreadsheetOps.js
```
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add src/SpreadsheetOps.js
git commit -m "feat(master): backend CRUD akun pengguna (soft-delete + guardrail)"
```

---

### Task 2: Wrappers & payload in Code.js

**Files:**
- Modify: `src/Code.js` (payloads at lines 51–67 and 105–117; wrappers near line 193)

**Interfaces:**
- Consumes: `getAllUsers`, `insertUser`, `updateUser`, `setUserStatus` from Task 1
- Produces:
  - `penggunaList` in `processInitialData` and `getMasterData` responses (empty unless SUPERADMIN)
  - `saveMasterPengguna(data)`, `updateMasterPengguna(data, userInfo)`, `deleteMasterPengguna(userId, userInfo)`, `activateMasterPengguna(userId)`
- Used by: Task 4 client calls, Task 5 verification

- [ ] **Step 1: Add `penggunaList` to both initial-data payloads**

In `processInitialData` (line 51) add after the `flazzCards` line (line 64):

```javascript
    flazzCards: safeList(function() { return getFlazzCards(userInfo.role, userInfo.cabang); }),
    penggunaList: (userInfo.role === 'SUPERADMIN') ? safeList(function() { return getAllUsers(); }) : []
```

In `getMasterData` (line 105) add after the `flazzCards` line (line 114):

```javascript
    flazzCards: safeList(function() { return getFlazzCards(userInfo.role, userInfo.cabang); }),
    penggunaList: (userInfo.role === 'SUPERADMIN') ? safeList(function() { return getAllUsers(); }) : []
```

- [ ] **Step 2: Add wrapper functions**

After `deleteMasterBBM` (line 195) add:

```javascript
function saveMasterPengguna(data) { return insertUser(data); }
function updateMasterPengguna(data, userInfo) { return updateUser(data, userInfo); }
function deleteMasterPengguna(userId, userInfo) { return setUserStatus(userId, 'Non-Aktif', userInfo); }
function activateMasterPengguna(userId) { return setUserStatus(userId, 'Aktif'); }
```

- [ ] **Step 3: Syntax check**

Run:
```powershell
node --check src/Code.js
```
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add src/Code.js
git commit -m "feat(master): wrappers API pengguna + penggunaList hanya untuk superadmin"
```

---

### Task 3: HTML — tab, section, modal in Index.html

**Files:**
- Modify: `src/Index.html` (tab list lines 699–724; section after `master-flazz` line 991)

**Interfaces:**
- Produces: `#master-tabs` button `data-tab="pengguna"`, `#master-pengguna` section with `#list-pengguna`, `#modal-pengguna` form with ids `m_edit_id_pengguna`, `m_username_pengguna`, `m_password_pengguna`, `m_nama_pengguna`, `m_role_pengguna`, `m_cabang_pengguna`, `wrapper-cabang-pengguna`, `btn-save-pengguna`, `form-pengguna`
- Used by: Task 4 handlers

- [ ] **Step 1: Add the Pengguna tab button**

In the `#master-tabs` `<ul>` (line 699–724), after the Flazz `</li>` (line 723), insert:

```html
              <li class='nav-item'>
                <button class='nav-link' onclick='switchMasterTab("pengguna")' data-tab='pengguna'>
                  <i class='bi bi-people me-1'></i> Pengguna
                </button>
              </li>
```

- [ ] **Step 2: Add the master-pengguna section + modal**

After the `master-flazz` section closing `</div>` (line 991) and BEFORE the `</div>` that closes `page-master` (line 993), insert:

```html
            <div class='master-tab-content' id='master-pengguna' style='display:none;'>
              <div class='card mb-3'>
                <div class='card-header d-flex justify-content-between align-items-center'>
                  <div><i class='bi bi-list-ul me-1'></i> Daftar Pengguna</div>
                  <button class='btn btn-sm btn-primary' data-bs-toggle='modal' data-bs-target='#modal-pengguna' onclick='prepareAddPengguna()'>
                    <i class='bi bi-plus-circle me-1'></i> Tambah Pengguna
                  </button>
                </div>
                <div class='card-body p-0'>
                  <div id='list-pengguna' class='list-group list-group-flush'></div>
                </div>
              </div>
            </div>

            <!-- Modal Pengguna -->
            <div class='modal fade' id='modal-pengguna' tabindex='-1'>
              <div class='modal-dialog modal-dialog-centered'>
                <div class='modal-content border-primary'>
                  <div class='modal-header bg-primary text-white'>
                    <h5 class='modal-title'><i class='bi bi-person-plus-fill me-2'></i>Tambah Pengguna</h5>
                    <button type='button' class='btn-close btn-close-white' data-bs-dismiss='modal' aria-label='Close'></button>
                  </div>
                  <div class='modal-body'>
                    <form id='form-pengguna' onsubmit='saveMasterPenggunaForm(); return false;'>
                      <input type='hidden' id='m_edit_id_pengguna'>
                      <div class='mb-3'>
                        <label class='form-label'>Username</label>
                        <input type='text' id='m_username_pengguna' class='form-control' required placeholder='picjkt' autocomplete='off'>
                      </div>
                      <div class='mb-3'>
                        <label class='form-label'>Password <span id='m_password_hint' class='text-muted small fw-normal'></span></label>
                        <input type='password' id='m_password_pengguna' class='form-control' placeholder='Kosongkan saat edit = password lama' autocomplete='new-password'>
                      </div>
                      <div class='mb-3'>
                        <label class='form-label'>Nama Lengkap</label>
                        <input type='text' id='m_nama_pengguna' class='form-control' required placeholder='Budi Santoso'>
                      </div>
                      <div class='mb-3'>
                        <label class='form-label'>Role</label>
                        <select id='m_role_pengguna' class='form-select' onchange='toggleCabangPengguna()'>
                          <option value='PIC CABANG'>PIC CABANG</option>
                          <option value='SUPERADMIN'>SUPERADMIN</option>
                        </select>
                      </div>
                      <div class='mb-3' id='wrapper-cabang-pengguna'>
                        <label class='form-label'>Warehouse</label>
                        <select id='m_cabang_pengguna' class='form-select'>
                          <option value=''>-- Pilih Warehouse --</option>
                        </select>
                      </div>
                      <button type='submit' class='btn btn-primary btn-full' id='btn-save-pengguna'>
                        <i class='bi bi-check-circle me-1'></i> Simpan Pengguna
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/Index.html
git commit -m "feat(master): markup tab & modal Pengguna di Data Master"
```

---

### Task 4: Client logic in js.html

**Files:**
- Modify: `src/js.html` (masterData init line 5; hide-tab block lines 155–164; `loadMasterData` lines 1712–1720; append new functions before file end around line 1906)

**Interfaces:**
- Consumes: `penggunaList` payload from Task 2, `window.masterData.cabang` (list from `processInitialData`), `escapeAttr()`, `showToast()`, `closeBootstrapModal()`, global `userInfo`
- Produces: `renderPenggunaList(users)`, `populateCabangPengguna()`, `toggleCabangPengguna()`, `prepareAddPengguna()`, `prepareEditPengguna(userId)`, `saveMasterPenggunaForm()`, `setPenggunaStatus(userId, status)`
- Used by: Task 3 markup, Task 5 verification

- [ ] **Step 1: Add `pengguna` to the masterData cache initializer**

At line 5 change:

```javascript
  window.masterData = { kendaraan: [], cabang: [], supir: [], bbm: [] };
```
to:
```javascript
  window.masterData = { kendaraan: [], cabang: [], supir: [], bbm: [], pengguna: [] };
```

- [ ] **Step 2: Hide the Pengguna tab for non-SUPERADMIN**

Inside the existing `if (userRole !== 'SUPERADMIN')` block (lines 155–164), after the `btnBBM` lines, add:

```javascript
                let btnPengguna = masterTabs.querySelector('button[data-tab="pengguna"]');
                if (btnPengguna) btnPengguna.parentElement.style.display = 'none';
```

- [ ] **Step 3: Add the `loadMasterData` case**

In `loadMasterData` (lines 1712–1720), after the `bbm` branch, add:

```javascript
        } else if (tab === 'pengguna') {
          renderPenggunaList(data.penggunaList || []);
        }
```

- [ ] **Step 4: Append the render + CRUD functions**

Append at the end of the file (after the last function, e.g. after `renderBBMList`/`deleteMasterCabang` equivalents ~line 1906). Exact code:

```javascript
  function populateCabangPengguna() {
    let sel = document.getElementById('m_cabang_pengguna');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Pilih Warehouse --</option>';
    (window.masterData.cabang || []).forEach(function(c) {
      let opt = document.createElement('option');
      opt.value = c.kode;
      opt.text = c.nama;
      sel.appendChild(opt);
    });
  }

  function toggleCabangPengguna() {
    let wrapper = document.getElementById('wrapper-cabang-pengguna');
    if (!wrapper) return;
    let role = document.getElementById('m_role_pengguna').value;
    let label = wrapper.querySelector('label');
    if (label) label.textContent = role === 'SUPERADMIN' ? 'Warehouse (opsional untuk SUPERADMIN)' : 'Warehouse';
  }

  function prepareAddPengguna() {
    document.getElementById('form-pengguna').reset();
    document.getElementById('m_edit_id_pengguna').value = '';
    document.getElementById('m_password_hint').textContent = '';
    document.getElementById('m_password_pengguna').required = true;
    document.getElementById('m_nama_pengguna').placeholder = 'Budi Santoso';
    populateCabangPengguna();
    document.getElementById('m_role_pengguna').value = 'PIC CABANG';
    toggleCabangPengguna();
    document.getElementById('btn-save-pengguna').innerHTML = '<i class="bi bi-check-circle me-1"></i> Simpan Pengguna';
    document.getElementById('modal-pengguna').querySelector('.modal-title').innerHTML = '<i class="bi bi-person-plus-fill me-2"></i>Tambah Pengguna';
  }

  function prepareEditPengguna(userId) {
    let u = (window.masterData.pengguna || []).find(x => String(x.user_id) === String(userId));
    if (!u) return;
    document.getElementById('form-pengguna').reset();
    document.getElementById('m_edit_id_pengguna').value = u.user_id;
    document.getElementById('m_username_pengguna').value = u.username || '';
    document.getElementById('m_password_pengguna').value = '';
    document.getElementById('m_password_pengguna').required = false;
    document.getElementById('m_password_hint').textContent = '(kosongkan jika password tetap sama)';
    document.getElementById('m_nama_pengguna').value = u.nama || '';
    document.getElementById('m_role_pengguna').value = u.role || 'PIC CABANG';
    populateCabangPengguna();
    document.getElementById('m_cabang_pengguna').value = u.cabang || '';
    toggleCabangPengguna();
    document.getElementById('btn-save-pengguna').innerHTML = '<i class="bi bi-check-circle me-1"></i> Simpan Perubahan';
    document.getElementById('modal-pengguna').querySelector('.modal-title').innerHTML = '<i class="bi bi-pencil-square me-2"></i>Edit Pengguna';
    new bootstrap.Modal(document.getElementById('modal-pengguna')).show();
  }

  function saveMasterPenggunaForm() {
    let editId = document.getElementById('m_edit_id_pengguna').value;
    let data = {
      username: document.getElementById('m_username_pengguna').value.trim(),
      password: document.getElementById('m_password_pengguna').value,
      nama: document.getElementById('m_nama_pengguna').value.trim(),
      role: document.getElementById('m_role_pengguna').value,
      cabang: document.getElementById('m_cabang_pengguna').value
    };
    if (editId) data.user_id = editId;
    let btn = document.getElementById('btn-save-pengguna');
    btn.disabled = true;
    google.script.run
      .withSuccessHandler(function(res) {
        showToast(res.msg, 'success');
        btn.disabled = false;
        loadMasterData('pengguna');
        closeBootstrapModal('modal-pengguna');
      })
      .withFailureHandler(function(err) {
        showToast('Gagal: ' + err.message, 'error');
        btn.disabled = false;
      })[editId ? 'updateMasterPengguna' : 'saveMasterPengguna'](data, userInfo);
  }

  function setPenggunaStatus(userId, status) {
    let u = (window.masterData.pengguna || []).find(x => String(x.user_id) === String(userId));
    let nama = u ? u.nama : 'pengguna ini';
    let toActivate = status === 'Aktif';
    if (!confirm(toActivate ? 'Aktifkan kembali ' + nama + '?' : 'Nonaktifkan ' + nama + '? (akun tidak bisa login)')) return;
    google.script.run
      .withSuccessHandler(function(res) {
        showToast(res.msg, 'success');
        loadMasterData('pengguna');
      })
      .withFailureHandler(function(err) {
        showToast('Gagal: ' + err.message, 'error');
      })[toActivate ? 'activateMasterPengguna' : 'deleteMasterPengguna'](userId, userInfo);
  }

  function renderPenggunaList(users) {
    window.masterData.pengguna = users || [];
    let container = document.getElementById('list-pengguna');
    if (!container) return;
    if (!users || users.length === 0) {
      container.innerHTML = '<div class="list-group-item text-center text-muted py-4">Belum ada data pengguna</div>';
      return;
    }
    container.innerHTML = users.map(function(u) {
      let isSelf = userInfo && String(u.username) === String(userInfo.username);
      let roleBadge = u.role === 'SUPERADMIN'
        ? '<span class="badge bg-warning text-dark">SUPERADMIN</span>'
        : '<span class="badge bg-info text-dark">PIC</span>';
      let statusBadge = u.status === 'Aktif'
        ? '<span class="badge bg-success">Aktif</span>'
        : '<span class="badge bg-secondary">Non-Aktif</span>';
      let inisial = escapeAttr(String(u.nama || '?').charAt(0).toUpperCase());
      let cabangLabel = u.role === 'SUPERADMIN' ? (u.cabang || 'Semua') : (u.cabang || '-');
      let btnStatus = u.status === 'Aktif'
        ? '<button class="btn btn-sm btn-outline-secondary" aria-label="Nonaktifkan pengguna ' + escapeAttr(u.nama) + '" onclick="setPenggunaStatus(\'' + u.user_id + '\',\'Non-Aktif\')"><i class="bi bi-toggle-off"></i></button>'
        : '<button class="btn btn-sm btn-outline-success" aria-label="Aktifkan pengguna ' + escapeAttr(u.nama) + '" onclick="setPenggunaStatus(\'' + u.user_id + '\',\'Aktif\')"><i class="bi bi-toggle-on"></i></button>';
      return '<div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3">' +
        '<div class="d-flex align-items-center">' +
          '<div class="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 48px; height: 48px;">' +
            '<span class="fw-bold fs-6">' + inisial + '</span>' +
          '</div>' +
          '<div>' +
            '<div class="fw-bold mb-1 fs-6">' + escapeAttr(u.nama) + (isSelf ? ' <span class="text-muted small">(Anda)</span>' : '') + '</div>' +
            '<div class="d-flex align-items-center small text-muted flex-wrap">' +
              '<span class="me-2">@' + escapeAttr(u.username) + '</span>' + roleBadge + ' ' + statusBadge +
              '<span class="ms-2"><i class="bi bi-geo-alt me-1"></i>' + escapeAttr(cabangLabel) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<button class="btn btn-sm btn-outline-primary me-2" aria-label="Edit pengguna ' + escapeAttr(u.nama) + '" onclick="prepareEditPengguna(\'' + u.user_id + '\')"><i class="bi bi-pencil"></i></button>' +
          btnStatus +
        '</div>' +
      '</div>';
    }).join('');
  }
```

- [ ] **Step 5: Syntax check the client scripts**

Run:
```powershell
$tmp = "$env:TEMP\pengguna_check"; New-Item -ItemType Directory -Force -Path $tmp | Out-Null; Get-ChildItem $tmp -Filter *.js | Remove-Item -Force
$i = 0
foreach ($f in @('src/Index.html','src/js.html')) {
  $c = Get-Content -LiteralPath $f -Raw
  [regex]::Matches($c, '(?is)<script(?![^>]*src=)[^>]*>(.*?)</script>') | ForEach-Object {
    $i++
    $name = "$tmp\$([IO.Path]::GetFileNameWithoutExtension($f))_$i.js"
    Set-Content -LiteralPath $name -Value $_.Groups[1].Value -Encoding UTF8
    Write-Output "EXTRACTED: $name ($(($_.Groups[1].Value).Length) chars)"
  }
}
foreach ($f in (Get-ChildItem $tmp -Filter *.js)) { node --check $f.FullName; if ($LASTEXITCODE -ne 0) { exit 1 } }
Write-Output "SYNTAX OK"
```
Expected: prints `EXTRACTED:` lines, then `SYNTAX OK`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/js.html
git commit -m "feat(master): render + CRUD tab Pengguna di sisi client"
```

---

### Task 5: Manual verification (deploy with clasp)

**Files:**
- Deploy: `src/` via clasp (follow README: `cd src; clasp push; clasp deploy`)

- [ ] **Step 1: Deploy**

```bash
cd src
clasp push
clasp deploy -d "tab Pengguna CRUD"
```

- [ ] **Step 2: Browser test — visibility**

Login as SUPERADMIN → Data Master → tab **Pengguna** visible. Login as PIC CABANG → Data Master → tab **Pengguna** NOT visible (Warehouse/BBM/Pengguna hidden).

- [ ] **Step 3: Browser test — create**

As SUPERADMIN, Pengguna tab → **Tambah Pengguna** → fill username/password/nama, role PIC CABANG + Warehouse → Save. Toast success; new account appears in list.

- [ ] **Step 4: Browser test — created account can log in**

Logout → login with the new account (username + password set in Step 3) → success. If role PIC CABANG, only that warehouse's data visible.

- [ ] **Step 5: Browser test — duplicate username rejected**

Add user with same username again → toast error "Username sudah terpakai".

- [ ] **Step 6: Browser test — edit (password kept when blank)**

Edit the new account → change nama only, leave password blank → Save. Logout, login with same (old) password → still works.

- [ ] **Step 7: Browser test — soft delete & reactivate**

Nonaktifkan the account → not in ? It should stay in list with badge `Non-Aktif`. Try login with it → rejected ("Username atau Password salah"). Aktifkan kembali → login works again.

- [ ] **Step 8: Browser test — guardrails**

Aks SUPERADMIN terakhir ("snd" if only one active): try nonaktifkan akun sendiri → toast error "Tidak bisa menonaktifkan akun sendiri". Try nonaktifkan SUPERADMIN lain (when it would leave 0 active) → toast error. Edit akun SUPERADMIN terakhir mengubah role → toast error.

---

## Self-Review Checklist

1. **Spec coverage**: tab superadmin-only ✓ (Task 4 Step 2, Task 2 payload); create ✓ (Task 1 `insertUser`, Task 3 modal, Task 4 form); edit ✓ (`updateUser` + `prepareEditPengguna`); soft-delete + reactivate ✓ (`setUserStatus`, `deleteMasterPengguna`/`activateMasterPengguna`, toggle buttons); no password leak ✓ (`getAllUsers` omits password); unique username ✓ (`getUserByUsername`); guards ✓ (self-deactivate + last-superadmin).
2. **Placeholder scan**: No TBD/TODO; every code step has exact code.
3. **Type consistency**: `getAllUsers` returns same shape consumed by `renderPenggunaList` (`user_id, username, nama, role, cabang, status`). Wrapper names match client ternary calls: `saveMasterPengguna`, `updateMasterPengguna`, `deleteMasterPengguna`, `activateMasterPengguna`. `deleteMasterPengguna(userId, userInfo)` and `activateMasterPengguna(userId)` match `setPenggunaStatus` calls. `userInfo` global exists in js.html.
4. **Backend reuses** `getDB()`; no schema migration needed (`setupDatabase` unchanged).
5. **No unrelated refactors** — only the feature's touch points.