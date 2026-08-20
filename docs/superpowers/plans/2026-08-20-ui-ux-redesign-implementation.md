# UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement mobile-first UI/UX redesign for Sistem Monitoring BBM & Operasional Harian using Bootstrap Mobile-First Refactor approach.

**Architecture:** Refactor existing Google Apps Script web app to be mobile-first with card-based layout, bottom navigation bar, configurable logo, and improved user experience. Maintain all existing features while adding modern UI components.

**Tech Stack:** Bootstrap 5.3.0, Custom CSS (mobile-first), Bootstrap Icons, Google Apps Script (HTML Service)

## Global Constraints

- Platform: Google Apps Script Web App
- Database: Google Sheets (existing structure, add Pengaturan sheet)
- Framework: Bootstrap 5.3.0 (existing)
- Maintain all existing features from README.md
- Mobile-first approach with responsive breakpoints
- Touch targets minimum 44px x 44px
- Input font-size 16px to prevent iOS zoom
- No external dependencies beyond Bootstrap

---

## File Structure

### Files to Modify
- `src/Index.html` - Main HTML structure, add bottom nav, restructure layout
- `src/css.html` - Mobile-first CSS styles, responsive design
- `src/js.html` - Navigation logic, settings API, enhanced dashboard

### Files to Create
- `src/Settings.html` - Settings page HTML (Superadmin only)
- `src/settings.js` - Settings page JavaScript logic

### Files to Read (Reference)
- `README.md` - Source of truth for features and structure
- `docs/superpowers/specs/2026-08-20-ui-ux-redesign-design.md` - Design specification

---

## Task 1: Setup & Database Changes

**Files:**
- Modify: `src/DatabaseSetup.gs`
- Create: `src/Pengaturan_Sheet_Test.gs` (temporary for testing)

**Interfaces:**
- Consumes: None (first task)
- Produces: `getAppSettings()`, `saveAppSettings()`, `uploadLogo()` functions

- [ ] **Step 1: Read existing DatabaseSetup.gs**

Read `src/DatabaseSetup.gs` to understand current database structure.

- [ ] **Step 2: Add Pengaturan sheet setup to setupDatabase function**

Open `src/DatabaseSetup.gs` and add the following to the `setupDatabase` function:

```javascript
// Add after existing sheet setups
var ss = SpreadsheetApp.getActiveSpreadsheet();

// Create Pengaturan sheet if not exists
var settingsSheet = ss.getSheetByName('Pengaturan');
if (!settingsSheet) {
  settingsSheet = ss.insertSheet('Pengaturan');
  settingsSheet.appendRow(['key', 'value', 'updated_at']);
  
  // Add default settings
  settingsSheet.appendRow(['logo_url', '', new Date().toISOString()]);
  settingsSheet.appendRow(['app_name', 'Monitoring BBM Operasional', new Date().toISOString()]);
  settingsSheet.appendRow(['company_name', '', new Date().toISOString()]);
  settingsSheet.appendRow(['footer_text', '', new Date().toISOString()]);
  
  // Format header
  settingsSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
  settingsSheet.setColumnWidth(1, 150);
  settingsSheet.setColumnWidth(2, 300);
  settingsSheet.setColumnWidth(3, 200);
}
```

- [ ] **Step 3: Run setupDatabase to create Pengaturan sheet**

In Google Apps Script Editor, select `setupDatabase` function and run it.
Expected: Pengaturan sheet created with default values.

- [ ] **Step 4: Create getAppSettings function**

Add to `src/DatabaseSetup.gs`:

```javascript
function getAppSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Pengaturan');
  
  if (!sheet) {
    return {
      logo_url: '',
      app_name: 'Monitoring BBM Operasional',
      company_name: '',
      footer_text: ''
    };
  }
  
  var data = sheet.getDataRange().getValues();
  var settings = {};
  
  for (var i = 1; i < data.length; i++) {
    settings[data[i][0]] = data[i][1];
  }
  
  return {
    logo_url: settings.logo_url || '',
    app_name: settings.app_name || 'Monitoring BBM Operasional',
    company_name: settings.company_name || '',
    footer_text: settings.footer_text || ''
  };
}
```

- [ ] **Step 5: Create saveAppSettings function**

Add to `src/DatabaseSetup.gs`:

```javascript
function saveAppSettings(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Pengaturan');
  
  if (!sheet) {
    return { success: false, msg: 'Sheet Pengaturan tidak ditemukan' };
  }
  
  var updates = {
    'logo_url': data.logo_url || '',
    'app_name': data.app_name || 'Monitoring BBM Operasional',
    'company_name': data.company_name || '',
    'footer_text': data.footer_text || ''
  };
  
  var range = sheet.getDataRange();
  var values = range.getValues();
  
  for (var key in updates) {
    var found = false;
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(updates[key]);
        sheet.getRange(i + 1, 3).setValue(new Date().toISOString());
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, updates[key], new Date().toISOString()]);
    }
  }
  
  return { success: true, msg: 'Pengaturan berhasil disimpan' };
}
```

- [ ] **Step 6: Create uploadLogo function**

Add to `src/DatabaseSetup.gs`:

```javascript
function uploadLogo(base64Data, fileName) {
  try {
    // Decode base64
    var data = base64Data.split(',')[1];
    var blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/png', fileName);
    
    // Upload to Google Drive
    var folder = DriveApp.getFoldersByName('BBM_Logos');
    if (!folder.hasNext()) {
      folder = DriveApp.createFolder('BBM_Logos');
    } else {
      folder = folder.next();
    }
    
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var fileUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();
    
    // Save URL to settings
    saveAppSettings({ logo_url: fileUrl });
    
    return { success: true, url: fileUrl };
  } catch (e) {
    return { success: false, msg: 'Gagal upload logo: ' + e.toString() };
  }
}
```

- [ ] **Step 7: Test functions**

Test each function in Google Apps Script Editor:
1. Run `getAppSettings()` - should return default settings
2. Run `saveAppSettings({app_name: 'Test'})` - should update sheet
3. Verify changes in Pengaturan sheet

- [ ] **Step 8: Commit database changes**

```bash
git add src/DatabaseSetup.gs
git commit -m "feat: add Pengaturan sheet and settings API functions"
```

---

## Task 2: CSS Mobile-First Foundation

**Files:**
- Modify: `src/css.html`

**Interfaces:**
- Consumes: None
- Produces: CSS classes for mobile-first design, bottom navigation, cards, responsive breakpoints

- [ ] **Step 1: Read existing css.html**

Read `src/css.html` to understand current styles.

- [ ] **Step 2: Add CSS Reset and Base Styles**

Open `src/css.html` and replace content with:

