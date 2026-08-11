window.SETLIST_CREATOR_CONFIG = window.SETLIST_CREATOR_CONFIG || {};

async function loadRuntimeConfig() {
  try{
    const response = await fetch('/api/config');
    if (!response.ok) return;
    const config = await response.json();
    window.SETLIST_CREATOR_CONFIG = config;
  } catch (error) {
    console.warn('Could not load runtime config:', error);
  }
}

loadRuntimeConfig();
