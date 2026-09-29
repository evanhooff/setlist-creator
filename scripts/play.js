(function(app){
  "use strict";
  const SESSION_PREFIX = 'setlist-creator.play-session.';

  document.getElementById('play-btn').addEventListener('click', ()=>{
    const state = app.state;
    if (!state.draft || !state.draft.entries.length) {
      app.showToast('Build a setlist first');
      return;
    }
    const songs = state.draft.entries
      .map(entry=>state.songs.find(song=>song.id===entry.songId))
      .filter(Boolean);
    if (!songs.length) {
      app.showToast('No valid songs in this setlist');
      return;
    }

    const sessionId = app.uid();
    const sessionKey = SESSION_PREFIX + sessionId;
    try {
      localStorage.setItem(sessionKey, JSON.stringify({
        name: state.draft.name || 'Setlist',
        songs
      }));
      const playUrl = new URL('play.html', window.location.href);
      playUrl.searchParams.set('session', sessionId);
      window.location.assign(playUrl.href);
    } catch (error) {
      console.error('Could not open play window:', error);
      localStorage.removeItem(sessionKey);
      app.showToast('Could not open the play window');
    }
  });
})(window.SetlistCreator);
