const icons = Object.freeze({
  properties: '<path d="M3 11.5 12 4l9 7.5"></path><path d="M5.5 10v10h13V10"></path><path d="M9.5 20v-6h5v6"></path>',
  expenses: '<rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h4"></path>',
  forecast: '<path d="M4 19V9M10 19V5M16 19v-7M22 19V3"></path>',
  more: '<circle cx="5" cy="12" r="1.3"></circle><circle cx="12" cy="12" r="1.3"></circle><circle cx="19" cy="12" r="1.3"></circle>'
});

function link(item, activePage, home) {
  const active = item.id === activePage;
  const id = home && item.id === 'properties' ? ' id="propertiesNavLink"' : '';
  return `<a${id} class="primary-nav-item${active ? ' active' : ''}" href="${item.href}"${active ? ' aria-current="page"' : ''}>
    <svg viewBox="0 0 24 24" aria-hidden="true">${icons[item.id]}</svg>
    <span>${item.label}</span>${item.badge ? `<small>${item.badge}</small>` : ''}
  </a>`;
}

export function setupPrimaryNavigation(root = document) {
  const nav = root.querySelector('[data-primary-navigation]');
  if (!nav || nav.dataset.rendered === 'true') return nav;
  const activePage = nav.dataset.activePage || 'properties';
  const home = nav.dataset.home === 'true';
  const items = [
    { id: 'properties', label: 'Properties', href: './' },
    { id: 'expenses', label: 'Expenses', href: './expenses/' },
    { id: 'forecast', label: 'Forecast', href: './forecast/', badge: 'Beta' }
  ];
  nav.innerHTML = `${items.map((item) => link(item, activePage, home)).join('')}
    <button${home ? ' id="moreNavBtn"' : ''} class="primary-nav-item" type="button" data-more-menu aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" aria-hidden="true">${icons.more}</svg><span>More</span>
    </button>`;
  nav.dataset.rendered = 'true';
  return nav;
}
