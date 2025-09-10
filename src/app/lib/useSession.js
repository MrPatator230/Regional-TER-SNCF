"use client";
import { useState, useEffect, useCallback } from 'react';

// Hook léger de session client (cache mémoire + refresh manuel)
export function useSession() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async() => {
    setLoading(true);
    try {
      const r = await fetch('/api/public/session', { cache: 'no-store' });
      const j = await r.json();
      setUser(j.user || null);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=> { load(); }, [load]);

  // Permettre un rafraîchissement externe (ex: après login/logout) via localStorage event
  useEffect(()=>{
    const handler = (e)=> { if(e.key==='session-updated') load(); };
    window.addEventListener('storage', handler);
    return ()=> window.removeEventListener('storage', handler);
  }, [load]);

  return { user, loading, refresh: load };
}
