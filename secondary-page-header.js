const header = document.querySelector('.header-inner');

function connectionMarkup() {
  return `<span id="connectionStatus" class="header-icon-control connection-icon" role="status" tabindex="0" aria-label="Online" title="Online" data-tooltip="Online">
    <svg class="connection-online-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5a10.2 10.2 0 0 1 14 0"></path><path d="M8 13a5.8 5.8 0 0 1 8 0"></path><path d="M10.8 16.3a1.8 1.8 0 0 1 2.4 0"></path><circle cx="12" cy="18.5" r="1"></circle></svg>
    <svg class="connection-offline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5 19.5 19.5"></path><path d="M5 9.5a10.2 10.2 0 0 1 10.8-2.1"></path><path d="M18.8 10.7c.1.1.1.1.2.2"></path><path d="M8 13a5.8 5.8 0 0 1 3-1.5"></path><path d="M14.8 13.8c.4.2.8.5 1.2.8"></path><circle cx="12" cy="18.5" r="1"></circle></svg>
  </span>`;
}

if (header && !header.querySelector('.header-actions')) {
  const actions = document.createElement('div');
  actions.className = 'header-actions';
  actions.setAttribute('aria-label', 'App controls');
  actions.innerHTML = `${connectionMarkup()}
    <button id="accountBtn" class="header-icon-control" type="button" aria-label="Account" title="Account" data-tooltip="Account">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25"></circle><path d="M5.5 19c.7-3.5 3-5.3 6.5-5.3s5.8 1.8 6.5 5.3"></path></svg>
    </button>
    <button id="installBtn" class="header-icon-control" type="button" aria-label="Install app" title="Install app" data-tooltip="Install app">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v10"></path><path d="m8.5 10.5 3.5 3.5 3.5-3.5"></path><path d="M5 16.5v2.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-2.2"></path></svg>
    </button>`;
  header.appendChild(actions);

  const connection = document.getElementById('connectionStatus');
  const updateConnection = () => {
    const online = navigator.onLine;
    connection.classList.toggle('offline', !online);
    connection.setAttribute('aria-label', online ? 'Online' : 'Offline');
    connection.title = online ? 'Online' : 'Offline';
    connection.dataset.tooltip = online ? 'Online' : 'Offline';
  };
  updateConnection();
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);

  document.getElementById('accountBtn').addEventListener('click', () => {
    window.location.href = './?dialog=account';
  });
  document.getElementById('installBtn').addEventListener('click', () => {
    window.location.href = './?dialog=install';
  });
}
