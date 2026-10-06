(() => {
  if (window.__warriorAcademicaLoaded) return;
  window.__warriorAcademicaLoaded = true;
  const loggedIn = location.hostname !== 'login.wayne.edu' && !document.querySelector('input[type="password"]');
  chrome.runtime.sendMessage({
    type: 'ACADEMICA_STATUS',
    payload: {
      status: loggedIn ? 'online' : 'login',
      lastSeen: new Date().toISOString()
    }
  }).catch(() => {});
})();