```html
<link href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css' rel='stylesheet'>
<link href='https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css' rel='stylesheet'>
<style>
  /* CSS Reset and Base */
  * {
    box-sizing: border-box;
  }
  
  body {
    background-color: #f8f9fa;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }
  
  /* Typography */
  h1 { font-size: 2rem; font-weight: 700; }
  h2 { font-size: 1.5rem; font-weight: 600; }
  h3 { font-size: 1.25rem; font-weight: 600; }
  h4 { font-size: 1.125rem; font-weight: 600; }
  h5 { font-size: 1rem; font-weight: 600; }
  
  /* Cards */
  .card {
    background: white;
    border: none;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    margin-bottom: 16px;
    overflow: hidden;
  }
  
  .card-header {
    background: white;
    border-bottom: 1px solid #e9ecef;
    padding: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .card-body {
    padding: 16px;
  }
  
  /* Form Elements */
  .form-label {
    font-weight: 500;
    color: #495057;
    margin-bottom: 6px;
    font-size: 14px;
  }
  
  .form-control, .form-select {
    height: 48px;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    font-size: 16px;
    padding: 8px 12px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  
  .form-control:focus, .form-select:focus {
    border-color: #0d6efd;
    box-shadow: 0 0 0 3px rgba(13,110,253,0.15);
    outline: none;
  }
  
  .form-control::placeholder {
    color: #adb5bd;
  }
  
  /* Buttons */
  .btn {
    height: 48px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 16px;
    padding: 0 24px;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  
  .btn:active {
    transform: scale(0.98);
  }
  
  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .btn-primary {
    background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%);
    border: none;
  }
  
  .btn-primary:hover {
    background: linear-gradient(135deg, #0b5ed7 0%, #0a4bc4 100%);
  }
  
  .btn-success {
    background: linear-gradient(135deg, #198754 0%, #157347 100%);
    border: none;
  }
  
  .btn-danger {
    background: linear-gradient(135deg, #dc3545 0%, #bb2d3b 100%);
    border: none;
  }
  
  .btn-outline-secondary {
    border: 1px solid #6c757d;
    color: #6c757d;
    background: transparent;
  }
  
  .btn-full {
    width: 100%;
  }
  
  .btn-lg {
    height: 52px;
    font-size: 16px;
  }
  
  /* Section Title */
  .section-title {
    font-size: 1rem;
    font-weight: 600;
    color: #495057;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid #0d6efd;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  /* Toggle Buttons (Ya/Tidak) */
  .toggle-group {
    display: flex;
    gap: 8px;
  }
  
  .toggle-btn {
    flex: 1;
    height: 44px;
    border: 2px solid #dee2e6;
    border-radius: 8px;
    background: white;
    font-weight: 500;
    color: #6c757d;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .toggle-btn.active {
    background: #0d6efd;
    border-color: #0d6efd;
    color: white;
  }
  
  /* Photo Upload Area */
  .photo-upload {
    border: 2px dashed #dee2e6;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    background: #f8f9fa;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  
  .photo-upload:hover {
    border-color: #0d6efd;
    background: #e7f1ff;
  }
  
  .photo-upload.has-image {
    border-style: solid;
    border-color: #198754;
    background: #d1e7dd;
  }
  
  .photo-upload i {
    font-size: 32px;
    color: #adb5bd;
  }
  
  .photo-upload.has-image i {
    color: #198754;
  }
  
  .photo-upload span {
    font-size: 14px;
    color: #6c757d;
  }
  
  /* Stats Box */
  .stats-box {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }
  
  .stats-box .stats-label {
    font-size: 12px;
    color: #6c757d;
    margin-bottom: 4px;
  }
  
  .stats-box .stats-value {
    font-size: 16px;
    font-weight: 600;
    color: #212529;
  }
  
  /* Summary Box */
  .summary-box {
    background: #e7f1ff;
    border: 1px solid #b6d4fe;
    border-radius: 8px;
    padding: 16px;
  }
  
  .summary-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 14px;
  }
  
  .summary-row:last-child {
    margin-bottom: 0;
  }
  
  .summary-total {
    border-top: 2px solid #0d6efd;
    padding-top: 8px;
    margin-top: 8px;
    font-weight: 700;
    font-size: 18px;
    color: #0d6efd;
  }
  
  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 48px 24px;
  }
  
  .empty-state i {
    font-size: 64px;
    color: #adb5bd;
    margin-bottom: 16px;
  }
  
  .empty-state h5 {
    color: #6c757d;
    margin-bottom: 8px;
  }
  
  .empty-state p {
    color: #adb5bd;
    font-size: 14px;
  }
  
  /* Toast Notifications */
  .toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 9999;
  }
  
  @media (max-width: 768px) {
    .toast-container {
      top: 16px;
      left: 16px;
      right: 16px;
    }
  }
  
  .toast {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 16px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideIn 0.3s ease;
  }
  
  .toast.success {
    border-left: 4px solid #198754;
  }
  
  .toast.error {
    border-left: 4px solid #dc3545;
  }
  
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  /* Skeleton Loading */
  .skeleton {
    background: linear-gradient(90deg, #e9ecef 25%, #dee2e6 50%, #e9ecef 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }
  
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  
  /* Loading Overlay */
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255,255,255,0.9);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 16px;
  }
  
  .loading-overlay .spinner-border {
    width: 48px;
    height: 48px;
  }
  
  /* Desktop: Hide bottom nav, show top tabs */
  @media (min-width: 769px) {
    .bottom-nav {
      display: none !important;
    }
    
    .top-tabs {
      display: flex !important;
    }
  }
  
  /* Mobile: Show bottom nav, hide top tabs */
  @media (max-width: 768px) {
    .bottom-nav {
      display: flex;
    }
    
    .top-tabs {
      display: none !important;
    }
    
    /* Add padding bottom for fixed bottom nav */
    #main-app {
      padding-bottom: 80px;
    }
    
    /* Full width cards on mobile */
    .card {
      margin-left: -16px;
      margin-right: -16px;
      border-radius: 0;
    }
  }
</style>
```

- [ ] **Step 3: Verify CSS loads correctly**

Open the web app in browser and check:
1. Bootstrap loads (check Network tab)
2. Bootstrap Icons load
3. Custom CSS applies (check Elements tab)

- [ ] **Step 4: Commit CSS changes**

```bash
git add src/css.html
git commit -m "feat: add mobile-first CSS foundation with cards, forms, and responsive breakpoints"
```

---

## Task 3: Navigation Component (Bottom Nav + Top Tabs)

**Files:**
- Modify: `src/Index.html`
- Modify: `src/js.html`

**Interfaces:**
- Consumes: CSS classes from Task 2
- Produces: `switchTab()` function, navigation state management

- [ ] **Step 1: Read existing Index.html and js.html**

Read both files to understand current navigation structure.

- [ ] **Step 2: Add Bottom Navigation HTML**

Open `src/Index.html` and add the following before the closing `</div>` of `#main-app`:

```html
<!-- BOTTOM NAVIGATION (Mobile) -->
<nav class='bottom-nav fixed-bottom bg-white border-top d-md-none' id='bottom-nav' style='display:none;'>
  <div class='d-flex justify-content-around align-items-center h-100'>
    <button class='btn-nav active' onclick='switchTab("form")' data-tab='form'>
      <i class='bi bi-pencil-square'></i>
      <span>Input</span>
    </button>
    <button class='btn-nav' onclick='switchTab("dashboard")' data-tab='dashboard'>
      <i class='bi bi-clock-history'></i>
      <span>History</span>
    </button>
    <button class='btn-nav' onclick='switchTab("master")' data-tab='master' id='btn-nav-master' style='display:none;'>
      <i class='bi bi-gear'></i>
      <span>Master</span>
    </button>
    <button class='btn-nav' onclick='switchTab("settings")' data-tab='settings' id='btn-nav-settings' style='display:none;'>
      <i class='bi bi-sliders'></i>
      <span>Pengaturan</span>
    </button>
  </div>
</nav>

<!-- TOP TABS (Desktop) -->
<ul class='nav nav-pills mb-4 shadow-sm p-2 bg-white rounded top-tabs d-none d-md-flex' id='menu-tabs'>
  <li class='nav-item'>
    <a class='nav-link active' id='tab-form' href='#' onclick='switchTab("form")'>
      <i class='bi bi-pencil-square me-1'></i> Input Laporan
    </a>
  </li>
  <li class='nav-item'>
    <a class='nav-link' id='tab-dashboard' href='#' onclick='switchTab("dashboard")'>
      <i class='bi bi-clock-history me-1'></i> History Laporan
    </a>
  </li>
  <li class='nav-item d-none' id='nav-master'>
    <a class='nav-link bg-warning text-dark fw-bold ms-2' id='tab-master' href='#' onclick='switchTab("master")'>
      <i class='bi bi-database me-1'></i> Data Master
    </a>
  </li>
  <li class='nav-item d-none' id='nav-settings'>
    <a class='nav-link bg-info text-dark fw-bold ms-2' id='tab-settings' href='#' onclick='switchTab("settings")'>
      <i class='bi bi-sliders me-1'></i> Pengaturan
    </a>
  </li>
</ul>
```

- [ ] **Step 3: Add Bottom Navigation CSS**

Add to `src/css.html` before closing `</style>`:

```css
/* Bottom Navigation */
.bottom-nav {
  height: 64px;
  z-index: 1000;
}

.btn-nav {
  background: none;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  color: #6c757d;
  font-size: 12px;
  gap: 4px;
  transition: all 0.2s;
  cursor: pointer;
}

.btn-nav i {
  font-size: 20px;
}

.btn-nav.active {
  color: #0d6efd;
}

.btn-nav.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 3px;
  background: #0d6efd;
  border-radius: 3px 3px 0 0;
}

.btn-nav:hover {
  color: #0d6efd;
}
```

- [ ] **Step 4: Update switchTab function in js.html**

Open `src/js.html` and replace the existing `switchTab` function:

```javascript
function switchTab(tab) {
  // Hide all pages
  document.getElementById('page-form').style.display = 'none';
  document.getElementById('page-dashboard').style.display = 'none';
  document.getElementById('page-master').style.display = 'none';
  
  // Show selected page
  if (tab === 'form') {
    document.getElementById('page-form').style.display = 'block';
  } else if (tab === 'dashboard') {
    document.getElementById('page-dashboard').style.display = 'block';
  } else if (tab === 'master') {
    document.getElementById('page-master').style.display = 'block';
  }
  
  // Update top tabs
  document.querySelectorAll('.top-tabs .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  if (document.getElementById('tab-' + tab)) {
    document.getElementById('tab-' + tab).classList.add('active');
  }
  
  // Update bottom nav
  document.querySelectorAll('.btn-nav').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector('.btn-nav[data-tab="' + tab + '"]')?.classList.add('active');
  
  // Load dashboard data if needed
  if (tab === 'dashboard') loadDashboard();
}
```

- [ ] **Step 5: Test navigation**

Test in browser:
1. Mobile view (< 768px): Bottom nav visible, top tabs hidden
2. Desktop view (> 768px): Top tabs visible, bottom nav hidden
3. Tab switching works correctly
4. Active state updates properly

- [ ] **Step 6: Commit navigation changes**

```bash
git add src/Index.html src/js.html src/css.html
git commit -m "feat: add bottom navigation bar for mobile and top tabs for desktop"
```

---

## Task 4: Login Page with Configurable Logo

**Files:**
- Modify: `src/Index.html`
- Modify: `src/js.html`

