(function(){
  "use strict";
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error=>{
      console.error('Service worker registration failed:', error);
    });
  });
})();
