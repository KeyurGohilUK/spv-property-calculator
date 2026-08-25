import { setupDialog } from './src/components/dialog-helper.js';

(function initialiseHelpGuide() {
  'use strict';
  const STORAGE_KEY = 'spv-help-guide-seen';
  const steps = [
    { icon: '👋', eyebrow: 'Welcome', title: 'Your SPV property workspace', body: 'Use this app to compare property purchase costs, record actual expenses and explore long-term forecasts—all from one simple workspace.' },
    { icon: '↓', eyebrow: 'Install the app', title: 'Keep it on your Home Screen', body: '<span data-install-guide-copy></span><br><small>You can also open the Install menu from the download icon at the top of the app to check for updates.</small>' },
    { icon: '♙', eyebrow: 'Account & sync', title: 'Sign in to protect your workspace', body: 'Tap the Account icon at the top, then create an account or sign in. When signed in, use Sync to keep your properties and expenses available across your devices.' },
    { icon: '•••', eyebrow: 'App overview', title: 'Everything is one tap away', body: '<ul class="help-guide-menu-list"><li><strong>Properties</strong> — create and compare purchase calculations.</li><li><strong>Expenses</strong> — record company or property spending and receipts.</li><li><strong>Forecast</strong> — explore rental cash flow, value and equity scenarios.</li><li><strong>More</strong> — change theme, reopen this guide or view archived properties.</li></ul>' }
  ];
  let currentStep = 0;
  let dialog;
  let dialogController;

  function hasSeenGuide() { try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; } }
  function markGuideSeen() { try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* Storage may be unavailable. */ } }
  function installDirections() {
    const platform = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(platform)) return 'In Safari, tap <strong>Share</strong>, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.';
    if (/Android/i.test(platform)) return 'In Chrome, tap the <strong>⋮</strong> menu, then choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.';
    return 'Open the Install menu from the download icon at the top, then choose <strong>Install now</strong> when available.';
  }
  function renderStep() {
    const step = steps[currentStep];
    dialog.querySelector('[data-help-icon]').textContent = step.icon;
    dialog.querySelector('[data-help-eyebrow]').textContent = step.eyebrow;
    dialog.querySelector('[data-help-title]').textContent = step.title;
    dialog.querySelector('[data-help-body]').innerHTML = step.body;
    const installCopy = dialog.querySelector('[data-install-guide-copy]');
    if (installCopy) installCopy.innerHTML = installDirections();
    dialog.querySelector('[data-help-progress]').textContent = `${currentStep + 1} of ${steps.length}`;
    dialog.querySelector('[data-help-back]').classList.toggle('hidden', currentStep === 0);
    dialog.querySelector('[data-help-next]').textContent = currentStep === steps.length - 1 ? 'Finish' : 'Next';
    dialog.querySelectorAll('[data-help-dot]').forEach((dot, index) => dot.classList.toggle('active', index === currentStep));
  }
  function openGuide(trigger) { currentStep = 0; renderStep(); dialogController.open(trigger); }
  function closeGuide() { markGuideSeen(); dialogController.close(); }
  function bindTriggers(root = document) {
    root.querySelectorAll('[data-help-guide]').forEach((trigger) => {
      if (trigger.dataset.helpBound === 'true') return;
      trigger.dataset.helpBound = 'true';
      trigger.addEventListener('click', () => { trigger.closest('dialog')?.close(); openGuide(document.activeElement); });
    });
  }
  function init() {
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="helpGuideDialog" class="install-dialog help-guide-dialog" aria-labelledby="helpGuideTitle">
        <button class="dialog-close" type="button" data-help-close aria-label="Close help guide">×</button>
        <div class="help-guide-progress-row"><span data-help-progress>1 of ${steps.length}</span><div class="help-guide-dots" aria-hidden="true">${steps.map((_, index) => `<i data-help-dot class="${index === 0 ? 'active' : ''}"></i>`).join('')}</div></div>
        <div class="help-guide-icon" data-help-icon aria-hidden="true"></div><p class="eyebrow" data-help-eyebrow></p>
        <h3 id="helpGuideTitle" data-help-title></h3><div class="help-guide-body" data-help-body></div>
        <div class="help-guide-actions"><button class="secondary-btn hidden" type="button" data-help-back>Back</button><button class="primary-btn" type="button" data-help-next>Next</button></div>
      </dialog>`);
    dialog = document.getElementById('helpGuideDialog');
    dialogController = setupDialog(dialog, {
      closeButtons: [dialog.querySelector('[data-help-close]')],
      initialFocus: () => dialog.querySelector('[data-help-next]')
    });
    dialog.addEventListener('close', markGuideSeen);
    bindTriggers();
    dialog.querySelector('[data-help-back]').addEventListener('click', () => { currentStep -= 1; renderStep(); });
    dialog.querySelector('[data-help-next]').addEventListener('click', () => { if (currentStep === steps.length - 1) closeGuide(); else { currentStep += 1; renderStep(); } });
    dialog.addEventListener('cancel', markGuideSeen);
    renderStep();
    if (!hasSeenGuide()) window.setTimeout(openGuide, 450);
  }
  window.SPVHelpGuide = { bindTriggers, openGuide };
  document.addEventListener('DOMContentLoaded', init);
}());
