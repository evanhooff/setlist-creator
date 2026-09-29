(function(){
  "use strict";
  const state = {
    songs: [], setlists: [], draft: null, playSongs: [], playIndex: 0,
    playFontSize: 18, confirmCallback: null
  };
  const STORAGE_KEYS = { songs: 'setlist-creator.songs', setlists: 'setlist-creator.setlists' };
  const AUTH_KEYS = { session: 'setlist-creator.auth.session' };
  const app = window.SetlistCreator = { state, STORAGE_KEYS, AUTH_KEYS };

  app.uid = function(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  };
  app.escapeHtml = function(str){
    return (str||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };
  app.readStorage = function(key, fallback){
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (error) { return fallback; }
  };
  app.writeStorage = function(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { return false; }
  };
  app.showToast = function(msg){
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(app.showToast.timer);
    app.showToast.timer = setTimeout(()=>toast.classList.remove('show'), 2200);
  };
  app.showConfirm = function(title, message, onConfirm){
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    state.confirmCallback = onConfirm;
    document.getElementById('confirm-modal-overlay').classList.add('open');
  };
  app.setStorageStatus = function(label, tone){
    const el = document.getElementById('storage-status');
    if (!el) return;
    el.textContent = label;
    el.classList.remove('connected', 'fallback', 'error');
    if (tone) el.classList.add(tone);
  };

  function getSupabaseConfig(){
    const cfg = window.SETLIST_CREATOR_CONFIG || {};
    return { url: (cfg.supabaseUrl || '').trim(), anonKey: (cfg.supabaseAnonKey || '').trim() };
  }
  function isSupabaseConfigured(){
    const { url, anonKey } = getSupabaseConfig();
    return Boolean(url && anonKey && !url.includes('YOUR_') && !anonKey.includes('YOUR_'));
  }
  function getSupabaseClient(){
    if (!isSupabaseConfigured() || !window.supabase) return null;
    const { url, anonKey } = getSupabaseConfig();
    const key = '__SETLIST_CREATOR_SUPABASE_CLIENT__';
    const signature = `${url}|${anonKey}`;
    if (!window[key] || window[key].__SETLIST_CREATOR_CONFIG__ !== signature) {
      const client = window.supabase.createClient(url, anonKey);
      client.__SETLIST_CREATOR_CONFIG__ = signature;
      window[key] = client;
    }
    return window[key];
  }
  async function waitForSupabaseConfig(){
    if (isSupabaseConfigured()) return true;
    app.setStorageStatus('Checking storage…', 'fallback');
    for (let i = 0; i < 50; i++) {
      if (isSupabaseConfigured()) return true;
      await new Promise(resolve=>setTimeout(resolve, 100));
    }
    return false;
  }

  app.loadData = async function(){
    if (await waitForSupabaseConfig()) {
      try {
        const client = getSupabaseClient();
        const [songsResponse, setlistsResponse] = await Promise.all([
          client.from('songs').select('*').order('title', { ascending: true }),
          client.from('setlists').select('*').order('date', { ascending: false })
        ]);
        if (songsResponse.error) throw songsResponse.error;
        if (setlistsResponse.error) throw setlistsResponse.error;
        state.songs = (songsResponse.data || []).map(song=>({
          id:song.id, title:song.title, key:song.key||'', sound:song.sound||'', content:song.content||''
        }));
        state.setlists = (setlistsResponse.data || []).map(setlist=>({
          id:setlist.id, name:setlist.name, date:setlist.date||'', entries:Array.isArray(setlist.entries)?setlist.entries:[]
        }));
        app.setStorageStatus('Supabase connected', 'connected');
      } catch (error) {
        console.error('Supabase load failed:', error);
        app.setStorageStatus('Supabase unavailable', 'error');
        app.showToast('Supabase offline — loading local fallback');
        state.songs = app.readStorage(STORAGE_KEYS.songs, []);
        state.setlists = app.readStorage(STORAGE_KEYS.setlists, []);
      }
    } else {
      app.setStorageStatus('Local fallback active', 'fallback');
      state.songs = app.readStorage(STORAGE_KEYS.songs, []);
      state.setlists = app.readStorage(STORAGE_KEYS.setlists, []);
    }
    app.renderSongGrid();
    app.renderSetlistSelect();
    app.renderBuildLibraryList();
    app.renderOrderList();
  };
  app.saveSongs = async function(){
    if (await waitForSupabaseConfig()) {
      try {
        const client = getSupabaseClient();
        const payload = state.songs.map(song=>({
          id:song.id, title:song.title, key:song.key||'', sound:song.sound||'', content:song.content||''
        }));
        if (payload.length) {
          const { error } = await client.from('songs').upsert(payload, { onConflict:'id' });
          if (error) throw error;
        }
        app.setStorageStatus('Supabase connected', 'connected');
        return;
      } catch (error) {
        console.error('Supabase save songs failed:', error);
        app.setStorageStatus('Supabase unavailable', 'error');
        app.showToast('Could not save to Supabase — check table/RLS and local fallback');
      }
    }
    app.setStorageStatus('Local fallback active', 'fallback');
    if (!app.writeStorage(STORAGE_KEYS.songs, state.songs)) app.showToast('Could not save — try again');
  };
  app.saveSetlists = async function(){
    if (await waitForSupabaseConfig()) {
      try {
        const client = getSupabaseClient();
        const payload = state.setlists.map(setlist=>({
          id:setlist.id, name:setlist.name, date:setlist.date||'', entries:setlist.entries||[]
        }));
        if (payload.length) {
          const { error } = await client.from('setlists').upsert(payload, { onConflict:'id' });
          if (error) throw error;
        }
        app.setStorageStatus('Supabase connected', 'connected');
        return;
      } catch (error) {
        console.error('Supabase save setlists failed:', error);
        app.setStorageStatus('Supabase unavailable', 'error');
        app.showToast('Could not save to Supabase — check table/RLS and local fallback');
      }
    }
    app.setStorageStatus('Local fallback active', 'fallback');
    if (!app.writeStorage(STORAGE_KEYS.setlists, state.setlists)) app.showToast('Could not save — try again');
  };
  app.deleteRemoteRecord = async function(table, id, storageKey, value){
    if (await waitForSupabaseConfig()) {
      try {
        const { error } = await getSupabaseClient().from(table).delete().eq('id', id);
        if (error) throw error;
        app.setStorageStatus('Supabase connected', 'connected');
        return;
      } catch (error) {
        console.error('Supabase delete failed:', error);
        app.setStorageStatus('Supabase unavailable', 'error');
        app.showToast('Could not delete from Supabase — check table/RLS');
      }
    }
    app.setStorageStatus('Local fallback active', 'fallback');
    if (!app.writeStorage(storageKey, value)) app.showToast('Could not save — try again');
  };

  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(item=>item.classList.remove('active'));
    document.querySelectorAll('.view').forEach(view=>view.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('view-' + tab.dataset.tab).classList.add('active');
  }));
  document.getElementById('confirm-cancel').addEventListener('click', ()=>{
    document.getElementById('confirm-modal-overlay').classList.remove('open');
    state.confirmCallback = null;
  });
  document.getElementById('confirm-ok').addEventListener('click', ()=>{
    document.getElementById('confirm-modal-overlay').classList.remove('open');
    if (state.confirmCallback) state.confirmCallback();
    state.confirmCallback = null;
  });
  document.addEventListener('DOMContentLoaded', ()=>{
    app.updateAuthUI();
    app.newDraft();
    app.initializeAuth();
    app.loadData();
  });
})();
