"use client";

// Fonction centralisée de déconnexion
export async function logout(redirectUrl = '/?logged_out=1') {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {
    // Ignorer les erreurs réseau
  } finally {
    try { localStorage.setItem('session-updated', Date.now().toString()); } catch(_){}
    window.location.href = redirectUrl;
  }
}
