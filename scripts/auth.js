(function(app){
  "use strict";
  function isAuthUnlocked(){ return localStorage.getItem(app.AUTH_KEYS.session) === 'true'; }
  function setAuthUnlocked(value){
    if (value) localStorage.setItem(app.AUTH_KEYS.session, 'true');
    else localStorage.removeItem(app.AUTH_KEYS.session);
    app.updateAuthUI();
  }
  app.updateAuthUI = function(){
    const lockBtn = document.getElementById('auth-lock-btn');
    if (lockBtn) lockBtn.textContent = isAuthUnlocked() ? 'Lock' : 'Unlock';
    const controls = ['add-song-btn','bulk-import-btn','save-setlist-btn','new-setlist-btn','delete-setlist-btn']
      .map(id=>document.getElementById(id));
    controls.forEach(btn=>{
      if (!btn) return;
      const disabled = !isAuthUnlocked();
      btn.disabled = disabled;
      btn.style.opacity = disabled ? '0.5' : '';
      btn.style.pointerEvents = disabled ? 'none' : '';
    });
  };
  app.requireAuthForWrite = function(){
    if (isAuthUnlocked()) return true;
    app.openAuthModal();
    app.showToast('Enter the password to edit');
    return false;
  };
  app.openAuthModal = function(){
    const overlay = document.getElementById('auth-modal-overlay');
    const input = document.getElementById('auth-password-input');
    input.value = '';
    overlay.classList.add('open');
    setTimeout(()=>input.focus(), 50);
  };
  function closeAuthModal(){ document.getElementById('auth-modal-overlay').classList.remove('open'); }
  app.initializeAuth = function(){ if (!isAuthUnlocked()) app.openAuthModal(); };
  document.getElementById('auth-lock-btn').addEventListener('click', ()=>{
    if (isAuthUnlocked()) {
      setAuthUnlocked(false);
      app.showToast('Editing locked');
      app.openAuthModal();
    } else app.openAuthModal();
  });
  document.getElementById('auth-modal-cancel').addEventListener('click', ()=>{
    closeAuthModal();
    if (!isAuthUnlocked()) app.showToast('Editing locked');
  });
  document.getElementById('auth-modal-action').addEventListener('click', async ()=>{
    const value = document.getElementById('auth-password-input').value.trim();
    if (!value) { app.showToast('Enter a password'); return; }
    try {
      const result = await window.SetlistCreatorApi.validatePassword(value);
      if (result.valid) {
        setAuthUnlocked(true);
        closeAuthModal();
        app.showToast('Unlocked');
      } else app.showToast('Incorrect password');
    } catch (error) {
      console.error('Password validation failed:', error);
      app.showToast('Password check failed');
    }
  });
})(window.SetlistCreator);
