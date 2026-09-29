(function(app){
  "use strict";
  const { state, STORAGE_KEYS } = app;
  app.renderSongGrid = function(){
    const grid = document.getElementById('song-grid');
    const query = document.getElementById('lib-search').value.trim().toLowerCase();
    const list = state.songs.filter(song=>song.title.toLowerCase().includes(query)).sort((a,b)=>a.title.localeCompare(b.title));
    if (!state.songs.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><strong>No songs yet</strong>Add your first song, or bulk-import your whole repertoire from your Google Docs.</div>';
      return;
    }
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No songs match "'+app.escapeHtml(query)+'".</div>';
      return;
    }
    grid.innerHTML = list.map(song=>{
      const excerpt = (song.content||'').split('\n').find(line=>line.trim().length)||'';
      return '<div class="song-card" data-id="'+song.id+'"><div class="title">'+app.escapeHtml(song.title)+'</div>'
        +(song.sound?'<div class="meta"><span class="badge">'+app.escapeHtml(song.sound)+'</span></div>':'')
        +'<div class="excerpt">'+app.escapeHtml(excerpt)+'</div><div class="row"><span></span><div class="actions">'
        +'<button class="icon-btn edit-song" title="Edit">✎</button><button class="icon-btn delete-song" title="Delete">🗑</button>'
        +'</div></div></div>';
    }).join('');
  };
  function openSongModal(song){
    state.editingSongId = song ? song.id : null;
    document.getElementById('song-modal-title').textContent = song ? 'Edit song' : 'Add song';
    document.getElementById('song-title-input').value = song ? song.title : '';
    document.getElementById('song-key-input').value = song ? (song.key||'') : '';
    document.getElementById('song-sound-input').value = song ? (song.sound||'') : '';
    document.getElementById('song-content-input').value = song ? song.content : '';
    document.getElementById('song-modal-overlay').classList.add('open');
    setTimeout(()=>document.getElementById('song-title-input').focus(),50);
  }
  app.openSongModal = openSongModal;
  document.getElementById('lib-search').addEventListener('input',app.renderSongGrid);
  document.getElementById('song-grid').addEventListener('click',event=>{
    const card = event.target.closest('.song-card');
    if (!card) return;
    const id = card.dataset.id;
    if (event.target.classList.contains('edit-song')) {
      if (!app.requireAuthForWrite()) return;
      openSongModal(state.songs.find(song=>song.id===id));
    } else if (event.target.classList.contains('delete-song')) {
      if (!app.requireAuthForWrite()) return;
      const song = state.songs.find(item=>item.id===id);
      app.showConfirm('Delete song?','"'+song.title+'" will be removed from your library (it stays in any setlists that already used it, shown as its old title).',async()=>{
        state.songs = state.songs.filter(item=>item.id!==id);
        await app.deleteRemoteRecord('songs',id,STORAGE_KEYS.songs,state.songs);
        app.renderSongGrid(); app.renderBuildLibraryList(); app.showToast('Song deleted');
      });
    }
  });
  document.getElementById('add-song-btn').addEventListener('click',()=>{
    if (!app.requireAuthForWrite()) return;
    openSongModal(null);
  });
  document.getElementById('song-modal-cancel').addEventListener('click',()=>{
    document.getElementById('song-modal-overlay').classList.remove('open');
  });
  document.getElementById('song-modal-save').addEventListener('click',async()=>{
    if (!app.requireAuthForWrite()) return;
    const title = document.getElementById('song-title-input').value.trim();
    const key = document.getElementById('song-key-input').value.trim();
    const sound = document.getElementById('song-sound-input').value.trim();
    const content = document.getElementById('song-content-input').value;
    if (!title) { app.showToast('Give the song a title'); return; }
    if (!content.trim()) { app.showToast('Paste in the chords / text'); return; }
    if (state.editingSongId) {
      const song = state.songs.find(item=>item.id===state.editingSongId);
      song.title=title; song.key=key; song.sound=sound; song.content=content;
    } else state.songs.push({id:app.uid(),title,key,sound,content});
    await app.saveSongs();
    document.getElementById('song-modal-overlay').classList.remove('open');
    app.renderSongGrid(); app.renderBuildLibraryList();
    app.showToast('Saved');
  });
  function parseBulkImport(text){
    const result=[];
    text.split(/\n\s*---\s*\n/).forEach(block=>{
      const lines=block.replace(/^\s+/,'').split('\n');
      while(lines.length && lines[0].trim()==='') lines.shift();
      if (!lines.length) return;
      const title=lines.shift().trim();
      if (!title) return;
      let sound='';
      if (lines.length && /^sound:/i.test(lines[0].trim())) sound=lines.shift().replace(/^sound:/i,'').trim();
      const content=lines.join('\n').trim();
      if (content) result.push({title,sound,content});
    });
    return result;
  }
  document.getElementById('bulk-import-btn').addEventListener('click',()=>{
    if (!app.requireAuthForWrite()) return;
    document.getElementById('bulk-textarea').value='';
    document.getElementById('bulk-preview').textContent='';
    document.getElementById('bulk-modal-overlay').classList.add('open');
  });
  document.getElementById('bulk-modal-cancel').addEventListener('click',()=>document.getElementById('bulk-modal-overlay').classList.remove('open'));
  document.getElementById('bulk-textarea').addEventListener('input',event=>{
    const found=parseBulkImport(event.target.value);
    document.getElementById('bulk-preview').textContent=event.target.value.trim()?('Found '+found.length+' song'+(found.length===1?'':'s')):'';
  });
  document.getElementById('bulk-modal-import').addEventListener('click',async()=>{
    if (!app.requireAuthForWrite()) return;
    const found=parseBulkImport(document.getElementById('bulk-textarea').value);
    if (!found.length) { app.showToast('No songs recognised — check the format'); return; }
    found.forEach(song=>state.songs.push({id:app.uid(),title:song.title,sound:song.sound,content:song.content}));
    await app.saveSongs();
    document.getElementById('bulk-modal-overlay').classList.remove('open');
    app.renderSongGrid(); app.renderBuildLibraryList();
    app.showToast(found.length+' song'+(found.length===1?'':'s')+' imported');
  });
})(window.SetlistCreator);
