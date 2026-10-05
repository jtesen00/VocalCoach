export interface BluetoothCheck {
  suspected: boolean;
  reason: string | null;
}

const BLUETOOTH_LABEL = /bluetooth|airpods|hands-?free|headset|buds|\bbt\b|hfp|wh-1000|bose/i;

/**
 * Heurística: los navegadores no exponen el tipo de transporte del micrófono.
 * Se combina el nombre del dispositivo con la frecuencia de muestreo de la pista
 * (el perfil HFP de Bluetooth trabaja a 8–16 kHz).
 */
export function checkBluetooth(track: MediaStreamTrack): BluetoothCheck {
  const settings = track.getSettings();
  if (settings.sampleRate && settings.sampleRate <= 16000) {
    return { suspected: true, reason: `el micrófono trabaja a ${settings.sampleRate / 1000} kHz` };
  }
  if (BLUETOOTH_LABEL.test(track.label)) {
    return { suspected: true, reason: `el dispositivo "${track.label}" parece Bluetooth` };
  }
  return { suspected: false, reason: null };
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput');
}
