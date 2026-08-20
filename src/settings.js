var selectedLogoFile = null;

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
      if (settings.logo_url) {
        document.getElementById('settings-logo-preview').innerHTML = 
          '<img src="' + settings.logo_url + '" alt="Current Logo" style="max-height: 150px; max-width: 200px;">';
      }
      document.getElementById('settings-app-name').value = settings.app_name || '';
      document.getElementById('settings-company-name').value = settings.company_name || '';
      document.getElementById('settings-footer-text').value = settings.footer_text || '';
    })
    .getAppSettings();
}

function saveSettings() {
  var loading = document.getElementById('settings-loading');
  loading.style.display = 'flex';
  
  var settingsData = {
    app_name: document.getElementById('settings-app-name').value,
    company_name: document.getElementById('settings-company-name').value,
    footer_text: document.getElementById('settings-footer-text').value,
    logo_url: ''
  };
  
  if (selectedLogoFile) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var base64Data = e.target.result;
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
        loadAppSettings();
      } else {
        showToast('Gagal menyimpan: ' + result.msg, 'error');
      }
    })
    .saveAppSettings(data);
}