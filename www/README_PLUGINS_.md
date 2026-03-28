Panduan singkat plugin native dan CI

1. Tambahkan script modul ke index.html:
   <script type="module" src="/www/native-plugins.js"></script>

2. Instal plugin (lokal / CI):
   npm ci
   npm install @capacitor/camera @capacitor-community/contacts @capacitor-community/bluetooth-le @capacitor/share @capacitor/filesystem esc-pos-encoder html2canvas jspdf

3. Copy libs ke www/libs (CI step shown in workflow):
   mkdir -p www/libs
   cp node_modules/html2canvas/dist/html2canvas.min.js www/libs/
   cp node_modules/jspdf/dist/jspdf.umd.min.js www/libs/
   cp node_modules/esc-pos-encoder/dist/esc-pos-encoder.min.js www/libs/

4. Bluetooth printing:
   - Temukan SERVICE & CHARACTERISTIC UUID printer Anda via BLE scanner.
   - Update UUID di native-plugins.js / index.html printer code.

5. Contacts & Camera:
   - Pastikan runtime permission di-handle sebelum memanggil plugin.
   - Uji di perangkat fisik.

6. CI / Signing:
   - Untuk release: tambahkan KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD ke GitHub Secrets.
   - Workflow decode & menaruh android/keystore.properties (lihat .github/workflows).