**Interfaces:**
- Consumes: `getAppSettings()` from Task 1, CSS classes from Task 2
- Produces: Login page with logo, `loadInitialData()` updated to fetch settings

- [ ] **Step 1: Read current login page structure**

Read `src/Index.html` to understand current login form.

- [ ] **Step 2: Update Login Page HTML**

Open `src/Index.html` and replace the login page section:

```html
<!-- HALAMAN LOGIN -->
<div class='container mt-4 mt-md-5' id='page-login' style='display:none;'>
  <div class='row justify-content-center'>
    <div class='col-12 col-md-5 col-lg-4'>
      <div class='card shadow-sm'>
        <div class='card-body p-4'>
          <!-- Logo Section -->
          <div class='text-center mb-4'>
            <div id='login-logo' class='mb-3'>
              <i class='bi bi-fuel-pump' style='font-size: 64px; color: #0d6efd;'></i>
            </div>
            <h4 class='mb-1' id='login-app-name'>Monitoring BBM Operasional</h4>
            <small class='text-muted' id='login-company-name'></small>
          </div>
          
          <!-- Login Form -->
          <form id='login-form' onsubmit='handleLogin(); return false;'>
            <div class='mb-3'>
              <label class='form-label'>Username</label>
              <div class='input-group'>
                <span class='input-group-text bg-light'><i class='bi bi-person'></i></span>
                <input type='text' id='login_username' class='form-control' placeholder='Masukkan username' required>
              </div>
            </div>
            <div class='mb-4'>
              <label class='form-label'>Password</label>
              <div class='input-group'>
                <span class='input-group-text bg-light'><i class='bi bi-lock'></i></span>
                <input type='password' id='login_password' class='form-control' placeholder='Masukkan password' required>
              </div>
            </div>
            <button type='submit' class='btn btn-primary btn-full btn-lg' id='btn-login'>
              <i class='bi bi-box-arrow-in-right me-2'></i> Masuk
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Update loadInitialData to fetch settings**

Open `src/js.html` and update the `loadInitialData` function to fetch and apply settings:

```javascript
function loadInitialData(uInfo) {
  document.getElementById('page-login').style.display = 'none';
  
  let btn = document.getElementById('btn-login');
  if(btn) btn.innerText = 'Memuat Data...';

  google.script.run
    .withFailureHandler(function(err) {
       alert('Terjadi kesalahan server: ' + err.message);
       logout();
    })
    .withSuccessHandler(function(data) {
      if (data.error) {
         logout();
         return;
      }

      document.getElementById('main-app').style.display = 'block';
      
      userRole = data.role;
      document.getElementById('user-info').innerHTML = data.user + ' (' + userRole + ' - ' + data.cabang + ') <a href="#" onclick="logout()" class="text-warning ms-2">Logout</a>';
      
      // Show/hide navigation based on role
      if (userRole === 'SUPERADMIN') {
        document.getElementById('nav-master').classList.remove('d-none');
        document.getElementById('nav-settings').classList.remove('d-none');
        document.getElementById('btn-nav-master').style.display = 'flex';
        document.getElementById('btn-nav-settings').style.display = 'flex';
      }
      
      // Set role alert
      let roleAlert = document.getElementById('role-alert');
      if (userRole === 'SUPERADMIN') {
        if(roleAlert) {
           roleAlert.className = 'alert alert-warning text-center';
           roleAlert.innerHTML = '<small><i class="bi bi-shield-check me-1"></i> Anda login sebagai SUPERADMIN. Akses penuh ke seluruh cabang.</small>';
        }
      } else {
        if(roleAlert) {
           roleAlert.className = 'alert alert-info text-center';
           roleAlert.innerHTML = '<small><i class="bi bi-info-circle me-1"></i> Anda login sebagai ' + userRole + '. Cabang: ' + data.cabang + '</small>';
        }
      }

      // Populate dropdowns
      let selectVeh = document.getElementById('vehicle');
      selectVeh.innerHTML = ''; 
      data.vehicles.forEach(v => {
        let opt = document.createElement('option');
        opt.value = v.vehicle_id;
        opt.text = v.plat_nomor + ' - ' + v.nama;
        selectVeh.appendChild(opt);
      });
      
      let selectSupir = document.getElementById('nama_supir');
      selectSupir.innerHTML = '';
      if (data.drivers) {
        data.drivers.forEach(d => {
          let opt = document.createElement('option');
          opt.value = d.nama;
          opt.text = d.nama + ' (' + d.id + ')';
          selectSupir.appendChild(opt);
        });
      }

      let selectCabang = document.getElementById('m_cabang');
      let selectCabangSupir = document.getElementById('m_cabang_supir');
      if (selectCabang) {
         selectCabang.innerHTML = '';
         if(selectCabangSupir) selectCabangSupir.innerHTML = '';
         
         data.cabangList.forEach(c => {
           let opt = document.createElement('option');
           opt.value = c.kode;
           opt.text = c.nama;
           selectCabang.appendChild(opt);
           
           if(selectCabangSupir) {
             let opt2 = document.createElement('option');
             opt2.value = c.kode;
             opt2.text = c.nama;
             selectCabangSupir.appendChild(opt2);
           }
         });
      }

      let selectBBM = document.getElementById('jenis_bbm');
      if (selectBBM && data.bbmList) {
        selectBBM.innerHTML = '<option value="">-- Pilih BBM --</option>';
        data.bbmList.forEach(b => {
           let opt = document.createElement('option');
           opt.value = b.harga;
           opt.text = b.jenis + ' (Rp ' + b.harga + '/L)';
           opt.dataset.jenis = b.jenis;
           selectBBM.appendChild(opt);
        });
      }

      switchTab('form');
    })
    .processInitialData(uInfo);
}

function loadAppSettings() {
  google.script.run
    .withSuccessHandler(function(settings) {
      // Update login logo
      if (settings.logo_url) {
        document.getElementById('login-logo').innerHTML = 
          '<img src="' + settings.logo_url + '" alt="Logo" style="max-height: 100px; max-width: 200px;">';
      }
      
      // Update app name
      if (settings.app_name) {
        document.getElementById('login-app-name').innerText = settings.app_name;
        document.querySelector('.navbar-brand').innerText = settings.app_name;
      }
      
      // Update company name
      if (settings.company_name) {
        document.getElementById('login-company-name').innerText = settings.company_name;
      }
    })
    .getAppSettings();
}

