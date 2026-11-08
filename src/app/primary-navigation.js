import { getIconSvg } from '../components/shared-icons.js';

function link(item, activePage, home) {
  const active = item.id === activePage;
  const id = home && item.id === 'properties' ? ' id="propertiesNavLink"' : '';
  const icon = getIconSvg(item.id === 'portfolio' ? 'properties' : item.id);
  return `<a${id} class="primary-nav-item${active ? ' active' : ''}" href="${item.href}"${active ? ' aria-current="page"' : ''}>
    ${icon}
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
    { id: 'company', label: 'Company', href: './company/' },
    { id: 'expenses', label: 'Expenses', href: './expenses/' },
    { id: 'tasks', label: 'Tasks', href: './tasks/' },
    { id: 'forecast', label: 'Forecast', href: './forecast/', badge: 'Beta' }
  ];
  nav.innerHTML = `${items.map((item) => link(item, activePage, home)).join('')}
    <button${home ? ' id="moreNavBtn"' : ''} class="primary-nav-item" type="button" data-more-menu aria-haspopup="dialog">
      ${getIconSvg('more')}<span>More</span>
    </button>`;
  nav.dataset.rendered = 'true';
  return nav;
}
