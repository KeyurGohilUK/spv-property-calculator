const pending = new Map();
let dialog;
let status;
let visibleSince = 0;
const MINIMUM_VISIBLE_MS = 1000;

function mountLoader() {
  dialog = document.createElement('dialog');
  dialog.className = 'blocking-loader';
  dialog.setAttribute('aria-labelledby', 'blockingLoaderStatus');
  dialog.setAttribute('autofocus', '');
  dialog.addEventListener('cancel', (event) => event.preventDefault());

  const artwork = document.createElement('picture');
  const still = document.createElement('source');
  still.media = '(prefers-reduced-motion: reduce)';
  still.srcset = new URL('../../icons/icon-192.png', import.meta.url).href;
  const image = document.createElement('img');
  image.src = new URL('../../icons/spv-loading.gif', import.meta.url).href;
  image.alt = '';
  image.width = 128;
  image.height = 128;
  artwork.append(still, image);

  status = document.createElement('p');
  status.id = 'blockingLoaderStatus';
  status.setAttribute('role', 'status');
  dialog.append(artwork, status);
  document.body.append(dialog);
}

function updateLoader() {
  if (!pending.size) return;
  status.textContent = Array.from(pending.values()).at(-1);
  if (!dialog.open) {
    dialog.showModal();
    visibleSince = performance.now();
  }
}

export async function withBlockingLoader(message, operation) {
  if (!dialog) mountLoader();

  const request = Symbol();
  pending.set(request, message);
  try {
    updateLoader();
    return await operation();
  } finally {
    pending.delete(request);
    if (pending.size) {
      updateLoader();
    } else {
      const elapsed = performance.now() - visibleSince;
      const remaining = Math.max(0, MINIMUM_VISIBLE_MS - elapsed);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      if (!pending.size && dialog.open) dialog.close();
    }
  }
}