document.addEventListener('DOMContentLoaded', function() {
  ocrModal = new bootstrap.Modal(document.getElementById('ocrModal'));
  document.getElementById('tanggal').valueAsDate = new Date();
  
  // Load app settings for login page
  loadAppSettings();
  
  // Check LocalStorage
  let storedUser = localStorage.getItem('bbm_user');
  if (storedUser) {
     userInfo = JSON.parse(storedUser);
     loadInitialData(userInfo);
  } else {
     // Show Login
     document.getElementById('page-login').style.display = 'block';
  }
});
```

- [ ] **Step 4: Test login page**

Test in browser:
1. Login page displays with default icon (no logo uploaded)
2. After uploading logo, login page shows logo
3. App name updates from settings
4. Login functionality works

- [ ] **Step 5: Commit login page changes**

```bash
git add src/Index.html src/js.html
git commit -m "feat: add login page with configurable logo and app name"
```

---

## Task 5: Input Form Card-Based Layout

**Files:**
- Modify: `src/Index.html`
- Modify: `src/css.html`

**Interfaces:**
- Consumes: CSS classes from Task 2
- Produces: Card-based form layout, photo upload components

- [ ] **Step 1: Read current form structure**

Read `src/Index.html` to understand current form layout.

- [ ] **Step 2: Update Input Form HTML**

Open `src/Index.html` and replace the form page section:

```html
<!-- HALAMAN 1: FORMULIR INPUT -->
<div id='page-form' style='display:none;'>
  <div class='card mb-4'>
    <div class='card-body p-4'>
      <h4 class='text-center mb-3'>
        <i class='bi bi-pencil-square me-2'></i> Laporan Operasional Harian
      </h4>
      <div id='role-alert' class='alert alert-info text-center'>
        <small>Anda login sebagai PIC Cabang. Anda hanya memasukkan laporan untuk kendaraan dan supir di cabang Anda.</small>
      </div>
      
      <form id='daily-form' onsubmit='return false;'>
        
        <!-- Card 1: Data Kendaraan & Supir -->
        <div class='card mb-3'>
          <div class='card-header'>
            <i class='bi bi-car-front text-primary'></i>
            <span>Data Kendaraan & Supir</span>
          </div>
          <div class='card-body'>
            <div class='mb-3'>
              <label class='form-label'>Pilih Kendaraan</label>
              <select id='vehicle' class='form-select' required></select>
            </div>
            <div class='mb-3'>
              <label class='form-label'>Nama Supir</label>
              <select id='nama_supir' class='form-select' required></select>
            </div>
            <div class='mb-0'>
              <label class='form-label'>Tanggal Operasional</label>
              <input type='date' id='tanggal' class='form-control' required>
            </div>
          </div>
        </div>
        
        <!-- Card 2: Keberangkatan (Awal) -->
        <div class='card mb-3'>
          <div class='card-header'>
            <i class='bi bi-arrow-right-circle text-primary'></i>
            <span>Keberangkatan (Awal)</span>
          </div>
          <div class='card-body'>
            <div class='mb-3'>
              <label class='form-label'>Bar Bensin Awal</label>
              <input type='number' id='bar_awal' class='form-control' min='0' required placeholder='Misal: 8'>
            </div>
            <div class='mb-0'>
              <label class='form-label'>Foto Dasbor Awal</label>
              <div class='photo-upload' onclick='document.getElementById("foto_odo_awal").click()'>
                <i class='bi bi-camera'></i>
                <span>Tap untuk upload foto</span>
                <input type='file' id='foto_odo_awal' accept='image/*' required style='display:none;' onchange='previewPhoto(this, "preview-awal")'>
              </div>
              <div id='preview-awal' class='mt-2' style='display:none;'>
                <img src='' alt='Preview' style='max-width: 100%; border-radius: 8px;'>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Card 3: Kepulangan (Akhir) -->
        <div class='card mb-3'>
          <div class='card-header'>
            <i class='bi bi-arrow-left-circle text-success'></i>
            <span>Kepulangan (Akhir)</span>
          </div>
          <div class='card-body'>
            <div class='mb-3'>
              <label class='form-label'>Bar Bensin Akhir</label>
              <input type='number' id='bar_akhir' class='form-control' min='0' required placeholder='Misal: 5'>
            </div>
            <div class='mb-0'>
              <label class='form-label'>Foto Dasbor Akhir</label>
              <div class='photo-upload' onclick='document.getElementById("foto_odo_akhir").click()'>
                <i class='bi bi-camera'></i>
                <span>Tap untuk upload foto</span>
                <input type='file' id='foto_odo_akhir' accept='image/*' required style='display:none;' onchange='previewPhoto(this, "preview-akhir")'>
              </div>
              <div id='preview-akhir' class='mt-2' style='display:none;'>
                <img src='' alt='Preview' style='max-width: 100%; border-radius: 8px;'>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Card 4: Pengeluaran BBM (Opsional) -->
        <div class='card mb-3'>
          <div class='card-header'>
            <i class='bi bi-fuel-pump text-warning'></i>
            <span>Pengeluaran BBM (Opsional)</span>
          </div>
          <div class='card-body'>
            <div class='mb-3'>
              <label class='form-label'>Ada struk BBM hari ini?</label>
              <div class='toggle-group'>
                <button type='button' class='toggle-btn active' onclick='toggleBBM("Tidak", this)'>Tidak</button>
                <button type='button' class='toggle-btn' onclick='toggleBBM("Ya", this)'>Ya</button>
              </div>
              <input type='hidden' id='isi_bensin' value='Tidak'>
            </div>
            <div id='bbm-section' style='display:none;'>
              <div class='mb-3'>
                <label class='form-label'>Jenis BBM</label>
                <select id='jenis_bbm' class='form-select' onchange='calcBBM()'></select>
              </div>
              <div class='mb-3'>
                <label class='form-label'>Jumlah Liter BBM</label>
                <input type='number' id='liter_bbm' class='form-control' step='0.01' oninput='calcBBM()'>
              </div>
              <div class='mb-3'>
                <label class='form-label'>Total Biaya BBM (Rp)</label>
                <input type='number' id='biaya_bbm' class='form-control' readonly>
              </div>
              <div class='mb-0'>
                <label class='form-label'>Foto Struk BBM</label>
                <div class='photo-upload' onclick='document.getElementById("foto_struk_bbm").click()'>
                  <i class='bi bi-receipt'></i>
                  <span>Tap untuk upload struk</span>
                  <input type='file' id='foto_struk_bbm' accept='image/*' style='display:none;'>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Card 5: Toll (Opsional) -->
        <div class='card mb-3'>
          <div class='card-header'>
            <i class='bi bi-signpost-2 text-info'></i>
            <span>Toll (Opsional)</span>
          </div>
          <div class='card-body'>
            <div class='mb-3'>
              <label class='form-label'>Ada struk Toll hari ini?</label>
              <div class='toggle-group'>
                <button type='button' class='toggle-btn active' onclick='toggleToll("Tidak", this)'>Tidak</button>
                <button type='button' class='toggle-btn' onclick='toggleToll("Ya", this)'>Ya</button>
              </div>
              <input type='hidden' id='isi_toll' value='Tidak'>
            </div>
            <div id='toll-section' style='display:none;'>
              <div class='mb-3'>
                <label class='form-label'>Total Biaya Toll (Rp)</label>
                <input type='number' id='biaya_toll' class='form-control'>
              </div>
              <div class='mb-0'>
                <label class='form-label'>Foto Struk Toll</label>
                <div class='photo-upload' onclick='document.getElementById("foto_struk_toll").click()'>
                  <i class='bi bi-receipt'></i>
                  <span>Tap untuk upload struk</span>
                  <input type='file' id='foto_struk_toll' accept='image/*' style='display:none;'>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Submit Button -->
        <button id='btn-process' class='btn btn-primary btn-full btn-lg mt-3' onclick='processDailyReport()'>
          <i class='bi bi-camera me-2'></i> Proses Foto & Simpan
        </button>
      </form>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add previewPhoto function**

Add to `src/js.html`:

```javascript
function previewPhoto(input, previewId) {
  if (input.files && input.files[0]) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var previewDiv = document.getElementById(previewId);
      previewDiv.style.display = 'block';
      previewDiv.querySelector('img').src = e.target.result;
      
      // Update upload area style
      input.closest('.photo-upload').classList.add('has-image');
      input.closest('.photo-upload').querySelector('span').textContent = 'Foto sudah dipilih';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function toggleBBM(value, btn) {
  document.getElementById('isi_bensin').value = value;
  document.getElementById('bbm-section').style.display = (value === 'Ya') ? 'block' : 'none';
  
  // Update button states
  btn.parentElement.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function toggleToll(value, btn) {
  document.getElementById('isi_toll').value = value;
  document.getElementById('toll-section').style.display = (value === 'Ya') ? 'block' : 'none';
  
  // Update button states
  btn.parentElement.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
```

- [ ] **Step 4: Update calcBBM function**

Update the existing `calcBBM` function in `src/js.html`:

```javascript
function calcBBM() {
  let sel = document.getElementById('jenis_bbm');
  let hrg = parseFloat(sel.value) || 0;
  let lit = parseFloat(document.getElementById('liter_bbm').value) || 0;
  let total = (hrg * lit) || 0;
  
  // Format as currency
  document.getElementById('biaya_bbm').value = total ? total.toLocaleString('id-ID') : '';
}
```

- [ ] **Step 5: Test form layout**

Test in browser:
1. Cards display correctly on mobile
2. Photo upload areas work
3. Toggle buttons for BBM/Toll work
4. Form submission works

- [ ] **Step 6: Commit form changes**

```bash
git add src/Index.html src/js.html src/css.html
git commit -m "feat: refactor input form to card-based layout with photo preview"
```

---

## Task 6: Dashboard Card List View (Mobile)

**Files:**
- Modify: `src/Index.html`
- Modify: `src/js.html`

**Interfaces:**
- Consumes: CSS classes from Task 2
- Produces: `loadDashboard()` updated for card list view

- [ ] **Step 1: Read current dashboard structure**

Read `src/Index.html` to understand current dashboard layout.

- [ ] **Step 2: Update Dashboard HTML**

Open `src/Index.html` and replace the dashboard page section:

