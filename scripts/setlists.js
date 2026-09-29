(function(app){
  "use strict";
  const { state, STORAGE_KEYS } = app;
  app.newDraft = function(){
    state.draft={id:null,name:'',entries:[]};
    document.getElementById('setlist-name').value='';
    document.getElementById('setlist-select').value='';
    app.renderOrderList();
  };
  app.renderSetlistSelect = function(){
    const select=document.getElementById('setlist-select');
    const current=state.draft?state.draft.id:null;
    select.innerHTML='<option value="">— New setlist —</option>'+state.setlists.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))
      .map(setlist=>'<option value="'+setlist.id+'">'+app.escapeHtml(setlist.name)+' ('+setlist.date+')</option>').join('');
    select.value=current||'';
  };
  app.renderBuildLibraryList = function(){
    const wrap=document.getElementById('build-library-list');
    const query=document.getElementById('build-search').value.trim().toLowerCase();
    const list=state.songs.filter(song=>song.title.toLowerCase().includes(query)).sort((a,b)=>a.title.localeCompare(b.title));
    if (!state.songs.length) { wrap.innerHTML='<div class="empty-state">Add songs to your library first.</div>'; return; }
    wrap.innerHTML=list.map(song=>'<div class="pick-row" data-id="'+song.id+'"><span class="title">'+app.escapeHtml(song.title)+'</span>'
      +(song.sound?'<span class="badge">'+app.escapeHtml(song.sound)+'</span>':'')+'<button class="icon-btn" title="Add to setlist">+</button></div>').join('');
  };
  app.renderOrderList = function(){
    const wrap=document.getElementById('setlist-order');
    if (!state.draft) state.draft={id:null,name:'',entries:[]};
    document.getElementById('song-count').textContent=state.draft.entries.length?'('+state.draft.entries.length+')':'';
    if (!state.draft.entries.length) { wrap.innerHTML='<div class="empty-state">Click songs on the left to add them here, in play order.</div>'; return; }
    wrap.innerHTML=state.draft.entries.map((entry,index)=>{
      const song=state.songs.find(item=>item.id===entry.songId);
      const title=song?song.title:'(deleted song)';
      const sound=song&&song.sound?'<span class="badge">'+app.escapeHtml(song.sound)+'</span>':'';
      return '<div class="order-row" draggable="true" data-entry="'+entry.entryId+'" data-index="'+index+'"><span class="order-num">'+(index+1)+'</span>'
        +'<span class="title">'+app.escapeHtml(title)+'</span>'+sound+'<div class="order-controls">'
        +'<button class="icon-btn move-up" title="Move up">▲</button><button class="icon-btn move-down" title="Move down">▼</button></div>'
        +'<button class="icon-btn remove-entry" title="Remove">✕</button></div>';
    }).join('');
  };
  document.getElementById('setlist-select').addEventListener('change',event=>{
    const id=event.target.value;
    if (!id) { app.newDraft(); return; }
    const setlist=state.setlists.find(item=>item.id===id);
    state.draft={id:setlist.id,name:setlist.name,entries:setlist.entries.map(entry=>({entryId:app.uid(),songId:entry.songId}))};
    document.getElementById('setlist-name').value=setlist.name;
    app.renderOrderList();
  });
  document.getElementById('new-setlist-btn').addEventListener('click',()=>{
    if (app.requireAuthForWrite()) app.newDraft();
  });
  document.getElementById('delete-setlist-btn').addEventListener('click',()=>{
    if (!app.requireAuthForWrite()) return;
    if (!state.draft||!state.draft.id) { app.showToast('Nothing to delete'); return; }
    const setlist=state.setlists.find(item=>item.id===state.draft.id);
    app.showConfirm('Delete setlist?','"'+setlist.name+'" will be permanently removed.',async()=>{
      state.setlists=state.setlists.filter(item=>item.id!==state.draft.id);
      await app.deleteRemoteRecord('setlists',state.draft.id,STORAGE_KEYS.setlists,state.setlists);
      app.newDraft(); app.renderSetlistSelect(); app.showToast('Setlist deleted');
    });
  });
  document.getElementById('build-search').addEventListener('input',app.renderBuildLibraryList);
  document.getElementById('build-library-list').addEventListener('click',event=>{
    if (!app.requireAuthForWrite()) return;
    const row=event.target.closest('.pick-row');
    if (!row) return;
    if (!state.draft) app.newDraft();
    state.draft.entries.push({entryId:app.uid(),songId:row.dataset.id});
    app.renderOrderList();
  });
  document.getElementById('setlist-order').addEventListener('click',event=>{
    if (!app.requireAuthForWrite()) return;
    const row=event.target.closest('.order-row');
    if (!row||!state.draft) return;
    const index=parseInt(row.dataset.index,10);
    if (event.target.classList.contains('move-up')&&index>0) {
      [state.draft.entries[index-1],state.draft.entries[index]]=[state.draft.entries[index],state.draft.entries[index-1]];
      app.renderOrderList();
    } else if (event.target.classList.contains('move-down')&&index<state.draft.entries.length-1) {
      [state.draft.entries[index+1],state.draft.entries[index]]=[state.draft.entries[index],state.draft.entries[index+1]];
      app.renderOrderList();
    } else if (event.target.classList.contains('remove-entry')) {
      state.draft.entries.splice(index,1); app.renderOrderList();
    }
  });
  let dragIndex=null;
  document.getElementById('setlist-order').addEventListener('dragstart',event=>{
    const row=event.target.closest('.order-row');
    if (!row) return;
    dragIndex=parseInt(row.dataset.index,10); row.classList.add('dragging');
  });
  document.getElementById('setlist-order').addEventListener('dragend',event=>{
    const row=event.target.closest('.order-row'); if (row) row.classList.remove('dragging');
  });
  document.getElementById('setlist-order').addEventListener('dragover',event=>{
    if (!app.requireAuthForWrite()) return;
    event.preventDefault();
    const row=event.target.closest('.order-row');
    if (!row||dragIndex===null) return;
    const overIndex=parseInt(row.dataset.index,10);
    if (overIndex===dragIndex) return;
    const moved=state.draft.entries.splice(dragIndex,1)[0];
    state.draft.entries.splice(overIndex,0,moved); dragIndex=overIndex; app.renderOrderList();
  });
  document.getElementById('save-setlist-btn').addEventListener('click',async()=>{
    if (!app.requireAuthForWrite()) return;
    const name=document.getElementById('setlist-name').value.trim();
    if (!state.draft) state.draft={id:null,name:'',entries:[]};
    if (!name) { app.showToast('Give this setlist a name'); return; }
    if (!state.draft.entries.length) { app.showToast('Add at least one song'); return; }
    state.draft.name=name;
    if (state.draft.id) {
      const existing=state.setlists.find(item=>item.id===state.draft.id);
      existing.name=name; existing.entries=state.draft.entries.map(entry=>({entryId:entry.entryId,songId:entry.songId}));
    } else {
      state.draft.id=app.uid(); state.draft.date=new Date().toISOString().slice(0,10);
      state.setlists.push({id:state.draft.id,name:state.draft.name,date:state.draft.date,entries:state.draft.entries.map(entry=>({entryId:entry.entryId,songId:entry.songId}))});
    }
    await app.saveSetlists(); app.renderSetlistSelect(); app.showToast('Setlist saved');
  });
  document.getElementById('print-btn').addEventListener('click',()=>{
    if (!state.draft||!state.draft.entries.length) { app.showToast('Build a setlist first'); return; }
    document.getElementById('print-modal-overlay').classList.add('open');
  });
  document.getElementById('print-modal-cancel').addEventListener('click',()=>document.getElementById('print-modal-overlay').classList.remove('open'));
  document.getElementById('print-modal-go').addEventListener('click',()=>{
    buildPrintArea(document.getElementById('print-include-chords').checked);
    document.getElementById('print-modal-overlay').classList.remove('open'); setTimeout(()=>window.print(),80);
  });
  function buildPrintArea(includeChords){
    const name=state.draft.name||'Setlist';
    const dateStr=new Date().toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const list=state.draft.entries.map(entry=>state.songs.find(song=>song.id===entry.songId)).filter(Boolean);
    let html='<div class="print-page"><div class="print-title">'+app.escapeHtml(name)+'</div><div class="print-sub">'+dateStr+' — '+list.length+' songs</div><ol class="print-list">'
      +list.map(song=>'<li><span>'+app.escapeHtml(song.title)+'</span>'+(song.sound?'<span class="sound">'+app.escapeHtml(song.sound)+'</span>':'')+'</li>').join('')+'</ol></div>';
    if (includeChords) list.forEach(song=>{
      html+='<div class="print-page"><div class="song-page-title">'+app.escapeHtml(song.title)+'</div>'
        +(song.sound?'<div class="song-page-sound">'+app.escapeHtml(song.sound)+'</div>':'')
        +'<hr class="song-page-hr"><div class="song-page-content">'+app.escapeHtml(song.content)+'</div></div>';
    });
    document.getElementById('print-area').innerHTML=html;
  }
})(window.SetlistCreator);
