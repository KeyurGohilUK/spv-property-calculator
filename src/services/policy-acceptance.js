import { renderAccessState } from './access-gate.js';

export const POLICY_VERSION = '2026-08-26';

let pendingAcceptance = null;

function isCurrent(record) {
  return record?.terms_version === POLICY_VERSION
    && record?.privacy_version === POLICY_VERSION
    && record?.disclaimer_version === POLICY_VERSION;
}

function setPolicyRequired(root = document) {
  root.body.classList.remove('auth-pending', 'auth-anonymous', 'auth-authenticated');
  root.body.classList.add('auth-policy-required');
}

function getDialog(root = document) {
  let dialog = root.getElementById('policyAcceptanceDialog');
  if (dialog) return dialog;
  const legalRoot = new URL('../../legal/', import.meta.url);
  root.body.insertAdjacentHTML('beforeend', `
    <dialog id="policyAcceptanceDialog" class="install-dialog policy-acceptance-dialog" aria-labelledby="policyAcceptanceTitle">
      <p class="eyebrow">One-time acknowledgement</p>
      <h2 id="policyAcceptanceTitle">Review the legal information</h2>
      <p>Before opening the private workspace, please review the current legal documents.</p>
      <ul>
        <li><a href="${new URL('terms.html', legalRoot).href}" target="_blank" rel="noopener">Terms of Use</a></li>
        <li><a href="${new URL('privacy.html', legalRoot).href}" target="_blank" rel="noopener">Privacy Policy</a></li>
        <li><a href="${new URL('disclaimer.html', legalRoot).href}" target="_blank" rel="noopener">Planning Disclaimer</a></li>
      </ul>
      <label class="policy-confirmation"><input id="policyAcceptanceCheck" type="checkbox"><span>I agree to the Terms of Use and acknowledge that I have read the Privacy Policy and Disclaimer.</span></label>
      <p id="policyAcceptanceMessage" class="auth-message" role="status" aria-live="polite"></p>
      <div class="policy-acceptance-actions"><button id="acceptPoliciesBtn" class="primary-btn" type="button" disabled>Accept and continue</button><button id="declinePoliciesBtn" class="secondary-btn" type="button">Sign out</button></div>
      <p class="muted tiny">Acceptance version ${POLICY_VERSION}. The date and versions accepted will be stored with your account.</p>
    </dialog>`);
  return root.getElementById('policyAcceptanceDialog');
}

function collectAcceptance({ user, cloud, root = document }) {
  const dialog = getDialog(root);
  const checkbox = root.getElementById('policyAcceptanceCheck');
  const acceptButton = root.getElementById('acceptPoliciesBtn');
  const declineButton = root.getElementById('declinePoliciesBtn');
  const message = root.getElementById('policyAcceptanceMessage');
  checkbox.checked = false;
  acceptButton.disabled = true;
  message.textContent = '';
  setPolicyRequired(root);
  dialog.addEventListener('cancel', (event) => event.preventDefault(), { once: true });
  if (!dialog.open) dialog.showModal();

  return new Promise((resolve) => {
    const finish = (accepted) => {
      checkbox.removeEventListener('change', onChange);
      acceptButton.removeEventListener('click', onAccept);
      declineButton.removeEventListener('click', onDecline);
      if (dialog.open) dialog.close();
      resolve(accepted);
    };
    const onChange = () => { acceptButton.disabled = !checkbox.checked; };
    const onAccept = async () => {
      if (!checkbox.checked) return;
      acceptButton.disabled = true;
      declineButton.disabled = true;
      message.textContent = 'Saving your acknowledgement…';
      try {
        await cloud.acceptPolicies(POLICY_VERSION);
        message.textContent = '';
        finish(true);
      } catch (error) {
        message.textContent = error.message || 'Could not save your acknowledgement. Please try again.';
        acceptButton.disabled = false;
        declineButton.disabled = false;
      }
    };
    const onDecline = async () => {
      declineButton.disabled = true;
      message.textContent = 'Signing out…';
      try { await cloud.signOut(); } finally { finish(false); }
    };
    checkbox.addEventListener('change', onChange);
    acceptButton.addEventListener('click', onAccept);
    declineButton.addEventListener('click', onDecline);
  });
}

export async function requireCurrentPolicyAcceptance(user, { cloud = window.SPVCloud, root = document } = {}) {
  if (!user) return false;
  if (pendingAcceptance) return pendingAcceptance;
  pendingAcceptance = (async () => {
    try {
      const record = await cloud.getPolicyAcceptance();
      if (isCurrent(record)) return true;
      return await collectAcceptance({ user, cloud, root });
    } catch (error) {
      console.warn('Policy acceptance check failed:', error);
      return await collectAcceptance({ user, cloud, root });
    }
  })();
  try {
    const accepted = await pendingAcceptance;
    if (accepted) renderAccessState(user, { root });
    return accepted;
  } finally {
    pendingAcceptance = null;
  }
}