```html
<!-- HALAMAN 2: DASHBOARD (ADMIN & PIC) -->
<div id='page-dashboard' style='display:none;'>
  <div class='card mb-4'>
    <div class='card-body p-4'>
      <h4 class='mb-3'>
        <i class='bi bi-clock-history me-2'></i> Riwayat Operasional
      </h4>
      
      <!-- Filter Section -->
      <div class='row g-2 mb-4'>
        <div class='col-6 col-md-4'>
          <select id='filter-cabang' class='form-select form-select-sm' onchange='loadDashboard()'>
            <option value=''>Semua Cabang</option>
          </select>
        </div>
        <div class='col-6 col-md-4'>
          <input type='month' id='filter-bulan' class='form-control form-control-sm' onchange='loadDashboard()'>
        </div>
        <div class='col-12 col-md-4'>
          <button class='btn btn-outline-secondary btn-sm w-100' onclick='resetFilters()'>
            <i class='bi bi-x-circle me-1'></i> Reset Filter
          </button>
        </div>
      </div>
      
      <!-- Dashboard Content -->
      <div id='dashboard-content'>
        <!-- Desktop Table (hidden on mobile) -->
        <div class='d-none d-md-block table-responsive'>
          <table class='table table-bordered table-striped table-hover'>
            <thead class='table-dark align-middle text-center'>
              <tr>
                <th>Tanggal</th>
                <th>Cabang</th>
                <th>Supir</th>
                <th>Kendaraan</th>
                <th>KM Tempuh</th>
                <th>BBM (L)</th>
                <th>Efisiensi</th>
                <th>Toll</th>
                <th>Foto</th>
              </tr>
            </thead>
            <tbody id='dashboard-tbody'></tbody>
          </table>
        </div>
        
        <!-- Mobile Card List (hidden on desktop) -->
        <div class='d-md-none' id='dashboard-cards'></div>
      </div>
      
      <!-- Empty State -->
      <div id='dashboard-empty' class='empty-state' style='display:none;'>
        <i class='bi bi-inbox'></i>
        <h5>Belum ada data operasional</h5>
        <p>Data akan muncul setelah Anda mengisi laporan harian.</p>
      </div>
      
      <!-- Loading State -->
      <div id='dashboard-loading' style='display:none;'>
        <div class='skeleton' style='height: 100px; margin-bottom: 12px;'></div>
        <div class='skeleton' style='height: 100px; margin-bottom: 12px;'></div>
        <div class='skeleton' style='height: 100px;'></div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Update loadDashboard function**

Replace the existing `loadDashboard` function in `src/js.html`:

```javascript
function loadDashboard() {
  let tbody = document.getElementById('dashboard-tbody');
  let cardsContainer = document.getElementById('dashboard-cards');
  let emptyState = document.getElementById('dashboard-empty');
  let loadingState = document.getElementById('dashboard-loading');
  
  // Show loading
  tbody.innerHTML = '';
  cardsContainer.innerHTML = '';
  emptyState.style.display = 'none';
  loadingState.style.display = 'block';
  
  // Get filter values
  let filterCabang = document.getElementById('filter-cabang').value;
  let filterBulan = document.getElementById('filter-bulan').value;
  
  google.script.run
    .withSuccessHandler(function(data) {
      loadingState.style.display = 'none';
      
      if (data.length === 0) {
        emptyState.style.display = 'block';
        return;
      }
      
      // Desktop Table
      data.forEach(row => {
        let tr = document.createElement('tr');
        let links = "<a href='" + row.foto_odo_awal + "' target='_blank' class='btn btn-sm btn-outline-primary'><i class='bi bi-image'></i></a> ";
        links += "<a href='" + row.foto_odo_akhir + "' target='_blank' class='btn btn-sm btn-outline-primary'><i class='bi bi-image'></i></a>";
        
        tr.innerHTML = 
          "<td>" + row.tanggal + "</td>" +
          "<td>" + row.cabang + "</td>" +
          "<td>" + row.supir + "</td>" +
          "<td>" + row.vehicle + "</td>" +
          "<td class='text-center'>" + row.km_tempuh + " KM</td>" +
          "<td class='text-center'>" + row.liter + " L</td>" +
          "<td class='text-center'>" + (row.efisiensi ? row.efisiensi + " KM/L" : "-") + "</td>" +
          "<td class='text-center'>" + formatCurrency(row.toll) + "</td>" +
          "<td class='text-center'>" + links + "</td>";
        tbody.appendChild(tr);
      });
      
      // Mobile Cards
      data.forEach(row => {
        let card = document.createElement('div');
        card.className = 'card mb-3';
        card.innerHTML = 
          "<div class='card-header bg-light'>" +
            "<div class='d-flex justify-content-between align-items-center'>" +
              "<div><i class='bi bi-calendar me-1'></i> " + row.tanggal + "</div>" +
              "<small class='text-muted'>" + row.cabang + "</small>" +
            "</div>" +
          "</div>" +
          "<div class='card-body'>" +
            "<div class='mb-2'><strong>" + row.vehicle + "</strong></div>" +
            "<div class='mb-2 text-muted'><i class='bi bi-person me-1'></i> " + row.supir + "</div>" +
            "<div class='row g-2 mb-2'>" +
              "<div class='col-6'>" +
                "<div class='stats-box'>" +
                  "<div class='stats-label'>KM Tempuh</div>" +
                  "<div class='stats-value'>" + row.km_tempuh + " KM</div>" +
                "</div>" +
              "</div>" +
              "<div class='col-6'>" +
                "<div class='stats-box'>" +
                  "<div class='stats-label'>BBM</div>" +
                  "<div class='stats-value'>" + row.liter + " L</div>" +
                "</div>" +
              "</div>" +
            "</div>" +
            "<div class='d-flex justify-content-between align-items-center'>" +
              "<small><i class='bi bi-fuel-pump me-1'></i> " + (row.efisiensi ? row.efisiensi + " KM/L" : "-") + "</small>" +
              "<small><i class='bi bi-signpost-2 me-1'></i> " + formatCurrency(row.toll) + "</small>" +
            "</div>" +
            "<div class='mt-2 pt-2 border-top'>" +
              "<a href='" + row.foto_odo_awal + "' target='_blank' class='btn btn-sm btn-outline-primary me-1'>" +
                "<i class='bi bi-camera me-1'></i> Awal" +
              "</a>" +
              "<a href='" + row.foto_odo_akhir + "' target='_blank' class='btn btn-sm btn-outline-primary'>" +
                "<i class='bi bi-camera me-1'></i> Akhir" +
              "</a>" +
            "</div>" +
          "</div>";
        cardsContainer.appendChild(card);
      });
    })
    .getDashboardData(userInfo);
}

function formatCurrency(value) {
  if (!value || value === '0') return 'Rp 0';
  return 'Rp ' + parseInt(value).toLocaleString('id-ID');
}

