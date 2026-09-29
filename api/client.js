const clientScript = `(function(){
  "use strict";
  async function request(url, options){
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('Request failed: ' + response.status);
    return response.json();
  }
  window.SetlistCreatorApi = {
    loadConfig: function(){ return request('/api/config'); },
    validatePassword: function(password){
      return request('/api/validate-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password })
      });
    }
  };
  window.SetlistCreatorApi.loadConfig().then(function(config){
    window.SETLIST_CREATOR_CONFIG = config;
  }).catch(function(error){
    console.warn('Could not load runtime config:', error);
  });
})();`;

export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  response.status(200).send(clientScript);
}
