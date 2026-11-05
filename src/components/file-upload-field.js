const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.ceil(kb) + ' KB';
};

class FileUploadField extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready === 'true') return;
    const inputId = this.getAttribute('input-id');
    const label = document.createElement('label');
    label.className = 'field receipt-field file-upload-field';
    const title = document.createElement('span');
    title.className = 'file-upload-title';
    title.append(document.createTextNode(this.getAttribute('label') || 'Choose file'));
    if (this.hasAttribute('optional')) {
      const optional = document.createElement('em');
      optional.textContent = 'optional';
      title.append(' ', optional);
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.id = inputId || '';
    input.accept = this.getAttribute('accept') || '';
    if (this.hasAttribute('multiple')) input.multiple = true;
    if (this.hasAttribute('capture')) input.setAttribute('capture', this.getAttribute('capture'));
    if (this.hasAttribute('disabled')) input.disabled = true;
    for (const attribute of this.attributes) {
      if (attribute.name.startsWith('data-')) input.setAttribute(attribute.name, attribute.value);
    }

    const describedBy = [];
    const status = document.createElement('span');
    status.className = 'receipt-file-size';
    status.setAttribute('aria-live', 'polite');
    status.textContent = this.getAttribute('empty-label') || 'No file selected';
    if (this.hasAttribute('status-id')) {
      status.id = this.getAttribute('status-id');
      describedBy.push(status.id);
    }

    const helpText = this.getAttribute('help') || '';
    if (helpText) {
      const help = document.createElement('small');
      help.className = 'file-upload-help';
      help.textContent = helpText;
      if (this.hasAttribute('help-id')) {
        help.id = this.getAttribute('help-id');
        describedBy.push(help.id);
      }
      label.append(title, input, status, help);
    } else {
      label.append(title, input, status);
    }

    if (this.hasAttribute('error-id')) {
      const error = document.createElement('small');
      error.id = this.getAttribute('error-id');
      error.className = 'file-upload-error error-text hidden';
      label.append(error);
      describedBy.push(error.id);
    }
    if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' '));

    const updateStatus = () => {
      const files = [...input.files || []];
      status.textContent = files.length
        ? 'Selected: ' + files.map((file) => file.name + ' · ' + formatFileSize(file.size)).join(', ')
        : (this.getAttribute('empty-label') || 'No file selected');
    };
    input.addEventListener('input', updateStatus);
    input.addEventListener('change', updateStatus);
    this.replaceChildren(label);
    this.dataset.ready = 'true';
  }
}

if (!customElements.get('file-upload-field')) {
  customElements.define('file-upload-field', FileUploadField);
}