function resetFilters() {
  document.getElementById('filter-cabang').value = '';
  document.getElementById('filter-bulan').value = '';
  loadDashboard();
}
```

- [ ] **Step 4: Add filter dropdown population**

Update `loadInitialData` function to populate filter dropdown:

```javascript
// Add this inside loadInitialData after populating other dropdowns
let filterCabang = document.getElementById('filter-cabang');
if (filterCabang && data.cabangList) {
  filterCabang.innerHTML = '<option value="">Semua Cabang</option>';
  data.cabangList.forEach(c => {
    let opt = document.createElement('option');
    opt.value = c.kode;
    opt.text = c.nama;
    filterCabang.appendChild(opt);
  });
}
```

- [ ] **Step 5: Test dashboard**

Test in browser:
1. Mobile view shows card list
2. Desktop view shows table
3. Filters work correctly
4. Empty state displays when no data
5. Loading state shows while fetching

- [ ] **Step 6: Commit dashboard changes**

```bash
git add src/Index.html src/js.html
git commit -m "feat: add responsive dashboard with card list view for mobile"
```

---

## Task 7: Data Master Tabbed Interface

**Files:**
- Modify: `src/Index.html`
- Modify: `src/js.html`

**Interfaces:**
- Consumes: CSS classes from Task 2
- Produces: Tabbed interface for master data management

- [ ] **Step 1: Read current master data structure**

Read `src/Index.html` to understand current master data forms.

- [ ] **Step 2: Update Master Data HTML**

Open `src/Index.html` and replace the master page section:

```html
<!-- HALAMAN 3: DATA MASTER (SUPERADMIN ONLY) -->
<div id='page-master' style='display:none;'>
  <div class='card mb-4'>
    <div class='card-body p-4'>
      <h4 class='mb-3'>
        <i class='bi bi-database me-2'></i> Data Master
      </h4>
      
      <!-- Master Data Tabs -->
      <ul class='nav nav-pills mb-4' id='master-tabs'>
        <li class='nav-item'>
          <button class='nav-link active' onclick='switchMasterTab("kendaraan")' data-tab='kendaraan'>
            <i class='bi bi-car-front me-1'></i> Kendaraan
          </button>
        </li>
        <li class='nav-item'>
          <button class='nav-link' onclick='switchMasterTab("cabang")' data-tab='cabang'>
            <i class='bi bi-geo-alt me-1'></i> Cabang
          </button>
        </li>
        <li class='nav-item'>
          <button class='nav-link' onclick='switchMasterTab("supir")' data-tab='supir'>
            <i class='bi bi-person me-1'></i> Supir
          </button>
        </li>
        <li class='nav-item'>
          <button class='nav-link' onclick='switchMasterTab("bbm")' data-tab='bbm'>
            <i class='bi bi-fuel-pump me-1'></i> BBM
          </button>
        </li>
      </ul>
      
      <!-- Kendaraan Tab -->
      <div class='master-tab-content' id='master-kendaraan'>
        <div class='row g-4'>
          <div class='col-12 col-md-5'>
            <div class='card border-primary'>
              <div class='card-header bg-primary text-white'>
                <i class='bi bi-plus-circle me-1'></i> Tambah Kendaraan
              </div>
              <div class='card-body'>
                <form id='form-kendaraan' onsubmit='addMasterKendaraan(); return false;'>
                  <div class='mb-3'>
                    <label class='form-label'>Plat Nomor</label>
                    <input type='text' id='m_plat' class='form-control' required placeholder='B 1234 CD'>
                  </div>
                  <div class='mb-3'>
                    <label class='form-label'>Nama Kendaraan</label>
                    <input type='text' id='m_nama_kendaraan' class='form-control' required placeholder='Toyota Avanza'>
                  </div>
                  <div class='mb-3'>
                    <label class='form-label'>Cabang</label>
                    <select id='m_cabang' class='form-select' required></select>
                  </div>
                  <button type='submit' class='btn btn-primary btn-full' id='btn-add-vehicle'>
                    <i class='bi bi-check-circle me-1'></i> Simpan Kendaraan
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div class='col-12 col-md-7'>
            <div class='card'>
              <div class='card-header'>
                <i class='bi bi-list-ul me-1'></i> Daftar Kendaraan
              </div>
              <div class='card-body p-0'>
                <div id='list-kendaraan' class='list-group list-group-flush'></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Cabang Tab -->
      <div class='master-tab-content' id='master-cabang' style='display:none;'>
        <div class='row g-4'>
          <div class='col-12 col-md-5'>
            <div class='card border-success'>
              <div class='card-header bg-success text-white'>
                <i class='bi bi-plus-circle me-1'></i> Tambah Cabang
              </div>
              <div class='card-body'>
                <form id='form-cabang' onsubmit='addMasterCabang(); return false;'>
                  <div class='mb-3'>
                    <label class='form-label'>Kode Cabang</label>
                    <input type='text' id='m_kode_cabang' class='form-control' required placeholder='CBG-JKT'>
                  </div>
                  <div class='mb-3'>
                    <label class='form-label'>Nama Cabang</label>
                    <input type='text' id='m_nama_cabang' class='form-control' required placeholder='Jakarta'>
                  </div>
                  <button type='submit' class='btn btn-success btn-full' id='btn-add-cabang'>
                    <i class='bi bi-check-circle me-1'></i> Simpan Cabang
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div class='col-12 col-md-7'>
            <div class='card'>
              <div class='card-header'>
                <i class='bi bi-list-ul me-1'></i> Daftar Cabang
              </div>
              <div class='card-body p-0'>
                <div id='list-cabang' class='list-group list-group-flush'></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Supir Tab -->
      <div class='master-tab-content' id='master-supir' style='display:none;'>
        <div class='row g-4'>
          <div class='col-12 col-md-5'>
            <div class='card border-purple' style='border-left: 4px solid #6f42c1 !important;'>
              <div class='card-header' style='background: #6f42c1; color: white;'>
                <i class='bi bi-plus-circle me-1'></i> Tambah Supir
              </div>
              <div class='card-body'>
                <form id='form-supir' onsubmit='addMasterSupir(); return false;'>
                  <div class='mb-3'>
                    <label class='form-label'>Nama Lengkap</label>
                    <input type='text' id='m_nama_supir' class='form-control' required placeholder='Budi Santoso'>
                  </div>
                  <div class='mb-3'>
                    <label class='form-label'>Cabang</label>
                    <select id='m_cabang_supir' class='form-select' required></select>
                  </div>
                  <button type='submit' class='btn btn-full' id='btn-add-supir' style='background: #6f42c1; color: white;'>
                    <i class='bi bi-check-circle me-1'></i> Simpan Supir
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div class='col-12 col-md-7'>
            <div class='card'>
              <div class='card-header'>
                <i class='bi bi-list-ul me-1'></i> Daftar Supir
              </div>
              <div class='card-body p-0'>
                <div id='list-supir' class='list-group list-group-flush'></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- BBM Tab -->
      <div class='master-tab-content' id='master-bbm' style='display:none;'>
        <div class='row g-4'>
          <div class='col-12 col-md-5'>
            <div class='card border-danger'>
              <div class='card-header bg-danger text-white'>
                <i class='bi bi-plus-circle me-1'></i> Tambah Harga BBM
              </div>
              <div class='card-body'>
                <form id='form-bbm' onsubmit='addMasterBBM(); return false;'>
                  <div class='mb-3'>
                    <label class='form-label'>Jenis BBM</label>
                    <input type='text' id='m_jenis_bbm' class='form-control' required placeholder='Pertalite'>
                  </div>
                  <div class='mb-3'>
                    <label class='form-label'>Harga per Liter (Rp)</label>
                    <input type='number' id='m_harga_bbm' class='form-control' required placeholder='10000'>
                  </div>
                  <button type='submit' class='btn btn-danger btn-full' id='btn-add-bbm'>
                    <i class='bi bi-check-circle me-1'></i> Simpan BBM
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div class='col-12 col-md-7'>
            <div class='card'>
              <div class='card-header'>
                <i class='bi bi-list-ul me-1'></i> Daftar Harga BBM
              </div>
              <div class='card-body p-0'>
                <div id='list-bbm' class='list-group list-group-flush'></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add switchMasterTab function**

Add to `src/js.html`:

```javascript
function switchMasterTab(tab) {
  // Hide all tab content
  document.querySelectorAll('.master-tab-content').forEach(el => {
    el.style.display = 'none';
  });
  
  // Show selected tab content
  document.getElementById('master-' + tab).style.display = 'block';
  
  // Update tab buttons
  document.querySelectorAll('#master-tabs .nav-link').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector('#master-tabs [data-tab="' + tab + '"]').classList.add('active');
  
  // Load data for the tab
  loadMasterData(tab);
}

function loadMasterData(tab) {
  google.script.run
    .withSuccessHandler(function(data) {
      if (tab === 'kendaraan') {
        renderKendaraanList(data.vehicles || []);
      } else if (tab === 'cabang') {
        renderCabangList(data.cabangList || []);
      } else if (tab === 'supir') {
        renderSupirList(data.drivers || []);
      } else if (tab === 'bbm') {
        renderBBMList(data.bbmList || []);
      }
    })
    .getMasterData(userInfo);
}

function renderKendaraanList(vehicles) {
  let container = document.getElementById('list-kendaraan');
  if (vehicles.length === 0) {
    container.innerHTML = '<div class="list-group-item text-center text-muted py-4">Belum ada data kendaraan</div>';
    return;
  }
  
  container.innerHTML = vehicles.map(v => 
    '<div class="list-group-item d-flex justify-content-between align-items-center">' +
      '<div>' +
        '<div class="fw-bold">' + v.plat_nomor + '</div>' +
        '<small class="text-muted">' + v.nama + ' • ' + v.cabang + '</small>' +
      '</div>' +
      '<div>' +
        '<button class="btn btn-sm btn-outline-primary me-1" onclick="editKendaraan(\'' + v.vehicle_id + '\')"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-sm btn-outline-danger" onclick="deleteKendaraan(\'' + v.vehicle_id + '\')"><i class="bi bi-trash"></i></button>' +
      '</div>' +
    '</div>'
  ).join('');
}

function renderCabangList(cabangList) {
  let container = document.getElementById('list-cabang');
  if (cabangList.length === 0) {
    container.innerHTML = '<div class="list-group-item text-center text-muted py-4">Belum ada data cabang</div>';
    return;
  }
  
  container.innerHTML = cabangList.map(c =>
    '<div class="list-group-item d-flex justify-content-between align-items-center">' +
      '<div>' +
        '<div class="fw-bold">' + c.nama + '</div>' +
        '<small class="text-muted">' + c.kode + '</small>' +
      '</div>' +
      '<div>' +
        '<button class="btn btn-sm btn-outline-primary me-1" onclick="editCabang(\'' + c.kode + '\')"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-sm btn-outline-danger" onclick="deleteCabang(\'' + c.kode + '\')"><i class="bi bi-trash"></i></button>' +
      '</div>' +
    '</div>'
  ).join('');
}

function renderSupirList(drivers) {
  let container = document.getElementById('list-supir');
  if (drivers.length === 0) {
    container.innerHTML = '<div class="list-group-item text-center text-muted py-4">Belum ada data supir</div>';
    return;
  }
  
  container.innerHTML = drivers.map(d =>
    '<div class="list-group-item d-flex justify-content-between align-items-center">' +
      '<div>' +
        '<div class="fw-bold">' + d.nama + '</div>' +
        '<small class="text-muted">' + d.id + ' • ' + d.cabang + '</small>' +
      '</div>' +
      '<div>' +
        '<button class="btn btn-sm btn-outline-primary me-1" onclick="editSupir(\'' + d.id + '\')"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-sm btn-outline-danger" onclick="deleteSupir(\'' + d.id + '\')"><i class="bi bi-trash"></i></button>' +
      '</div>' +
    '</div>'
  ).join('');
}

function renderBBMList(bbmList) {
  let container = document.getElementById('list-bbm');
  if (bbmList.length === 0) {
    container.innerHTML = '<div class="list-group-item text-center text-muted py-4">Belum ada data BBM</div>';
    return;
  }
  
  container.innerHTML = bbmList.map(b =>
    '<div class="list-group-item d-flex justify-content-between align-items-center">' +
      '<div>' +
        '<div class="fw-bold">' + b.jenis + '</div>' +
        '<small class="text-muted">Rp ' + parseInt(b.harga).toLocaleString('id-ID') + '/L</small>' +
      '</div>' +
      '<div>' +
        '<button class="btn btn-sm btn-outline-primary me-1" onclick="editBBM(\'' + b.jenis + '\')"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-sm btn-outline-danger" onclick="deleteBBM(\'' + b.jenis + '\')"><i class="bi bi-trash"></i></button>' +
      '</div>' +
    '</div>'
  ).join('');
}
```

