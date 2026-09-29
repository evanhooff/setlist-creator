(function(){
  "use strict";
  const sessionId = new URLSearchParams(window.location.search).get('session');
  let session = null;
  try {
    session = sessionId ? JSON.parse(localStorage.getItem('setlist-creator.play-session.' + sessionId) || 'null') : null;
  } catch (error) {
    console.error('Could not load play session:', error);
  }
  const songs = session && Array.isArray(session.songs) ? session.songs : [];
  let playIndex = 0;
  let playFontSize = 18;
  let topTimer = null;
  let bottomTimer = null;

  function get(id){ return document.getElementById(id); }
  function showToast(message){
    const toast = get('toast');
    toast.textContent = message;
    toast.classList.add('show');
  }
  function escapeHtml(text){
    return (text || '').replace(/[&<>"']/g, character=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[character]));
  }
  function showControls(){
    get('play-top').classList.add('visible');
    get('play-bottom').classList.add('visible');
    clearTimeout(topTimer);
    clearTimeout(bottomTimer);
    topTimer = setTimeout(()=>get('play-top').classList.remove('visible'), 2000);
    bottomTimer = setTimeout(()=>get('play-bottom').classList.remove('visible'), 2000);
  }
  function renderSong(){
    const song = songs[playIndex];
    get('play-title').textContent = song.title || '';
    get('play-title-key').textContent = song.key ? ' - ' + song.key : '';
    get('play-sound').textContent = song.sound || '';
    get('play-chords').textContent = song.content || '';
    get('play-counter').textContent = (playIndex + 1) + ' / ' + songs.length;
    get('play-content').scrollTop = 0;
    get('play-chords').style.setProperty('--play-fs', playFontSize + 'px');
    document.querySelectorAll('.dot').forEach((dot,index)=>dot.classList.toggle('active', index === playIndex));
    get('play-prev').disabled = playIndex === 0;
    get('play-next').disabled = playIndex === songs.length - 1;
  }
  function renderDots(){
    get('play-dots').innerHTML = songs.map(()=>'<span class="dot"></span>').join('');
  }
  function nextSong(){ if (playIndex < songs.length - 1) { playIndex++; renderSong(); } }
  function prevSong(){ if (playIndex > 0) { playIndex--; renderSong(); } }
  function closePlayer(){
    window.close();
    if (!window.closed) window.location.href = 'index.html';
  }

  if (!songs.length) {
    showToast('Play session not found. Open the setlist from the library page.');
    get('play-prev').disabled = true;
    get('play-next').disabled = true;
  } else {
    document.title = (session.name || 'Setlist') + ' - Setlist Player';
    get('play-setlist-name').textContent = session.name || 'Setlist';
    renderDots();
    renderSong();
    showControls();
  }

  get('play-close').addEventListener('click', closePlayer);
  get('play-next').addEventListener('click', nextSong);
  get('play-prev').addEventListener('click', prevSong);
  get('tap-left').addEventListener('click', prevSong);
  get('tap-right').addEventListener('click', nextSong);
  document.addEventListener('keydown', event=>{
    if (event.key === 'ArrowRight') nextSong();
    if (event.key === 'ArrowLeft') prevSong();
    if (event.key === 'Escape') closePlayer();
  });
  const touchDevice = ()=>window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  let touchStartX = null;
  get('play-view').addEventListener('touchstart', ()=>{ if (touchDevice()) showControls(); }, {passive:true});
  get('play-content').addEventListener('touchstart', event=>{
    if (touchDevice()) touchStartX = event.changedTouches[0].clientX;
  }, {passive:true});
  get('play-content').addEventListener('touchend', event=>{
    if (touchStartX === null) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(deltaX) > 55) deltaX < 0 ? nextSong() : prevSong();
    touchStartX = null;
  }, {passive:true});
  get('font-plus').addEventListener('click', ()=>{
    playFontSize = Math.min(playFontSize + 2, 32);
    get('play-chords').style.setProperty('--play-fs', playFontSize + 'px');
  });
  get('font-minus').addEventListener('click', ()=>{
    playFontSize = Math.max(playFontSize - 2, 11);
    get('play-chords').style.setProperty('--play-fs', playFontSize + 'px');
  });
  get('jump-open').addEventListener('click', ()=>{
    get('jump-list').innerHTML = songs.map((song,index)=>
      '<div class="jump-row' + (index === playIndex ? ' current' : '') + '" data-index="' + index + '">'
      + '<span class="n">' + (index + 1) + '</span><span>' + escapeHtml(song.title) + '</span></div>'
    ).join('');
    get('jump-scrim').classList.add('open');
    get('jump-panel').classList.add('open');
  });
  function closeJump(){
    get('jump-scrim').classList.remove('open');
    get('jump-panel').classList.remove('open');
  }
  get('jump-scrim').addEventListener('click', closeJump);
  get('jump-list').addEventListener('click', event=>{
    const row = event.target.closest('.jump-row');
    if (!row) return;
    playIndex = parseInt(row.dataset.index, 10);
    renderSong();
    closeJump();
  });
})();
