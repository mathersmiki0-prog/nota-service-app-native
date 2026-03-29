// Wrapper minimal plugin native untuk web app (ES module).
// Importable via: <script type="module" src="./www/native-plugins.js"></script>
// Exports: takePhoto, getContacts, sendWhatsApp, findAndPrintEscPos, saveNoteAsJson

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
  
  // Try exact match
  if (window.Capacitor.Plugins[name]) return window.Capacitor.Plugins[name];
  
  // Try case variations
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

    // Check/request permission
    let permStatus;
    try {
      permStatus = await Contacts.checkPermissions();
    } catch (e) {
      permStatus = { contacts: 'prompt' };
    }

    if (permStatus.contacts !== 'granted' && permStatus.contacts !== 'allow') {
      const requestResult = await Contacts.requestPermissions();
      const granted = requestResult.granted || 
                     requestResult.contacts === 'granted' || 
                     requestResult.contacts === 'allow';
      if (!granted) {
        throw new Error('Izin akses kontak ditolak');
      }
    }

    // Get contacts dengan projection minimal untuk performa
    const result = await Contacts.getContacts({
      projection: options.projection || {
        name: true,
        phones: true,
        emails: false,
        photos: false
      }
    });

    // Normalize response
    const contacts = result.contacts || result.data || result || [];
    
    return contacts.map(c => ({
      id: c.contactId || c.id || Math.random().toString(36).substr(2, 9),
      displayName: c.displayName || c.name?.display || c.name?.given || 'Tanpa Nama',
      phones: (c.phones || c.phoneNumbers || []).map(p => ({
        type: p.type || p.label || 'mobile',
        number: p.number || p.value || p
      })),
      emails: c.emails || c.emailAddresses || []
    }));

  } catch (error) {
    console.error('[getContacts] Error:', error);
    throw new Error(`Gagal mengambil kontak: ${error.message || error}`);
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

    // Check permission
    let permStatus;
    try {
      permStatus = await Contacts.checkPermissions();
    } catch (e) {
      permStatus = { contacts: 'prompt' };
    }

    if (permStatus.contacts !== 'granted' && permStatus.contacts !== 'allow') {
      await Contacts.requestPermissions();
    }

    // Normalize input
    const name = contactData.name || contactData.displayName;
    const phone = contactData.phone || contactData.phoneNumber;
    
    if (!name || !phone) {
      throw new Error('Nama dan nomor telepon wajib diisi');
    }

    // Try createContact
    if (Contacts.createContact) {
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
      
      const result = await Contacts.createContact(newContact);
      return { success: true, contactId: result.contactId || result.id };
    }
    
    throw new Error('Method createContact tidak tersedia');

  } catch (error) {
    console.error('[saveContact] Error:', error);
    throw new Error(`Gagal menyimpan kontak: ${error.message || error}`);
  }
}

export function sendWhatsApp(phone, text) {
  const encoded = encodeURIComponent(text || '');
  const cleanPhone = (phone || '').replace(/\D/g, '');
  
  if (cleanPhone) {
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank');
    return { method: 'wa.me', url };
  } else {
    // Fallback ke share sheet
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

    // Import esc-pos-encoder
    const EscPosMod = await safeImport('esc-pos-encoder');
    const EscPos = EscPosMod.default || EscPosMod;

    // Initialize Bluetooth
    await BluetoothLe.initialize();
    
    showToast?.('Mencari printer...');

    // Request device
    const device = await BluetoothLe.requestDevice({
      filters: [{ namePrefix: printerNamePrefix }],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });

    const deviceId = device.deviceId || device.id || device.device;
    showToast?.(`Menghubungkan ke ${device.name || 'printer'}...`);

    await BluetoothLe.connect({ deviceId });

    // Encode ESC/POS
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
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < encoded.length; i++) {
      binary += String.fromCharCode(encoded[i]);
    }
    const base64 = btoa(binary);

    // Write ke printer dengan retry
    const SERVICE_UUIDS = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '0000fff0-0000-1000-8000-00805f9b34fb'
    ];
    
    const WRITE_CHARS = [
      '00002af1-0000-1000-8000-00805f9b34fb',
      '0000fff2-0000-1000-8000-00805f9b34fb'
    ];

    let writeSuccess = false;
    
    for (const serviceUuid of SERVICE_UUIDS) {
      for (const charUuid of WRITE_CHARS) {
        try {
          await BluetoothLe.write({
            deviceId,
            service: serviceUuid,
            characteristic: charUuid,
            value: base64
          });
          writeSuccess = true;
          break;
        } catch (e) {
          continue;
        }
      }
      if (writeSuccess) break;
    }

    await BluetoothLe.disconnect({ deviceId }).catch(() => {});
    
    if (!writeSuccess) {
      throw new Error('Tidak dapat menulis ke printer');
    }

    return { success: true, deviceName: device.name };

  } catch (error) {
    console.error('[findAndPrintEscPos] Error:', error);
    throw new Error(`Gagal cetak: ${error.message || error}`);
  }
}

export async function saveNoteAsJson(filename, data) {
  if (!isCapacitor()) {
    // Fallback: download di browser
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
    
    // Write file
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

// Helper: showToast global (jika belum ada)
function showToast(message) {
  if (typeof window !== 'undefined' && window.app && window.app.showToast) {
    window.app.showToast(message);
  } else {
    console.log('[Toast]:', message);
  }
}
