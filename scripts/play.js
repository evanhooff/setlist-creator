(function(app){
  "use strict";
  const { state }=app;
  let playTop=null,playBottom=null,playBody=null,playView=null,topTimer=null,bottomTimer=null;
  function getPlayElements(){
    if (!playTop) playTop=document.getElementById('play-top');
    if (!playBottom) playBottom=document.getElementById('play-bottom');
    if (!playBody) playBody=document.getElementById('play-content');
    if (!playView) playView=document.getElementById('play-view');
    return {playTop,playBottom,playBody,playView};
  }
  function hideTop(){const {playTop:el}=getPlayElements();if(el){clearTimeout(topTimer);el.classList.remove('visible');}}
  function hideBottom(){const {playBottom:el}=getPlayElements();if(el){clearTimeout(bottomTimer);el.classList.remove('visible');}}
  function showControls(){
    const {playTop:top,playBottom:bottom}=getPlayElements();
    if(top){top.classList.add('visible');clearTimeout(topTimer);topTimer=setTimeout(()=>top.classList.remove('visible'),2000);}
    if(bottom){bottom.classList.add('visible');clearTimeout(bottomTimer);bottomTimer=setTimeout(()=>bottom.classList.remove('visible'),2000);}
  }
  app.setPlayViewOpen=function(isOpen){
    if(!isOpen) state.playIndex=0;
    const {playView:view}=getPlayElements();
    if(!view)return;
    view.classList.toggle('open',isOpen);
    if(!isOpen){hideTop();hideBottom();}
  };
  function renderPlaySong(){
    const song=state.playSongs[state.playIndex];
    document.getElementById('play-title').textContent=song.title;
    document.getElementById('play-title-key').textContent=song.key?' - '+song.key:'';
    document.getElementById('play-sound').textContent=song.sound||'';
    document.getElementById('play-chords').textContent=song.content;
    document.getElementById('play-counter').textContent=(state.playIndex+1)+' / '+state.playSongs.length;
    document.getElementById('play-content').scrollTop=0;
    document.getElementById('play-chords').style.setProperty('--play-fs',state.playFontSize+'px');
    document.querySelectorAll('.dot').forEach((dot,index)=>dot.classList.toggle('active',index===state.playIndex));
    document.getElementById('play-prev').disabled=state.playIndex===0;
    document.getElementById('play-next').disabled=state.playIndex===state.playSongs.length-1;
  }
  function renderDots(){document.getElementById('play-dots').innerHTML=state.playSongs.map(()=>'<span class="dot"></span>').join('');}
  function nextSong(){if(state.playIndex<state.playSongs.length-1){state.playIndex++;renderPlaySong();}}
  function prevSong(){if(state.playIndex>0){state.playIndex--;renderPlaySong();}}
  app.openPlay=function(startIndex=0){
    if(!state.draft||!state.draft.entries.length){app.showToast('Build a setlist first');return;}
    state.playSongs=state.draft.entries.map(entry=>state.songs.find(song=>song.id===entry.songId)).filter(Boolean);
    if(!state.playSongs.length){app.showToast('No valid songs in this setlist');return;}
    state.playIndex=Math.min(Math.max(startIndex,0),state.playSongs.length-1);
    const {playView:view}=getPlayElements();
    document.getElementById('play-setlist-name').textContent=state.draft.name||'Setlist';
    if(view)view.classList.add('open');
    renderPlaySong();renderDots();showControls();
  };
  document.getElementById('play-btn').addEventListener('click',app.openPlay);
  document.getElementById('play-close').addEventListener('click',()=>app.setPlayViewOpen(false));
  document.getElementById('play-next').addEventListener('click',nextSong);
  document.getElementById('play-prev').addEventListener('click',prevSong);
  document.getElementById('tap-left').addEventListener('click',prevSong);
  document.getElementById('tap-right').addEventListener('click',nextSong);
  document.addEventListener('keydown',event=>{
    const {playView:view}=getPlayElements();if(!view||!view.classList.contains('open'))return;
    if(event.key==='ArrowRight')nextSong();if(event.key==='ArrowLeft')prevSong();if(event.key==='Escape')app.setPlayViewOpen(false);
  });
  const touchDevice=()=>window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;
  let touchStartX=null;
  const {playBody:activePlayBody,playView:view}=getPlayElements();
  if(view)view.addEventListener('touchstart',()=>{if(touchDevice())showControls();},{passive:true});
  if(activePlayBody){
    activePlayBody.addEventListener('touchstart',event=>{if(touchDevice())touchStartX=event.changedTouches[0].clientX;},{passive:true});
    activePlayBody.addEventListener('touchend',event=>{
      if(touchStartX===null)return;
      const dx=event.changedTouches[0].clientX-touchStartX;
      if(Math.abs(dx)>55){dx<0?nextSong():prevSong();}
      touchStartX=null;
    },{passive:true});
  }
  document.getElementById('font-plus').addEventListener('click',()=>{
    state.playFontSize=Math.min(state.playFontSize+2,32);
    document.getElementById('play-chords').style.setProperty('--play-fs',state.playFontSize+'px');
  });
  document.getElementById('font-minus').addEventListener('click',()=>{
    state.playFontSize=Math.max(state.playFontSize-2,11);
    document.getElementById('play-chords').style.setProperty('--play-fs',state.playFontSize+'px');
  });
  document.getElementById('jump-open').addEventListener('click',()=>{
    document.getElementById('jump-list').innerHTML=state.playSongs.map((song,index)=>'<div class="jump-row'+(index===state.playIndex?' current':'')+'" data-i="'+index+'">'
      +'<span class="n">'+(index+1)+'</span><span>'+app.escapeHtml(song.title)+'</span></div>').join('');
    document.getElementById('jump-scrim').classList.add('open');document.getElementById('jump-panel').classList.add('open');
  });
  function closeJump(){document.getElementById('jump-scrim').classList.remove('open');document.getElementById('jump-panel').classList.remove('open');}
  document.getElementById('jump-scrim').addEventListener('click',closeJump);
  document.getElementById('jump-list').addEventListener('click',event=>{
    const row=event.target.closest('.jump-row');if(!row)return;
    state.playIndex=parseInt(row.dataset.i,10);renderPlaySong();closeJump();
  });
})(window.SetlistCreator);