- [ ] **Step 4: Test master data tabs**

Test in browser:
1. Tab switching works
2. Lists display correctly
3. Forms submit properly
4. Responsive layout works

- [ ] **Step 5: Commit master data changes**

```bash
git add src/Index.html src/js.html
git commit -m "feat: add tabbed interface for master data management"
```

---

## Task 8: Settings Page (Superadmin)

**Files:**
- Create: `src/Settings.html`
- Create: `src/settings.js`
- Modify: `src/Index.html`
- Modify: `src/Code.gs`

**Interfaces:**
- Consumes: `getAppSettings()`, `saveAppSettings()`, `uploadLogo()` from Task 1
- Produces: Settings page with logo upload

- [ ] **Step 1: Create Settings.html**

Create new file `src/Settings.html`:

```html
<!-- HALAMAN PENGATURAN (SUPERADMIN ONLY) -->
<div id='page-settings' style='display:none;'>
  <div class='card mb-4'>
    <div class='card-body p-4'>
      <h4 class='mb-3'>
        <i class='bi bi-sliders me-2'></i> Pengaturan Aplikasi
      </h4>
      
      <div class='row g-4'>
        <!-- Logo Section -->
        <div class='col-12 col-md-6'>
          <div class='card border-primary'>
            <div class='card-header bg-primary text-white'>
              <i class='bi bi-image me-1'></i> Logo Aplikasi
            </div>
            <div class='card-body text-center'>
              <div id='settings-logo-preview' class='mb-3 p-4 bg-light rounded'>
                <i class='bi bi-fuel-pump' style='font-size: 64px; color: #0d6efd;'></i>
              </div>
              <p class='text-muted small mb-2'>
                Format: PNG, JPG, SVG<br>
                Max ukuran: 200KB<br>
                Rekomendasi: 200x200px
              </p>
              <input type='file' id='logo-file' accept='image/*' style='display:none;' onchange='previewLogo(this)'>
              <button class='btn btn-outline-primary' onclick='document.getElementById("logo-file").click()'>
                <i class='bi bi-upload me-1'></i> Pilih Logo Baru
              </button>
            </div>
          </div>
        </div>
        
        <!-- App Info Section -->
        <div class='col-12 col-md-6'>
          <div class='card border-info'>
            <div class='card-header bg-info text-white'>
              <i class='bi bi-info-circle me-1'></i> Info Aplikasi
            </div>
            <div class='card-body'>
              <div class='mb-3'>
                <label class='form-label'>Nama Aplikasi</label>
                <input type='text' id='settings-app-name' class='form-control' placeholder='Monitoring BBM Operasional'>
              </div>
              <div class='mb-3'>
                <label class='form-label'>Nama Perusahaan</label>
                <input type='text' id='settings-company-name' class='form-control' placeholder='PT. ABC Indonesia'>
              </div>
              <div class='mb-0'>
                <label class='form-label'>Footer Text</label>
                <input type='text' id='settings-footer-text' class='form-control' placeholder='© 2026 PT. ABC Indonesia'>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Save Button -->
      <div class='mt-4'>
        <button class='btn btn-primary btn-lg btn-full' onclick='saveSettings()'>
          <i class='bi bi-check-circle me-2'></i> Simpan Pengaturan
        </button>
      </div>
      
    </div>
  </div>
</div>

<!-- Loading Overlay -->
<div id='settings-loading' class='loading-overlay' style='display:none;'>
  <div class='spinner-border text-primary'></div>
  <span>Menyimpan pengaturan...</span>
</div>
```

- [ ] **Step 2: Create settings.js**

Create new file `src/settings.js`:

```javascript
let selectedLogoFile = null;

function previewLogo(input) {
  if (input.files && input.files[0]) {
    selectedLogoFile = input.files[0];
    
    var reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('settings-logo-preview').innerHTML = 
        '<img src="' + e.target.result + '" alt="Logo Preview" style="max-height: 150px; max-width: 200px;">';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function loadSettings() {
  google.script.run
    .withSuccessHandler(function(settings) {
      // Update logo preview
      if (settings.logo_url) {
        document.getElementById('settings-logo-preview').innerHTML = 
          '<img src="' + settings.logo_url + '" alt="Current Logo" style="max-height: 150px; max-width: 200px;">';
      }
      
      // Fill form fields
      document.getElementById('settings-app-name').value = settings.app_name || '';
      document.getElementById('settings-company-name').value = settings.company_name || '';
      document.getElementById('settings-footer-text').value = settings.footer_text || '';
    })
    .getAppSettings();
}

function saveSettings() {
  let loading = document.getElementById('settings-loading');
  loading.style.display = 'flex';
  
  let settingsData = {
    app_name: document.getElementById('settings-app-name').value,
    company_name: document.getElementById('settings-company-name').value,
    footer_text: document.getElementById('settings-footer-text').value,
    logo_url: ''
  };
  
  // Upload logo if selected
  if (selectedLogoFile) {
    let reader = new FileReader();
    reader.onload = function(e) {
      let base64Data = e.target.result;
      
      google.script.run
        .withSuccessHandler(function(result) {
          if (result.success) {
            settingsData.logo_url = result.url;
            saveSettingsData(settingsData, loading);
          } else {
            loading.style.display = 'none';
            showToast('Gagal upload logo: ' + result.msg, 'error');
          }
        })
        .uploadLogo(base64Data, selectedLogoFile.name);
    };
    reader.readAsDataURL(selectedLogoFile);
  } else {
    // Get current logo URL
    google.script.run
      .withSuccessHandler(function(currentSettings) {
        settingsData.logo_url = currentSettings.logo_url || '';
        saveSettingsData(settingsData, loading);
      })
      .getAppSettings();
  }
}

function saveSettingsData(data, loading) {
  google.script.run
    .withSuccessHandler(function(result) {
      loading.style.display = 'none';
      if (result.success) {
        showToast('Pengaturan berhasil disimpan!', 'success');
        selectedLogoFile = null;
        
        // Update navbar and login page
        loadAppSettings();
      } else {
        showToast('Gagal menyimpan: ' + result.msg, 'error');
      }
    })
    .saveAppSettings(data);
}

function showToast(message, type) {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  
  let toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = 
    '<i class="bi bi-' + (type === 'success' ? 'check-circle-fill text-success' : 'exclamation-circle-fill text-danger') + '"></i>' +
    '<span>' + message + '</span>';
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
```

- [ ] **Step 3: Add settings tab to navigation**

Update `src/Index.html` to include settings tab in bottom nav and top tabs:

```html
<!-- In bottom nav, add settings button -->
<button class='btn-nav' onclick='switchTab("settings")' data-tab='settings' id='btn-nav-settings' style='display:none;'>
  <i class='bi bi-sliders'></i>
  <span>Pengaturan</span>
</button>

<!-- In top tabs, add settings tab -->
<li class='nav-item d-none' id='nav-settings'>
  <a class='nav-link bg-info text-dark fw-bold ms-2' id='tab-settings' href='#' onclick='switchTab("settings")'>
    <i class='bi bi-sliders me-1'></i> Pengaturan
  </a>
</li>
```

- [ ] **Step 4: Update switchTab function**

Update the `switchTab` function to handle settings tab:

```javascript
function switchTab(tab) {
  // Hide all pages
  document.getElementById('page-form').style.display = 'none';
  document.getElementById('page-dashboard').style.display = 'none';
  document.getElementById('page-master').style.display = 'none';
  document.getElementById('page-settings').style.display = 'none';
  
  // Show selected page
  if (tab === 'form') {
    document.getElementById('page-form').style.display = 'block';
  } else if (tab === 'dashboard') {
    document.getElementById('page-dashboard').style.display = 'block';
  } else if (tab === 'master') {
    document.getElementById('page-master').style.display = 'block';
    loadMasterData('kendaraan');
  } else if (tab === 'settings') {
    document.getElementById('page-settings').style.display = 'block';
    loadSettings();
  }
  
  // Update navigation states
  // ... (same as before)
}
```

- [ ] **Step 5: Include settings.js in Index.html**

Add before closing `</body>`:

```html
<?!= include('settings'); ?>
```

- [ ] **Step 6: Test settings page**

Test in browser:
1. Settings page accessible for Superadmin only
2. Logo upload works
3. Settings save correctly
4. Changes reflect in navbar and login page

- [ ] **Step 7: Commit settings page**

```bash
git add src/Settings.html src/settings.js src/Index.html
git commit -m "feat: add settings page for Superadmin with logo upload"
```

---

## Task 9: Toast Notifications & UI Feedback

**Files:**
- Modify: `src/css.html`
- Modify: `src/js.html`

**Interfaces:**
- Consumes: CSS classes from Task 2
- Produces: `showToast()` function, loading states

- [ ] **Step 1: Add toast container HTML**

Add to `src/Index.html` before closing `</body>`:

```html
<!-- Toast Container -->
<div id='toast-container' class='toast-container'></div>
```

- [ ] **Step 2: Add toast animation CSS**

Add to `src/css.html`:

```css
@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
```

