import { appendSafeRichText } from '../../utils/rich-text.js';

export function renderRichTaskDescriptions(root = document) {
  root.querySelectorAll?.('.task-card-description:not([data-rich-text-ready])').forEach((description) => {
    const value = description.textContent || '';
    appendSafeRichText(description, value);
    description.dataset.richTextReady = 'true';
  });
}

function removeTaskBetaBadge() {
  document.querySelector('.task-shell .beta-badge')?.remove();
}

function setupTaskDescriptionRendering() {
  removeTaskBetaBadge();
  const taskList = document.getElementById('taskList');
  if (!taskList) return;

  renderRichTaskDescriptions(taskList);
  const observer = new MutationObserver(() => renderRichTaskDescriptions(taskList));
  observer.observe(taskList, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupTaskDescriptionRendering, { once: true });
} else {
  setupTaskDescriptionRendering();
}
