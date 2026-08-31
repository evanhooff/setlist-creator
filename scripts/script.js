(function(){
  "use strict";

  /* ---------------- State ---------------- */
  let songs = [];       // {id, title, key, content}
  let setlists = [];    // {id, name, date, entries:[{entryId, songId}]}
  let draft = null;     // in-progress setlist being edited: {id, name, entries:[]}
  let editingSongId = null;
  let playSongs = [];   // resolved song objects for the active play session
  let playIndex = 0;
  let playFontSize = 18;
  let confirmCallback = null;

  /* ---------------- Utilities ---------------- */
  const STORAGE_KEYS = {
    songs: 'setlist-creator.songs',
    setlists: 'setlist-creator.setlists'
  };
  const AUTH_KEYS = {
    session: 'setlist-creator.auth.session'
  };

  function isAuthUnlocked(){
    return localStorage.getItem(AUTH_KEYS.session) === 'true';
  }

  function setAuthUnlocked(value){
    if (value) {
      localStorage.setItem(AUTH_KEYS.session, 'true');
    } else {
      localStorage.removeItem(AUTH_KEYS.session);
    }
    updateAuthUI();
  }

  function updateAuthUI(){
    const lockBtn = document.getElementById('auth-lock-btn');
    if (lockBtn) {
      lockBtn.textContent = isAuthUnlocked() ? 'Lock' : 'Unlock';
    }

    const addBtn = document.getElementById('add-song-btn');
    const bulkBtn = document.getElementById('bulk-import-btn');
    const saveSetlistBtn = document.getElementById('save-setlist-btn');
    const newSetlistBtn = document.getElementById('new-setlist-btn');
    const deleteSetlistBtn = document.getElementById('delete-setlist-btn');
    const controls = [addBtn, bulkBtn, saveSetlistBtn, newSetlistBtn, deleteSetlistBtn];
    controls.forEach(btn => {
      if (!btn) return;
      const shouldDisable = !isAuthUnlocked();
      btn.disabled = shouldDisable;
      btn.style.opacity = shouldDisable ? '0.5' : '';
      btn.style.pointerEvents = shouldDisable ? 'none' : '';
    });

    const storageStatus = document.getElementById('storage-status');
    if (storageStatus && !isAuthUnlocked()) {
      storageStatus.textContent = 'Editing locked';
      storageStatus.classList.remove('connected', 'fallback', 'error');
      storageStatus.classList.add('error');
    }
  }

  function requireAuthForWrite(){
    if (!isAuthUnlocked()) {
      openAuthModal();
      showToast('Enter the password to edit');
      return false;
    }
    return true;
  }

  function openAuthModal(){
    const overlay = document.getElementById('auth-modal-overlay');
    const input = document.getElementById('auth-password-input');
    input.value = '';
    overlay.classList.add('open');
    setTimeout(() => input.focus(), 50);
  }

  function closeAuthModal(){
    document.getElementById('auth-modal-overlay').classList.remove('open');
  }

  function initializeAuth(){
    if (!isAuthUnlocked()) {
      openAuthModal();
    }
  }

  function getSupabaseConfig(){
    const cfg = window.SETLIST_CREATOR_CONFIG || {};
    return {
      url: (cfg.supabaseUrl || '').trim(),
      anonKey: (cfg.supabaseAnonKey || '').trim()
    };
  }

  function isSupabaseConfigured(){
    const { url, anonKey } = getSupabaseConfig();
    return Boolean(url && anonKey && !url.includes('YOUR_') && !anonKey.includes('YOUR_'));
  }

  function getSupabaseClient(){
    if (!isSupabaseConfigured() || !window.supabase) return null;
    const { url, anonKey } = getSupabaseConfig();
    const cacheKey = '__SETLIST_CREATOR_SUPABASE_CLIENT__';
    const configSignature = `${url}|${anonKey}`;

    if (!window[cacheKey] || window[cacheKey].__SETLIST_CREATOR_CONFIG__ !== configSignature) {
      const client = window.supabase.createClient(url, anonKey);
      client.__SETLIST_CREATOR_CONFIG__ = configSignature;
      window[cacheKey] = client;
    }

    return window[cacheKey];
  }

  async function waitForSupabaseConfig() {
    if (isSupabaseConfigured()) return true;
    setStorageStatus('Checking storage…', 'fallback');
    for (let i = 0; i < 50; i++) {
      if (isSupabaseConfigured()) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  function uid(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
  function escapeHtml(str){
    return (str||'').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function readStorage(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch (error){
      return fallback;
    }
  }
  function writeStorage(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }catch (error){
      return false;
    }
  }
  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._h);
    showToast._h = setTimeout(()=>t.classList.remove('show'), 2200);
  }
  function showConfirm(title, message, onConfirm){
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = onConfirm;
    document.getElementById('confirm-modal-overlay').classList.add('open');
  }
  function setStorageStatus(label, tone){
    const statusEl = document.getElementById('storage-status');
    if (!statusEl) return;
    statusEl.textContent = label;
    statusEl.classList.remove('connected', 'fallback', 'error');
    if (tone) statusEl.classList.add(tone);
  }

  /* ---------------- Storage ---------------- */
  async function loadData(){
    if (await waitForSupabaseConfig()) {
      try{
        const client = getSupabaseClient();
        const [songsResponse, setlistsResponse] = await Promise.all([
          client.from('songs').select('*').order('title', { ascending: true }),
          client.from('setlists').select('*').order('date', { ascending: false })
        ]);

        if (songsResponse.error) throw songsResponse.error;
        if (setlistsResponse.error) throw setlistsResponse.error;

        songs = (songsResponse.data || []).map(song => ({
          id: song.id,
          title: song.title,
          key: song.key || '',
          content: song.content || ''
        }));

        setlists = (setlistsResponse.data || []).map(setlist => ({
          id: setlist.id,
          name: setlist.name,
          date: setlist.date || '',
          entries: Array.isArray(setlist.entries) ? setlist.entries : []
        }));

        setStorageStatus('Supabase connected', 'connected');
        renderSongGrid();
        renderSetlistSelect();
        renderBuildLibraryList();
        renderOrderList();
        return;
      }catch (error){
        console.error('Supabase load failed:', error);
        setStorageStatus('Supabase unavailable', 'error');
        showToast('Supabase offline — loading local fallback');
      }
    }

    setStorageStatus('Local fallback active', 'fallback');
    songs = readStorage(STORAGE_KEYS.songs, []);
    setlists = readStorage(STORAGE_KEYS.setlists, []);
    renderSongGrid();
    renderSetlistSelect();
    renderBuildLibraryList();
    renderOrderList();
  }

  async function saveSongs(){
    if (await waitForSupabaseConfig()){
      try{
        const client = getSupabaseClient();
        const payload = songs.map(song => ({
          id: song.id,
          title: song.title,
          key: song.key || '',
          content: song.content || ''
        }));

        if (payload.length > 0){
          const { error } = await client.from('songs').upsert(payload, { onConflict: 'id' });
          if (error) throw error;
        }
        setStorageStatus('Supabase connected', 'connected');
        return;
      }catch (error){
        console.error('Supabase save songs failed:', error);
        setStorageStatus('Supabase unavailable', 'error');
        showToast('Could not save to Supabase — check table/RLS and local fallback');
      }
    }

    setStorageStatus('Local fallback active', 'fallback');
    const ok = writeStorage(STORAGE_KEYS.songs, songs);
    if(!ok) showToast('Could not save — try again');
  }

  async function saveSetlists(){
    if (await waitForSupabaseConfig()){
      try{
        const client = getSupabaseClient();
        const payload = setlists.map(setlist => ({
          id: setlist.id,
          name: setlist.name,
          date: setlist.date || '',
          entries: setlist.entries || []
        }));

        if (payload.length > 0){
          const { error } = await client.from('setlists').upsert(payload, { onConflict: 'id' });
          if (error) throw error;
        }
        setStorageStatus('Supabase connected', 'connected');
        return;
      }catch (error){
        console.error('Supabase save setlists failed:', error);
        setStorageStatus('Supabase unavailable', 'error');
        showToast('Could not save to Supabase — check table/RLS and local fallback');
      }
    }

    setStorageStatus('Local fallback active', 'fallback');
    const ok = writeStorage(STORAGE_KEYS.setlists, setlists);
    if(!ok) showToast('Could not save — try again');
  }

  /* ---------------- Tabs ---------------- */
  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('view-' + tab.dataset.tab).classList.add('active');
    });
  });

  /* ---------------- Library rendering ---------------- */
  function renderSongGrid(){
    const grid = document.getElementById('song-grid');
    const q = document.getElementById('lib-search').value.trim().toLowerCase();
    const list = songs.filter(s=>s.title.toLowerCase().includes(q))
                       .sort((a,b)=>a.title.localeCompare(b.title));
    if(songs.length === 0){
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><strong>No songs yet</strong>Add your first song, or bulk-import your whole repertoire from your Google Docs.</div>';
      return;
    }
    if(list.length === 0){
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No songs match "'+escapeHtml(q)+'".</div>';
      return;
    }
    grid.innerHTML = list.map(s=>{
      const excerpt = (s.content||'').split('\n').find(l=>l.trim().length) || '';
      return '<div class="song-card" data-id="'+s.id+'">'
        + '<div class="title">'+escapeHtml(s.title)+'</div>'
        + (s.key ? '<div class="meta"><span class="badge">'+escapeHtml(s.key)+'</span></div>' : '')
        + '<div class="excerpt">'+escapeHtml(excerpt)+'</div>'
        + '<div class="row"><span></span><div class="actions">'
        + '<button class="icon-btn edit-song" title="Edit">✎</button>'
        + '<button class="icon-btn delete-song" title="Delete">🗑</button>'
        + '</div></div></div>';
    }).join('');
  }
  document.getElementById('lib-search').addEventListener('input', renderSongGrid);
  document.getElementById('song-grid').addEventListener('click', (e)=>{
    const card = e.target.closest('.song-card');
    if(!card) return;
    const id = card.dataset.id;
    if(e.target.classList.contains('edit-song')){
      if (!requireAuthForWrite()) return;
      openSongModal(songs.find(s=>s.id===id));
    }else if(e.target.classList.contains('delete-song')){
      if (!requireAuthForWrite()) return;
      const song = songs.find(s=>s.id===id);
      showConfirm('Delete song?', '"' + song.title + '" will be removed from your library (it stays in any setlists that already used it, shown as its old title).', async ()=>{
        songs = songs.filter(s=>s.id!==id);
        await saveSongs();
        renderSongGrid(); renderBuildLibraryList();
        showToast('Song deleted');
      });
    }
  });

  /* ---------------- Song add/edit modal ---------------- */
  function openSongModal(song){
    editingSongId = song ? song.id : null;
    document.getElementById('song-modal-title').textContent = song ? 'Edit song' : 'Add song';
    document.getElementById('song-title-input').value = song ? song.title : '';
    document.getElementById('song-key-input').value = song ? (song.key||'') : '';
    document.getElementById('song-content-input').value = song ? song.content : '';
    document.getElementById('song-modal-overlay').classList.add('open');
    setTimeout(()=>document.getElementById('song-title-input').focus(), 50);
  }
  document.getElementById('add-song-btn').addEventListener('click', ()=>{
    if (!requireAuthForWrite()) return;
    openSongModal(null);
  });
  document.getElementById('song-modal-cancel').addEventListener('click', ()=>{
    document.getElementById('song-modal-overlay').classList.remove('open');
  });
  document.getElementById('song-modal-save').addEventListener('click', async ()=>{
    if (!requireAuthForWrite()) return;
    const title = document.getElementById('song-title-input').value.trim();
    const key = document.getElementById('song-key-input').value.trim();
    const content = document.getElementById('song-content-input').value;
    if(!title){ showToast('Give the song a title'); return; }
    if(!content.trim()){ showToast('Paste in the chords / text'); return; }
    if(editingSongId){
      const s = songs.find(s=>s.id===editingSongId);
      s.title = title; s.key = key; s.content = content;
    }else{
      songs.push({id:uid(), title, key, content});
    }
    await saveSongs();
    document.getElementById('song-modal-overlay').classList.remove('open');
    renderSongGrid(); renderBuildLibraryList();
    showToast('Saved');
  });

  /* ---------------- Bulk import ---------------- */
  document.getElementById('bulk-import-btn').addEventListener('click', ()=>{
    if (!requireAuthForWrite()) return;
    document.getElementById('bulk-textarea').value = '';
    document.getElementById('bulk-preview').textContent = '';
    document.getElementById('bulk-modal-overlay').classList.add('open');
  });
  document.getElementById('bulk-modal-cancel').addEventListener('click', ()=>{
    document.getElementById('bulk-modal-overlay').classList.remove('open');
  });
  function parseBulkImport(text){
    const blocks = text.split(/\n\s*---\s*\n/);
    const result = [];
    blocks.forEach(block=>{
      const lines = block.replace(/^\s+/, '').split('\n');
      while(lines.length && lines[0].trim() === '') lines.shift();
      if(lines.length === 0) return;
      const title = lines.shift().trim();
      if(!title) return;
      let key = '';
      if(lines.length && /^key:/i.test(lines[0].trim())){
        key = lines.shift().replace(/^key:/i,'').trim();
      }
      const content = lines.join('\n').trim();
      if(content) result.push({title, key, content});
    });
    return result;
  }
  document.getElementById('bulk-textarea').addEventListener('input', (e)=>{
    const found = parseBulkImport(e.target.value);
    document.getElementById('bulk-preview').textContent = e.target.value.trim() ? ('Found ' + found.length + ' song' + (found.length===1?'':'s')) : '';
  });
  document.getElementById('bulk-modal-import').addEventListener('click', async ()=>{
    if (!requireAuthForWrite()) return;
    const found = parseBulkImport(document.getElementById('bulk-textarea').value);
    if(found.length === 0){ showToast('No songs recognised — check the format'); return; }
    found.forEach(f=> songs.push({id:uid(), title:f.title, key:f.key, content:f.content}));
    await saveSongs();
    document.getElementById('bulk-modal-overlay').classList.remove('open');
    renderSongGrid(); renderBuildLibraryList();
    showToast(found.length + ' song' + (found.length===1?'':'s') + ' imported');
  });

  /* ---------------- Confirm modal wiring ---------------- */
  document.getElementById('confirm-cancel').addEventListener('click', ()=>{
    document.getElementById('confirm-modal-overlay').classList.remove('open');
    confirmCallback = null;
  });
  document.getElementById('confirm-ok').addEventListener('click', ()=>{
    document.getElementById('confirm-modal-overlay').classList.remove('open');
    if(confirmCallback) confirmCallback();
    confirmCallback = null;
  });

  /* ---------------- Build / setlist view ---------------- */
  function newDraft(){
    draft = {id:null, name:'', entries:[]};
    document.getElementById('setlist-name').value = '';
    document.getElementById('setlist-select').value = '';
    renderOrderList();
  }
  function renderSetlistSelect(){
    const sel = document.getElementById('setlist-select');
    const current = draft ? draft.id : null;
    sel.innerHTML = '<option value="">— New setlist —</option>' +
      setlists.slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''))
        .map(s=>'<option value="'+s.id+'">'+escapeHtml(s.name)+' ('+s.date+')</option>').join('');
    sel.value = current || '';
  }
  document.getElementById('setlist-select').addEventListener('change', (e)=>{
    const id = e.target.value;
    if(!id){ newDraft(); return; }
    const s = setlists.find(s=>s.id===id);
    draft = {id:s.id, name:s.name, entries: s.entries.map(en=>({entryId:uid(), songId:en.songId}))};
    document.getElementById('setlist-name').value = s.name;
    renderOrderList();
  });
  document.getElementById('new-setlist-btn').addEventListener('click', ()=>{
    if (!requireAuthForWrite()) return;
    newDraft();
  });
  document.getElementById('delete-setlist-btn').addEventListener('click', ()=>{
    if (!requireAuthForWrite()) return;
    if(!draft || !draft.id){ showToast('Nothing to delete'); return; }
    const s = setlists.find(s=>s.id===draft.id);
    showConfirm('Delete setlist?', '"'+s.name+'" will be permanently removed.', async ()=>{
      setlists = setlists.filter(s=>s.id!==draft.id);
      await saveSetlists();
      newDraft();
      renderSetlistSelect();
      showToast('Setlist deleted');
    });
  });

  function renderBuildLibraryList(){
    const wrap = document.getElementById('build-library-list');
    const q = document.getElementById('build-search').value.trim().toLowerCase();
    const list = songs.filter(s=>s.title.toLowerCase().includes(q)).sort((a,b)=>a.title.localeCompare(b.title));
    if(songs.length === 0){
      wrap.innerHTML = '<div class="empty-state">Add songs to your library first.</div>';
      return;
    }
    wrap.innerHTML = list.map(s=>
      '<div class="pick-row" data-id="'+s.id+'">'
      + '<span class="title">'+escapeHtml(s.title)+'</span>'
      + (s.key ? '<span class="badge">'+escapeHtml(s.key)+'</span>' : '')
      + '<button class="icon-btn" title="Add to setlist">+</button>'
      + '</div>'
    ).join('');
  }
  document.getElementById('build-search').addEventListener('input', renderBuildLibraryList);
  document.getElementById('build-library-list').addEventListener('click', (e)=>{
    if (!requireAuthForWrite()) return;
    const row = e.target.closest('.pick-row');
    if(!row) return;
    if(!draft) newDraft();
    draft.entries.push({entryId:uid(), songId:row.dataset.id});
    renderOrderList();
  });

  function renderOrderList(){
    const wrap = document.getElementById('setlist-order');
    if(!draft) draft = {id:null, name:'', entries:[]};
    document.getElementById('song-count').textContent = draft.entries.length ? ('(' + draft.entries.length + ')') : '';
    if(draft.entries.length === 0){
      wrap.innerHTML = '<div class="empty-state">Click songs on the left to add them here, in play order.</div>';
      return;
    }
    wrap.innerHTML = draft.entries.map((en, i)=>{
      const song = songs.find(s=>s.id===en.songId);
      const title = song ? song.title : '(deleted song)';
      const key = song && song.key ? '<span class="badge">'+escapeHtml(song.key)+'</span>' : '';
      return '<div class="order-row" draggable="true" data-entry="'+en.entryId+'" data-index="'+i+'">'
        + '<span class="order-num">'+(i+1)+'</span>'
        + '<span class="title">'+escapeHtml(title)+'</span>'
        + key
        + '<div class="order-controls">'
        + '<button class="icon-btn move-up" title="Move up">▲</button>'
        + '<button class="icon-btn move-down" title="Move down">▼</button>'
        + '</div>'
        + '<button class="icon-btn remove-entry" title="Remove">✕</button>'
        + '</div>';
    }).join('');
  }
  document.getElementById('setlist-order').addEventListener('click', (e)=>{
    if (!requireAuthForWrite()) return;
    const row = e.target.closest('.order-row');
    if(!row || !draft) return;
    const idx = parseInt(row.dataset.index, 10);
    if(e.target.classList.contains('move-up') && idx > 0){
      [draft.entries[idx-1], draft.entries[idx]] = [draft.entries[idx], draft.entries[idx-1]];
      renderOrderList();
    }else if(e.target.classList.contains('move-down') && idx < draft.entries.length-1){
      [draft.entries[idx+1], draft.entries[idx]] = [draft.entries[idx], draft.entries[idx+1]];
      renderOrderList();
    }else if(e.target.classList.contains('remove-entry')){
      draft.entries.splice(idx,1);
      renderOrderList();
    }
  });
  // Drag reorder (desktop mouse)
  let dragIndex = null;
  document.getElementById('setlist-order').addEventListener('dragstart', (e)=>{
    const row = e.target.closest('.order-row');
    if(!row) return;
    dragIndex = parseInt(row.dataset.index, 10);
    row.classList.add('dragging');
  });
  document.getElementById('setlist-order').addEventListener('dragend', (e)=>{
    const row = e.target.closest('.order-row');
    if(row) row.classList.remove('dragging');
  });
  document.getElementById('setlist-order').addEventListener('dragover', (e)=>{
    if (!requireAuthForWrite()) return;
    e.preventDefault();
    const row = e.target.closest('.order-row');
    if(!row || dragIndex === null) return;
    const overIndex = parseInt(row.dataset.index, 10);
    if(overIndex === dragIndex) return;
    const moved = draft.entries.splice(dragIndex,1)[0];
    draft.entries.splice(overIndex,0,moved);
    dragIndex = overIndex;
    renderOrderList();
  });

  document.getElementById('save-setlist-btn').addEventListener('click', async ()=>{
    if (!requireAuthForWrite()) return;
    const name = document.getElementById('setlist-name').value.trim();
    if(!draft) draft = {id:null, name:'', entries:[]};
    if(!name){ showToast('Give this setlist a name'); return; }
    if(draft.entries.length === 0){ showToast('Add at least one song'); return; }
    draft.name = name;
    if(draft.id){
      const existing = setlists.find(s=>s.id===draft.id);
      existing.name = name;
      existing.entries = draft.entries.map(en=>({entryId:en.entryId, songId:en.songId}));
    }else{
      draft.id = uid();
      draft.date = new Date().toISOString().slice(0,10);
      setlists.push({id:draft.id, name:draft.name, date:draft.date, entries:draft.entries.map(en=>({entryId:en.entryId, songId:en.songId}))});
    }
    await saveSetlists();
    renderSetlistSelect();
    showToast('Setlist saved');
  });

  /* ---------------- Print ---------------- */
  document.getElementById('print-btn').addEventListener('click', ()=>{
    if(!draft || draft.entries.length === 0){ showToast('Build a setlist first'); return; }
    document.getElementById('print-modal-overlay').classList.add('open');
  });
  document.getElementById('print-modal-cancel').addEventListener('click', ()=>{
    document.getElementById('print-modal-overlay').classList.remove('open');
  });
  document.getElementById('print-modal-go').addEventListener('click', ()=>{
    const includeChords = document.getElementById('print-include-chords').checked;
    buildPrintArea(includeChords);
    document.getElementById('print-modal-overlay').classList.remove('open');
    setTimeout(()=>window.print(), 80);
  });
  function buildPrintArea(includeChords){
    const name = draft.name || 'Setlist';
    const dateStr = new Date().toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});
    const list = draft.entries.map(en=>songs.find(s=>s.id===en.songId)).filter(Boolean);
    let html = '<div class="print-page">'
      + '<div class="print-title">'+escapeHtml(name)+'</div>'
      + '<div class="print-sub">'+dateStr+' — '+list.length+' songs</div>'
      + '<ol class="print-list">'
      + list.map(s=>'<li><span>'+escapeHtml(s.title)+'</span>'+(s.key?'<span class="k">'+escapeHtml(s.key)+'</span>':'')+'</li>').join('')
      + '</ol></div>';
    if(includeChords){
      list.forEach(s=>{
        html += '<div class="print-page">'
          + '<div class="song-page-title">'+escapeHtml(s.title)+'</div>'
          + (s.key ? '<div class="song-page-key">'+escapeHtml(s.key)+'</div>' : '')
          + '<hr class="song-page-hr">'
          + '<div class="song-page-content">'+escapeHtml(s.content)+'</div>'
          + '</div>';
      });
    }
    document.getElementById('print-area').innerHTML = html;
  }

  /* ---------------- Play view ---------------- */
  let playTop = null;
  let playBody = null;
  let playView = null;
  let playTopHideTimer = null;
  function getPlayElements(){
    if(!playTop) playTop = document.getElementById('play-top');
    if(!playBody) playBody = document.getElementById('play-content');
    if(!playView) playView = document.getElementById('play-view');
    return { playTop, playBody, playView };
  }
  function setPlayViewOpen(isOpen){
    const { playView: activePlayView } = getPlayElements();
    if(!activePlayView) return;
    activePlayView.classList.toggle('open', isOpen);
    if(!isOpen) hidePlayTop();
  }
  function showPlayTop(autoHide = true){
    const { playTop: activePlayTop } = getPlayElements();
    if(!activePlayTop || !window.matchMedia('(max-width: 760px)').matches) return;
    activePlayTop.classList.add('visible');
    if(!autoHide) return;
    clearTimeout(playTopHideTimer);
    playTopHideTimer = setTimeout(()=>{
      activePlayTop.classList.remove('visible');
    }, 1000);
  }
  function hidePlayTop(){
    const { playTop: activePlayTop } = getPlayElements();
    if(!activePlayTop) return;
    clearTimeout(playTopHideTimer);
    activePlayTop.classList.remove('visible');
  }

  document.getElementById('play-btn').addEventListener('click', openPlay);
  function openPlay(){
    if(!draft || draft.entries.length === 0){ showToast('Build a setlist first'); return; }
    playSongs = draft.entries.map(en=>songs.find(s=>s.id===en.songId)).filter(Boolean);
    if(playSongs.length === 0){ showToast('No valid songs in this setlist'); return; }
    playIndex = 0;
    const { playView: activePlayView } = getPlayElements();
    document.getElementById('play-setlist-name').textContent = draft.name || 'Setlist';
    if(activePlayView) activePlayView.classList.add('open');
    renderPlaySong();
    renderDots();
    showPlayTop(true);
  }
  document.getElementById('play-close').addEventListener('click', ()=>{
    setPlayViewOpen(false);
  });
  function renderPlaySong(){
    const s = playSongs[playIndex];
    document.getElementById('play-title').textContent = s.title;
    document.getElementById('play-key').textContent = s.key || '';
    document.getElementById('play-chords').textContent = s.content;
    document.getElementById('play-counter').textContent = (playIndex+1) + ' / ' + playSongs.length;
    document.getElementById('play-content').scrollTop = 0;
    document.getElementById('play-chords').style.setProperty('--play-fs', playFontSize + 'px');
    document.querySelectorAll('.dot').forEach((d,i)=>d.classList.toggle('active', i===playIndex));
    document.getElementById('play-prev').disabled = playIndex === 0;
    document.getElementById('play-next').disabled = playIndex === playSongs.length - 1;
  }
  function renderDots(){
    const wrap = document.getElementById('play-dots');
    wrap.innerHTML = playSongs.map(()=>'<span class="dot"></span>').join('');
  }
  function nextSong(){ if(playIndex < playSongs.length-1){ playIndex++; renderPlaySong(); } }
  function prevSong(){ if(playIndex > 0){ playIndex--; renderPlaySong(); } }
  document.getElementById('play-next').addEventListener('click', nextSong);
  document.getElementById('play-prev').addEventListener('click', prevSong);
  document.getElementById('tap-left').addEventListener('click', prevSong);
  document.getElementById('tap-right').addEventListener('click', nextSong);
  document.addEventListener('keydown', (e)=>{
    const { playView: activePlayView } = getPlayElements();
    if(!activePlayView || !activePlayView.classList.contains('open')) return;
    if(e.key === 'ArrowRight') nextSong();
    if(e.key === 'ArrowLeft') prevSong();
    if(e.key === 'Escape') setPlayViewOpen(false);
  });
  // swipe
  let touchStartX = null;
  let touchStartY = null;
  function setupPlayBodySwipe(){
    const { playBody: activePlayBody } = getPlayElements();
    if(!activePlayBody || activePlayBody.dataset.swipeBound === 'true') return;
    activePlayBody.dataset.swipeBound = 'true';
    activePlayBody.addEventListener('touchstart', (e)=>{
      const touch = e.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      if(window.innerWidth <= 760 && touchStartY <= 38){
        showPlayTop(false);
      }
    }, {passive:true});
    activePlayBody.addEventListener('touchmove', (e)=>{
      if(window.innerWidth > 760 || touchStartY === null) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if(touchStartY <= 38 && dy > 18 && Math.abs(dx) < 55){
        showPlayTop(false);
      }
    }, {passive:true});
    activePlayBody.addEventListener('touchend', (e)=>{
      if(touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if(Math.abs(dx) > 55){ dx < 0 ? nextSong() : prevSong(); }
      touchStartX = null;
      touchStartY = null;
    }, {passive:true});
  }
  setupPlayBodySwipe();

  document.getElementById('font-plus').addEventListener('click', ()=>{
    playFontSize = Math.min(playFontSize+2, 32);
    document.getElementById('play-chords').style.setProperty('--play-fs', playFontSize + 'px');
  });
  document.getElementById('font-minus').addEventListener('click', ()=>{
    playFontSize = Math.max(playFontSize-2, 11);
    document.getElementById('play-chords').style.setProperty('--play-fs', playFontSize + 'px');
  });

  document.getElementById('jump-open').addEventListener('click', ()=>{
    const listWrap = document.getElementById('jump-list');
    listWrap.innerHTML = playSongs.map((s,i)=>
      '<div class="jump-row'+(i===playIndex?' current':'')+'" data-i="'+i+'">'
      + '<span class="n">'+(i+1)+'</span><span>'+escapeHtml(s.title)+'</span></div>'
    ).join('');
    document.getElementById('jump-scrim').classList.add('open');
    document.getElementById('jump-panel').classList.add('open');
  });
  function closeJump(){
    document.getElementById('jump-scrim').classList.remove('open');
    document.getElementById('jump-panel').classList.remove('open');
  }
  document.getElementById('jump-scrim').addEventListener('click', closeJump);
  document.getElementById('jump-list').addEventListener('click', (e)=>{
    const row = e.target.closest('.jump-row');
    if(!row) return;
    playIndex = parseInt(row.dataset.i, 10);
    renderPlaySong();
    closeJump();
  });

  document.getElementById('auth-lock-btn').addEventListener('click', ()=>{
    if (isAuthUnlocked()) {
      setAuthUnlocked(false);
      showToast('Editing locked');
      openAuthModal();
      return;
    }
    openAuthModal();
  });

  document.getElementById('auth-modal-cancel').addEventListener('click', ()=>{
    closeAuthModal();
    if (!isAuthUnlocked()) {
      showToast('Editing locked');
    }
  });

  document.getElementById('auth-modal-action').addEventListener('click', async ()=>{
    const value = document.getElementById('auth-password-input').value.trim();
    if (!value) {
      showToast('Enter a password');
      return;
    }

    try {
      const response = await fetch('/api/validate-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value })
      });

      if (!response.ok) {
        throw new Error('Password check failed');
      }

      const result = await response.json();
      if (result.valid) {
        setAuthUnlocked(true);
        closeAuthModal();
        showToast('Unlocked');
      } else {
        showToast('Incorrect password');
      }
    } catch (error) {
      console.error('Password validation failed:', error);
      showToast('Password check failed');
    }
  });

  /* ---------------- Init ---------------- */
  updateAuthUI();
  newDraft();
  initializeAuth();
  loadData();
})();
