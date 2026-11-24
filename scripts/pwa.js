(function(){
  "use strict";
  const VERSION_KEY = 'setlist-creator.manifest-version';
  const CACHE_PREFIX = 'setlist-creator-shell-';

  async function checkManifestVersion(){
    try {
      const response = await fetch('/manifest.webmanifest', { cache: 'no-store' });
      if (!response.ok) return;
      const manifest = await response.json();
      if (typeof manifest.version !== 'string' || !manifest.version) return;

      const previousVersion = localStorage.getItem(VERSION_KEY);
      if (!previousVersion) {
        localStorage.setItem(VERSION_KEY, manifest.version);
        return;
      }
      if (previousVersion === manifest.version) return;

      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.filter(key=>key.startsWith(CACHE_PREFIX)).map(key=>caches.delete(key)));
      localStorage.setItem(VERSION_KEY, manifest.version);
      window.location.reload();
    } catch (error) {
      console.error('Manifest version check failed:', error);
    }
  }

  window.addEventListener('load', ()=>{
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error=>{
        console.error('Service worker registration failed:', error);
      });
    }
    checkManifestVersion();
  });
})();
