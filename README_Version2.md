# Nota Service HP — Android (Capacitor) + CI

Ini repo starter yang mengemas aplikasi web Nota Service HP menjadi aplikasi Android native via Capacitor.
Termasuk:
- plugin native: Camera, Contacts, Bluetooth LE, Share, Filesystem
- service worker & offline fallback
- GitHub Actions workflow untuk build APK (debug & optional signed release)
- instructions to copy required web libs to /www/libs for offline-safe APK

Quick start (local):
1. Clone repo
2. npm ci
3. mkdir -p www/libs && cp node_modules/html2canvas/dist/html2canvas.min.js www/libs/ && cp node_modules/jspdf/dist/jspdf.umd.min.js www/libs/ && cp node_modules/esc-pos-encoder/dist/esc-pos-encoder.min.js www/libs/
4. npx cap sync android
5. npx cap open android (build/run in Android Studio)

For signed release: add KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD to GitHub Secrets.