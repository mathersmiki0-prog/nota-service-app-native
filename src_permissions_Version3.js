// Helper minimal untuk permission runtime (perlu disesuaikan)
export async function ensureCameraPermission() {
  try {
    const mod = await import('@capacitor/camera');
    const Camera = mod.Camera || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera);
    if (Camera && Camera.checkPermissions) {
      const status = await Camera.checkPermissions();
      if (status.camera !== 'granted') {
        await Camera.requestPermissions();
      }
    }
  } catch (e) {
    console.warn('Permission helper error', e);
  }
  return true;
}