import { appendLinkifiedText } from '../../utils/linkified-text.js';

export function linkifyTaskDescriptions(root = document) {
  root.querySelectorAll?.('.task-card-description:not([data-links-ready])').forEach((description) => {
    const value = description.textContent || '';
    appendLinkifiedText(description, value);
    description.dataset.linksReady = 'true';
  });
}

function removeTaskBetaBadge() {
  document.querySelector('.task-shell .beta-badge')?.remove();
}

function setupTaskDescriptionLinks() {
  removeTaskBetaBadge();
  const taskList = document.getElementById('taskList');
  if (!taskList) return;

  linkifyTaskDescriptions(taskList);
  const observer = new MutationObserver(() => linkifyTaskDescriptions(taskList));
  observer.observe(taskList, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupTaskDescriptionLinks, { once: true });
} else {
  setupTaskDescriptionLinks();
}