- [ ] **Step 3: Update showToast function**

Update the `showToast` function in `src/js.html`:

```javascript
function showToast(message, type) {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  
  let toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = 
    '<i class="bi bi-' + (type === 'success' ? 'check-circle-fill text-success' : 'exclamation-circle-fill text-danger') + ' fs-5"></i>' +
    '<span class="flex-grow-1">' + message + '</span>' +
    '<button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>';
  
  toastContainer.appendChild(toast);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, 3000);
}
```

- [ ] **Step 4: Update existing functions to use showToast**

Update functions like `addMasterKendaraan`, `addMasterCabang`, etc. to use `showToast` instead of `alert`:

```javascript
function addMasterKendaraan() {
  let btn = document.getElementById('btn-add-vehicle');
  btn.disabled = true;
  let data = {
    plat: document.getElementById('m_plat').value,
    nama: document.getElementById('m_nama_kendaraan').value,
    cabang: document.getElementById('m_cabang').value
  };
  google.script.run.withSuccessHandler(res => {
    showToast(res.msg, res.success ? 'success' : 'error');
    btn.disabled = false;
    document.getElementById('form-kendaraan').reset();
    if (res.success) loadMasterData('kendaraan');
  }).saveMasterKendaraan(data);
}
```

- [ ] **Step 5: Test toast notifications**

Test in browser:
1. Toast appears on success actions
2. Toast appears on error actions
3. Toast auto-dismisses after 3 seconds
4. Toast can be manually closed

- [ ] **Step 6: Commit toast notifications**

```bash
git add src/css.html src/js.html src/Index.html
git commit -m "feat: add toast notifications for user feedback"
```

---

## Task 10: OCR Modal Enhancement

**Files:**
- Modify: `src/Index.html`
- Modify: `src/css.html`

**Interfaces:**
- Consumes: CSS classes from Task 2
- Produces: Enhanced OCR modal with summary

- [ ] **Step 1: Read current OCR modal**

Read `src/Index.html` to understand current modal structure.

- [ ] **Step 2: Update OCR Modal HTML**

Open `src/Index.html` and replace the OCR modal section:

```html
<!-- MODAL OCR RESULT -->
<div class='modal fade' id='ocrModal' tabindex='-1' data-bs-backdrop='static'>
  <div class='modal-dialog modal-dialog-centered'>
    <div class='modal-content' style='border-radius: 16px; overflow: hidden;'>
      <div class='modal-header bg-success text-white py-3'>
        <h5 class='modal-title'>
          <i class='bi bi-check-circle me-2'></i> Konfirmasi Hasil Bacaan
        </h5>
      </div>
      <div class='modal-body p-4'>
        <div class='alert alert-info mb-4'>
          <small>
            <i class='bi bi-info-circle me-1'></i>
            Sistem telah mendeteksi angka dari foto. <strong>Periksa kembali dan edit jika perlu!</strong>
          </small>
        </div>
        
        <div class='mb-3'>
          <label class='form-label fw-bold text-primary'>
            <i class='bi bi-arrow-right-circle me-1'></i> KM Keberangkatan (Awal)
          </label>
          <input type='number' id='km_awal_val' class='form-control form-control-lg text-center' required>
        </div>
        
        <div class='mb-4'>
          <label class='form-label fw-bold text-danger'>
            <i class='bi bi-arrow-left-circle me-1'></i> KM Kepulangan (Akhir)
          </label>
          <input type='number' id='km_akhir_val' class='form-control form-control-lg text-center' required>
        </div>
        
        <!-- Summary Box -->
        <div class='summary-box' id='ocr-summary' style='display:none;'>
          <h6 class='mb-3'>
            <i class='bi bi-calculator me-1'></i> Ringkasan
          </h6>
          <div class='summary-row'>
            <span>Jarak Tempuh</span>
            <strong id='summary-km'>- KM</strong>
          </div>
          <div class='summary-row'>
            <span>BBM</span>
            <span id='summary-bbm'>-</span>
          </div>
          <div class='summary-row'>
            <span>Total BBM</span>
            <span id='summary-bbm-cost'>-</span>
          </div>
          <div class='summary-row'>
            <span>Toll</span>
            <span id='summary-toll'>-</span>
          </div>
          <div class='summary-row summary-total'>
            <span>TOTAL</span>
            <span id='summary-total'>-</span>
          </div>
        </div>
      </div>
      <div class='modal-footer p-3'>
        <button type='button' id='btn-save' class='btn btn-success btn-lg btn-full py-3 fw-bold' onclick='confirmAndSave()'>
          <i class='bi bi-save me-2'></i> Simpan Data Permanen
        </button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add summary calculation**

Add to `src/js.html`:

```javascript
function updateOCRSummary() {
  let kmAwal = parseFloat(document.getElementById('km_awal_val').value) || 0;
  let kmAkhir = parseFloat(document.getElementById('km_akhir_val').value) || 0;
  let kmTempuh = kmAkhir - kmAwal;
  
  if (kmTempuh > 0) {
    document.getElementById('summary-km').textContent = kmTempuh + ' KM';
    document.getElementById('ocr-summary').style.display = 'block';
    
    // Get BBM data from form
    let literBBM = parseFloat(document.getElementById('liter_bbm').value) || 0;
    let biayaBBM = parseFloat(document.getElementById('biaya_bbm').value) || 0;
    let biayaToll = parseFloat(document.getElementById('biaya_toll').value) || 0;
    
    let totalBiaya = biayaBBM + biayaToll;
    
    document.getElementById('summary-bbm').textContent = literBBM ? literBBM + ' L' : '-';
    document.getElementById('summary-bbm-cost').textContent = biayaBBM ? formatCurrency(biayaBBM) : '-';
    document.getElementById('summary-toll').textContent = biayaToll ? formatCurrency(biayaToll) : '-';
    document.getElementById('summary-total').textContent = formatCurrency(totalBiaya);
  } else {
    document.getElementById('ocr-summary').style.display = 'none';
  }
}

// Add event listeners to KM inputs
document.getElementById('km_awal_val').addEventListener('input', updateOCRSummary);
document.getElementById('km_akhir_val').addEventListener('input', updateOCRSummary);
```

- [ ] **Step 4: Update processDailyReport to show summary**

Update the success handler in `processDailyReport`:

```javascript
google.script.run
  .withSuccessHandler(function(res) {
     btn.disabled = false;
     btn.innerHTML = originalText;
     if(res.success) {
       document.getElementById('km_awal_val').value = res.km_awal || '';
       document.getElementById('km_akhir_val').value = res.km_akhir || '';
       formDataPayload.serverData = res;
       
       // Update summary
       updateOCRSummary();
       
       ocrModal.show();
     } else {
       showToast('Gagal memproses foto: ' + res.error, 'error');
     }
  })
```

- [ ] **Step 5: Test OCR modal**

Test in browser:
1. Modal displays correctly
2. Summary calculates automatically
3. KM values update summary
4. Save button works

- [ ] **Step 6: Commit OCR modal changes**

```bash
git add src/Index.html src/js.html src/css.html
git commit -m "feat: enhance OCR modal with summary calculation"
```

---

## Task 11: Final Integration & Testing

**Files:**
- Modify: All files (final adjustments)

**Interfaces:**
- Consumes: All previous tasks
- Produces: Complete, working application

- [ ] **Step 1: Run full test on mobile**

Test on mobile device or Chrome DevTools mobile emulation:
1. Login works
2. Bottom navigation works
3. All forms submit correctly
4. Dashboard displays correctly
5. Settings page works (Superadmin)

- [ ] **Step 2: Run full test on desktop**

Test on desktop browser:
1. Top tabs navigation works
2. All forms submit correctly
3. Dashboard table displays correctly
4. Master data tabs work
5. Settings page works (Superadmin)

- [ ] **Step 3: Test role-based access**

Test with different user roles:
1. SUPERADMIN: Can see all tabs including Master and Settings
2. PIC CABANG: Can only see Input and History tabs
3. PIC WHO: Can only see Input and History tabs

- [ ] **Step 4: Test edge cases**

Test edge cases:
1. Empty states display correctly
2. Loading states work
3. Error handling works
4. Form validation works

- [ ] **Step 5: Final CSS adjustments**

Make any final CSS adjustments based on testing.

- [ ] **Step 6: Commit final changes**

```bash
git add .
git commit -m "feat: complete UI/UX redesign implementation"
```

- [ ] **Step 7: Deploy via clasp**

```bash
clasp push
```

---

## Summary

**Total Tasks:** 11

**Estimated Time:** 4-6 hours

**Dependencies:**
- Task 1 (Database) → Task 8 (Settings)
- Task 2 (CSS) → All other tasks
- Task 3 (Navigation) → Task 4, 5, 6, 7, 8

**Key Deliverables:**
1. Mobile-first responsive design
2. Bottom navigation for mobile
3. Card-based form layout
4. Configurable logo
5. Settings page for Superadmin
6. Toast notifications
7. Enhanced OCR modal
8. Dashboard card list view

---

**Document Version:** 1.0
**Last Updated:** 20 Agustus 2026
**Author:** Implementation Team
