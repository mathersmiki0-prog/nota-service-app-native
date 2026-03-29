// Wrapper minimal plugin native untuk web app (ES module).
// Importable via: <script type="module" src="./www/native-plugins.js"></script>

// Helper: detect Capacitor platform
function isCapacitor() {
  return typeof window !== 'undefined' && 
         window.Capacitor && 
         typeof window.Capacitor.isNativePlatform === 'function' &&
         window.Capacitor.isNativePlatform();
}

// Helper: get plugin dengan fallback
function getPlugin(name) {
  if (!window.Capacitor || !window.Capacitor.Plugins) return null;
  
  if (window.Capacitor.Plugins[name]) return window.Capacitor.Plugins[name];
  
  const variations = [name, name.toLowerCase(), name.toUpperCase(), 
    name.charAt(0).toUpperCase() + name.slice(1)];
  
  for (const variant of variations) {
    if (window.Capacitor.Plugins[variant]) {
      return window.Capacitor.Plugins[variant];
    }
  }
  
  return null;
}

// Helper: safe dynamic import dengan timeout
async function safeImport(moduleName, timeout = 5000) {
  return Promise.race([
    import(moduleName),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Import timeout: ${moduleName}`)), timeout)
    )
  ]);
}

// Helper: request permission dengan retry
async function requestContactsPermission(Contacts, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Check current permission
      let permStatus;
      try {
        permStatus = await Contacts.checkPermissions();
      } catch (e) {
        console.log('[Contacts] checkPermissions error:', e);
        permStatus = { contacts: 'prompt' };
      }

      console.log('[Contacts] Current permission:', permStatus);

      // Already granted
      const isGranted = permStatus.granted === true || 
                       permStatus.contacts === 'granted' || 
                       permStatus.contacts === 'allow';
      
      if (isGranted) {
        return { granted: true, status: permStatus };
      }

      // Request permission
      if (permStatus.contacts === 'prompt' || 
          permStatus.contacts === 'denied' || 
          permStatus.contacts === 'ask') {
        
        console.log('[Contacts] Requesting permission...');
        
        let requestResult;
        
        // Try various method names
        try {
          requestResult = await Contacts.requestPermissions();
        } catch (e1) {
          try {
            requestResult = await Contacts.requestPermission();
          } catch (e2) {
            try {
              requestResult = await Contacts.request();
            } catch (e3) {
              console.log('[Contacts] All request methods failed');
              throw new Error('Permission request failed');
            }
          }
        }

        console.log('[Contacts] Request result:', requestResult);

        const nowGranted = requestResult.granted === true ||
                          requestResult.contacts === 'granted' ||
                          requestResult.contacts === 'allow';

        if (nowGranted) {
          return { granted: true, status: requestResult };
        }
      }

      // If denied, wait a bit before retry
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 500));
      }

    } catch (error) {
      console.error('[Contacts] Permission error:', error);
      if (i === maxRetries - 1) throw error;
    }
  }

  return { granted: false, status: null };
}

// Helper: open app settings
async function openAppSettings() {
  try {
    const App = getPlugin('App');
    
    if (App?.openSettings) {
      await App.openSettings();
      return true;
    }
    
    if (App?.openUrl) {
      await App.openUrl({ url: 'app-settings:' });
      return true;
    }
    
    // Manual fallback
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.App) {
      await Capacitor.Plugins.App.openUrl({ url: 'app-settings:' });
      return true;
    }
    
    return false;
  } catch (e) {
    console.error('[openAppSettings] Error:', e);
    return false;
  }
}

export async function takePhoto(options = { quality: 80 }) {
  if (!isCapacitor()) {
    throw new Error('Camera hanya tersedia di aplikasi native');
  }

  try {
    const mod = await safeImport('@capacitor/camera');
    const Camera = mod.Camera || getPlugin('Camera');
    
    if (!Camera || !Camera.getPhoto) {
      throw new Error('Camera plugin tidak tersedia');
    }

    const CameraResultType = mod.CameraResultType || { DataUrl: 'dataUrl', Base64: 'base64' };
    const CameraSource = mod.CameraSource || { Camera: 'CAMERA', Photos: 'PHOTOS' };

    const result = await Camera.getPhoto({
      quality: options.quality || 80,
      resultType: CameraResultType.DataUrl || 'dataUrl',
      source: options.source || CameraSource.Camera || 'CAMERA',
      allowEditing: false,
      saveToGallery: options.saveToGallery !== false,
      width: options.width || 1280,
      height: options.height || 1280
    });

    return {
      dataUrl: result.dataUrl || result.data,
      base64: result.base64String || result.base64,
      format: result.format || 'jpeg',
      saved: result.saved || false
    };
    
  } catch (error) {
    console.error('[takePhoto] Error:', error);
    throw new Error(`Gagal mengambil foto: ${error.message || error}`);
  }
}

export async function getContacts(options = {}) {
  if (!isCapacitor()) {
    throw new Error('Contacts hanya tersedia di aplikasi native');
  }

  try {
    const mod = await safeImport('@capacitor-community/contacts');
    const Contacts = mod.Contacts || getPlugin('Contacts');
    
    if (!Contacts) {
      throw new Error('Contacts plugin tidak tersedia');
    }

    console.log('[Contacts] Plugin methods:', Object.keys(Contacts));

    // Request permission dengan handler yang lebih robust
    const permResult = await requestContactsPermission(Contacts);
    
    if (!permResult.granted) {
      // Coba sekali lagi dengan cara berbeda
      console.log('[Contacts] First attempt failed, trying alternative...');
      
      // Coba langsung getContacts (kadang permission otomatis diminta)
      try {
        const testResult = await Contacts.getContacts({ projection: { name: true, phones: true } });
        if (testResult && (testResult.contacts || testResult.data)) {
          console.log('[Contacts] Direct getContacts worked!');
          permResult.granted = true;
        }
      } catch (directError) {
        console.log('[Contacts] Direct getContacts failed:', directError.message);
      }
      
      if (!permResult.granted) {
        const shouldOpenSettings = confirm(
          '❌ Izin akses kontak diperlukan\n\n' +
          'Klik OK untuk membuka Pengaturan Aplikasi dan aktifkan izin Kontak secara manual.\n\n' +
          'Langkah:\n' +
          '1. Ketuk "Izin"\n' +
          '2. Aktifkan "Kontak"\n' +
          '3. Kembali ke aplikasi'
        );
        
        if (shouldOpenSettings) {
          await openAppSettings();
        }
        
        throw new Error('Izin akses kontak ditolak. Silakan aktifkan di Pengaturan > Aplikasi > Nota Service HP > Izin > Kontak');
      }
    }

    console.log('[Contacts] Permission granted, fetching contacts...');

    // Get contacts dengan berbagai strategi
    let result;
    const projection = options.projection || { name: true, phones: true };

    try {
      // Method 1: Standard getContacts
      result = await Contacts.getContacts({ projection });
    } catch (e1) {
      console.log('[Contacts] Method 1 failed:', e1.message);
      
      try {
        // Method 2: Tanpa parameter
        result = await Contacts.getContacts();
      } catch (e2) {
        console.log('[Contacts] Method 2 failed:', e2.message);
        
        try {
          // Method 3: loadContacts (versi lama)
          result = await Contacts.loadContacts?.();
        } catch (e3) {
          console.log('[Contacts] Method 3 failed:', e3.message);
          throw new Error('Tidak dapat mengakses kontak');
        }
      }
    }

    console.log('[Contacts] Raw result:', result);

    // Normalize response dari berbagai format
    let contacts = [];
    
    if (result?.contacts && Array.isArray(result.contacts)) {
      contacts = result.contacts;
    } else if (Array.isArray(result)) {
      contacts = result;
    } else if (result?.data && Array.isArray(result.data)) {
      contacts = result.data;
    } else if (typeof result === 'object' && result !== null) {
      // Single contact atau format aneh
      contacts = [result];
    }

    console.log('[Contacts] Extracted count:', contacts.length);

    // Normalize dan filter
    const normalizedContacts = contacts.map(c => {
      let displayName = c.displayName;
      
      if (!displayName && c.name) {
        displayName = c.name.display || 
                     [c.name.given, c.name.family].filter(Boolean).join(' ') ||
                     c.name.given || 
                     c.name.family ||
                     c.name.formatted;
      }
      
      if (!displayName && c.firstName) {
        displayName = [c.firstName, c.lastName].filter(Boolean).join(' ');
      }
      
      let phones = [];
      if (c.phones && Array.isArray(c.phones)) {
        phones = c.phones;
      } else if (c.phoneNumbers && Array.isArray(c.phoneNumbers)) {
        phones = c.phoneNumbers;
      } else if (c.phoneNumber) {
        phones = [{ number: c.phoneNumber }];
      }

      let emails = [];
      if (c.emails && Array.isArray(c.emails)) {
        emails = c.emails;
      } else if (c.emailAddresses && Array.isArray(c.emailAddresses)) {
        emails = c.emailAddresses;
      }

      return {
        id: c.contactId || c.id || c.recordId || Math.random().toString(36).substr(2, 9),
        displayName: displayName || c.company || 'Tanpa Nama',
        phones: phones.map(p => ({
          type: p.type || p.label || 'mobile',
          number: p.number || p.value || p.normalizedNumber || String(p)
        })).filter(p => p.number),
        emails: emails,
        organization: c.organization || c.company || c.department || ''
      };
    }).filter(c => {
      // Tampilkan semua yang punya nama, prioritas yang ada nomor
      return c.displayName && c.displayName !== 'Tanpa Nama';
    });

    // Sort: yang ada nomor di atas
    normalizedContacts.sort((a, b) => {
      const aHasPhone = a.phones.length > 0;
      const bHasPhone = b.phones.length > 0;
      if (aHasPhone && !bHasPhone) return -1;
      if (!aHasPhone && bHasPhone) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    console.log('[Contacts] Final normalized count:', normalizedContacts.length);

    if (normalizedContacts.length === 0) {
      throw new Error('Tidak ada kontak yang valid ditemukan');
    }

    return normalizedContacts;

  } catch (error) {
    console.error('[getContacts] Final error:', error);
    throw error;
  }
}

export async function saveContact(contactData) {
  if (!isCapacitor()) {
    throw new Error('Save contact hanya tersedia di aplikasi native');
  }

  try {
    const mod = await safeImport('@capacitor-community/contacts');
    const Contacts = mod.Contacts || getPlugin('Contacts');
    
    if (!Contacts) {
      throw new Error('Contacts plugin tidak tersedia');
    }

    // Request permission (write biasanya sama dengan read)
    const permResult = await requestContactsPermission(Contacts);
    
    if (!permResult.granted) {
      const shouldOpenSettings = confirm(
        '❌ Izin menulis kontak diperlukan\n\n' +
        'Klik OK untuk membuka Pengaturan dan aktifkan izin Kontak.'
      );
      
      if (shouldOpenSettings) {
        await openAppSettings();
      }
      
      throw new Error('Izin menulis kontak ditolak');
    }

    // Normalize input
    const name = contactData.name || contactData.displayName;
    const phone = contactData.phone || contactData.phoneNumber;
    
    if (!name || !phone) {
      throw new Error('Nama dan nomor telepon wajib diisi');
    }

    console.log('[saveContact] Saving:', { name, phone });

    // Try berbagai method
    let saved = false;
    let savedContactId = null;

    // Method 1: createContact dengan format lengkap
    if (!saved && Contacts.createContact) {
      try {
        const newContact = {
          contact: {
            name: {
              display: name,
              given: name.split(' ')[0] || name,
              family: name.split(' ').slice(1).join(' ') || ''
            },
            phones: [{
              type: 'mobile',
              label: 'mobile',
              number: phone,
              isPrimary: true
            }]
          }
        };
        
        console.log('[saveContact] Trying createContact...');
        const result = await Contacts.createContact(newContact);
        saved = true;
        savedContactId = result.contactId || result.id;
        console.log('[saveContact] Success via createContact:', savedContactId);
      } catch (e) {
        console.log('[saveContact] createContact failed:', e.message);
      }
    }

    // Method 2: createContact dengan format sederhana
    if (!saved && Contacts.createContact) {
      try {
        const simpleData = {
          displayName: name,
          phoneNumbers: [{
            label: 'mobile',
            number: phone
          }]
        };
        
        console.log('[saveContact] Trying simple format...');
        const result = await Contacts.createContact(simpleData);
        saved = true;
        savedContactId = result.contactId || result.id;
        console.log('[saveContact] Success via simple format:', savedContactId);
      } catch (e) {
        console.log('[saveContact] Simple format failed:', e.message);
      }
    }

    // Method 3: saveContact (older API)
    if (!saved && Contacts.saveContact) {
      try {
        console.log('[saveContact] Trying saveContact...');
        const result = await Contacts.saveContact({
          name: name,
          phone: phone,
          phoneNumber: phone
        });
        saved = true;
        savedContactId = result.id;
        console.log('[saveContact] Success via saveContact:', savedContactId);
      } catch (e) {
        console.log('[saveContact] saveContact failed:', e.message);
      }
    }

    // Method 4: addContact
    if (!saved && Contacts.addContact) {
      try {
        console.log('[saveContact] Trying addContact...');
        const result = await Contacts.addContact({
          displayName: name,
          phoneNumbers: [{
            label: 'mobile',
            number: phone
          }]
        });
        saved = true;
        savedContactId = result.id;
        console.log('[saveContact] Success via addContact:', savedContactId);
      } catch (e) {
        console.log('[saveContact] addContact failed:', e.message);
      }
    }

    if (!saved) {
      // Fallback: buka intent Android untuk tambah kontak
      console.log('[saveContact] All methods failed, using intent fallback');
      return await openContactIntent(name, phone);
    }

    return { 
      success: true, 
      contactId: savedContactId,
      method: 'plugin'
    };

  } catch (error) {
    console.error('[saveContact] Error:', error);
    throw error;
  }
}

// Fallback: buka Android intent untuk tambah kontak
async function openContactIntent(name, phone) {
  try {
    const App = getPlugin('App');
    
    // Format phone untuk intent
    const cleanPhone = phone.replace(/\s/g, '').replace(/-/g, '');
    
    // Android intent untuk insert contact
    const intentUrl = `intent://contacts/people/#Intent;` +
      `action=android.intent.action.INSERT;` +
      `type=vnd.android.cursor.dir/contact;` +
      `S.name=${encodeURIComponent(name)};` +
      `S.phone=${encodeURIComponent(cleanPhone)};` +
      `end`;
    
    console.log('[openContactIntent] Opening:', intentUrl);

    if (App?.openUrl) {
      await App.openUrl({ url: intentUrl });
    } else {
      window.location.href = intentUrl;
    }

    // Juga coba buka via wa.me sebagai fallback tambahan
    setTimeout(() => {
      // Tidak perlu alert yang mengganggu
      console.log('[openContactIntent] Intent launched');
    }, 300);

    return { 
      success: true, 
      method: 'intent',
      message: 'Aplikasi kontak dibuka. Silakan simpan kontak secara manual.'
    };

  } catch (err) {
    console.error('[openContactIntent] Error:', err);
    
    // Last resort: vCard
    return fallbackSaveVCard(name, phone);
  }
}

function fallbackSaveVCard(name, phone) {
  console.log('[fallbackSaveVCard] Creating vCard for:', name);
  
  const vCard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `N:${name};;;;`,
    `TEL;TYPE=CELL,VOICE:${phone}`,
    `TEL;TYPE=MOBILE:${phone}`,
    'END:VCARD'
  ].join('\r\n');
  
  const blob = new Blob([vCard], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `Kontak_${name.replace(/\s+/g, '_')}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  return {
    success: true,
    method: 'vcard',
    message: 'File vCard diunduh. Buka file untuk import ke kontak.'
  };
}

export function sendWhatsApp(phone, text) {
  const encoded = encodeURIComponent(text || '');
  const cleanPhone = (phone || '').replace(/\D/g, '');
  
  if (cleanPhone) {
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank');
    return { method: 'wa.me', url };
  } else {
    return new Promise((resolve, reject) => {
      safeImport('@capacitor/share').then(({ Share }) => {
        Share.share({ 
          title: 'Nota Service', 
          text: text || '',
          dialogTitle: 'Bagikan via'
        }).then(resolve).catch(reject);
      }).catch(() => {
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
        resolve({ method: 'wa.me_fallback' });
      });
    });
  }
}

export async function findAndPrintEscPos(plainText, printerNamePrefix = 'Printer') {
  if (!isCapacitor()) {
    throw new Error('Bluetooth printing hanya tersedia di aplikasi native');
  }

  try {
    const bleMod = await safeImport('@capacitor-community/bluetooth-le');
    const BluetoothLe = bleMod.BluetoothLe || getPlugin('BluetoothLe');
    
    if (!BluetoothLe) {
      throw new Error('Bluetooth LE plugin tidak tersedia');
    }

    const EscPosMod = await safeImport('esc-pos-encoder');
    const EscPos = EscPosMod.default || EscPosMod;

    await BluetoothLe.initialize();
    
    console.log('[Bluetooth] Scanning for printer...');

    const device = await BluetoothLe.requestDevice({
      filters: [{ namePrefix: printerNamePrefix }],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });

    const deviceId = device.deviceId || device.id || device.device;
    console.log('[Bluetooth] Connecting to:', device.name || deviceId);

    await BluetoothLe.connect({ deviceId });

    const encoder = new EscPos();
    encoder.initialize();
    encoder.setCharacterCodeTable('PC437');
    encoder.align('center');
    encoder.bold(true);
    encoder.text('NOTA SERVICE\n');
    encoder.bold(false);
    encoder.align('left');
    encoder.text(plainText);
    encoder.newLine();
    encoder.feed(3);
    encoder.cut();

    const encoded = encoder.encode();
    
    let binary = '';
    for (let i = 0; i < encoded.length; i++) {
      binary += String.fromCharCode(encoded[i]);
    }
    const base64 = btoa(binary);

    // Try multiple service/characteristic combinations
    const SERVICE_UUIDS = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '0000fff0-0000-1000-8000-00805f9b34fb'
    ];
    
    const WRITE_CHARS = [
      '00002af1-0000-1000-8000-00805f9b34fb',
      '0000fff2-0000-1000-8000-00805f9b34fb',
      '0000fff1-0000-1000-8000-00805f9b34fb'
    ];

    let writeSuccess = false;
    
    for (const serviceUuid of SERVICE_UUIDS) {
      for (const charUuid of WRITE_CHARS) {
        try {
          console.log(`[Bluetooth] Trying write to ${serviceUuid} / ${charUuid}`);
          await BluetoothLe.write({
            deviceId,
            service: serviceUuid,
            characteristic: charUuid,
            value: base64
          });
          writeSuccess = true;
          console.log('[Bluetooth] Write success!');
          break;
        } catch (e) {
          // Continue trying
        }
      }
      if (writeSuccess) break;
    }

    try {
      await BluetoothLe.disconnect({ deviceId });
    } catch (e) {
      // Ignore disconnect error
    }
    
    if (!writeSuccess) {
      throw new Error('Tidak dapat menulis ke printer. Pastikan printer thermal menyala dan dalam mode pairing.');
    }

    return { 
      success: true, 
      deviceName: device.name || 'Unknown Printer'
    };

  } catch (error) {
    console.error('[findAndPrintEscPos] Error:', error);
    throw new Error(`Gagal cetak: ${error.message || error}`);
  }
}

export async function saveNoteAsJson(filename, data) {
  if (!isCapacitor()) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'nota.json';
    a.click();
    URL.revokeObjectURL(url);
    return { success: true, method: 'download' };
  }

  try {
    const mod = await safeImport('@capacitor/filesystem');
    const Filesystem = mod.Filesystem || getPlugin('Filesystem');
    
    if (!Filesystem) {
      throw new Error('Filesystem plugin tidak tersedia');
    }

    const content = JSON.stringify(data, null, 2);
    
    const result = await Filesystem.writeFile({
      path: filename || `nota_${Date.now()}.json`,
      data: content,
      directory: Filesystem.Directory?.Documents || 'DOCUMENTS',
      encoding: 'utf8',
      recursive: true
    });

    return { 
      success: true, 
      uri: result.uri,
      path: result.path || result.uri 
    };

  } catch (error) {
    console.error('[saveNoteAsJson] Error:', error);
    throw new Error(`Gagal menyimpan file: ${error.message || error}`);
  }
}
