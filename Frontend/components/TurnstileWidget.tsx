'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile widget (#6 pre-deploy).
 *
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set — so local
 * dev without Turnstile keeps working and forms submit without a token
 * (the backend skips verification when TURNSTILE_SECRET_KEY is unset).
 *
 * Usage:
 *   const [tsToken, setTsToken] = useState<string | null>(null);
 *   const [tsKey, setTsKey] = useState(0); // bump to reset after submit
 *   <TurnstileWidget key={tsKey} onVerify={setTsToken} onExpire={() => setTsToken(null)} />
 *   // include turnstileToken: tsToken in the request body
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

export function isTurnstileConfigured() {
  return SITE_KEY.length > 0;
}

interface Props {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

export default function TurnstileWidget({ onVerify, onExpire }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cbRef = useRef({ onVerify, onExpire });
  cbRef.current = { onVerify, onExpire };

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !ref.current || widgetId.current !== null) return;
      const w = (window as any).turnstile;
      if (!w || typeof w.render !== 'function') {
        setTimeout(renderWidget, 200);
        return;
      }
      widgetId.current = w.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => cbRef.current.onVerify(token),
        'expired-callback': () => {
          widgetId.current = null;
          cbRef.current.onExpire?.();
        },
        'error-callback': () => {
          widgetId.current = null;
          cbRef.current.onExpire?.();
        },
      });
    };

    if (!(window as any).turnstile) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.onload = renderWidget;
      document.head.appendChild(s);
    } else {
      renderWidget();
    }

    return () => {
      cancelled = true;
      const w = (window as any).turnstile;
      if (w && widgetId.current !== null) {
        try { w.remove(widgetId.current); } catch { /* already gone */ }
        widgetId.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="my-3 flex justify-center" />;
}
