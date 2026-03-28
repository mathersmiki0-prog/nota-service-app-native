// Wrapper minimal plugin native untuk web app (ES module).
// Importable via <script type="module" src="/www/native-plugins.js"></script>
// Exports utility functions: takePhoto, getContacts, sendWhatsApp, findAndPrintEscPos, saveNoteAsJson

export async function takePhoto(options = { quality: 80 }) {
  const mod = await import('@capacitor/camera');
  const Camera = mod.Camera || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera);
  const CameraResultType = mod.CameraResultType || Camera?.CameraResultType || { Base64: 'base64', DataUrl: 'dataUrl' };
  const CameraSource = mod.CameraSource || Camera?.CameraSource || { Camera: 'camera', Photos: 'photos' };
  const result = await Camera.getPhoto({
    quality: options.quality || 80,
    resultType: CameraResultType.Base64 || CameraResultType.DataUrl,
    source: CameraSource.Camera,
    allowEditing: false
  });
  return result;
}

export async function getContacts() {
  const mod = await import('@capacitor-community/contacts');
  const Contacts = mod.Contacts || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Contacts);
  return await Contacts.getContacts();
}

export function sendWhatsApp(phone, text) {
  const encoded = encodeURIComponent(text || '');
  if (phone) {
    const url = `https://wa.me/${phone}?text=${encoded}`;
    window.open(url, '_blank');
  } else {
    import('@capacitor/share').then(({ Share }) => {
      Share.share({ title: 'Nota Service', text: text || '' });
    }).catch(() => { window.open(`https://wa.me/?text=${encoded}`, '_blank'); });
  }
}

export async function findAndPrintEscPos(plainText, printerNamePrefix = 'Printer') {
  const mod = await import('@capacitor-community/bluetooth-le');
  const BluetoothLe = mod.BluetoothLe || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BluetoothLe);
  const EscPos = (await import('esc-pos-encoder')).default || (await import('esc-pos-encoder'));
  await BluetoothLe.initialize();
  const device = await BluetoothLe.requestDevice({ filters: [{ namePrefix: printerNamePrefix }], optionalServices: [] });
  const deviceId = device.deviceId || device.id || device.device;
  await BluetoothLe.connect({ deviceId });
  const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
  const WRITE_CHAR_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';
  const encoder = new EscPos();
  encoder.initialize();
  encoder.setCharacterCodeTable('PC437');
  encoder.align('left');
  encoder.bold(true);
  encoder.text('Nota Service\n');
  encoder.bold(false);
  encoder.text(plainText + '\n');
  encoder.newLine();
  encoder.feed(3);
  encoder.cut();
  const encoded = encoder.encode();
  let binary = '';
  for (let i = 0; i < encoded.length; i++) binary += String.fromCharCode(encoded[i]);
  const base64 = btoa(binary);
  await BluetoothLe.write({ deviceId, service: SERVICE_UUID, characteristic: WRITE_CHAR_UUID, value: base64 });
  await BluetoothLe.disconnect({ deviceId });
  return true;
}

export async function saveNoteAsJson(filename, data) {
  const mod = await import('@capacitor/filesystem');
  const Filesystem = mod.Filesystem || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem);
  const content = JSON.stringify(data, null, 2);
  return await Filesystem.writeFile({ path: filename, data: content, directory: Filesystem.Directory.Documents || 'DOCUMENTS' });
}
