import { useCallback, useRef, useState } from 'react';

/**
 * Shared device-location helper for the registration wizard and the portal
 * settings pages (shopkeepers + suppliers).
 *
 * `capture()` opens the browser's native location-permission pop-up
 * (Geolocation API). On success the GPS point lands in `coords` — the owning
 * form sends it to the API as `currentLocation` and the Admin Dashboard
 * renders it as a clickable Google Maps link. On failure `notice` carries a
 * human-readable hint covering the two usual culprits: blocked permission and
 * disabled device location services.
 *
 * `autoPrompt()` fires `capture()` only the FIRST time it is called, so the
 * permission pop-up appears the moment the trader focuses the "Current House
 * Location" field without re-prompting on every keystroke.
 */
export interface DeviceCoords {
  lat: number;
  lng: number;
}

export function useDeviceLocation() {
  const [coords, setCoords] = useState<DeviceCoords | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const promptedOnce = useRef(false);

  const capture = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setNotice('This browser cannot detect your location. Please type your current location manually.');
      return;
    }

    setLocating(true);
    setNotice(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
        setLocating(false);
        setNotice(null);
      },
      (error) => {
        setLocating(false);
        setCoords(null);
        if (error.code === error.PERMISSION_DENIED) {
          setNotice(
            'Location permission was blocked. Grant location access to this site in the browser\u2019s permission pop-up or site settings, then press \u201cUse my current location\u201d again.'
          );
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setNotice(
            'Your device location could not be detected. Turn on GPS / location services in your device settings, then try again.'
          );
        } else {
          setNotice(
            'Timed out while detecting your location. Make sure location services are enabled, then try again.'
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  const autoPrompt = useCallback(() => {
    if (promptedOnce.current) return;
    promptedOnce.current = true;
    capture();
  }, [capture]);

  return { coords, setCoords, locating, notice, capture, autoPrompt };
}
