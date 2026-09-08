export function renderChatThread({
  container,
  messages = [],
  currentUserId = null,
  getId = (item) => item.id,
  getAuthorId = (item) => item.authorId,
  getAuthorName = (item) => item.authorName || 'Workspace member',
  getMessage = (item) => item.message || '',
  getCreatedAt = (item) => item.createdAt || '',
  getUpdatedAt = (item) => item.updatedAt || '',
  formatTimestamp = (value) => value || '',
  onEdit = null,
  onDelete = null,
  deletingId = null,
  emptyTitle = 'No messages yet',
  emptyDescription = 'Start the conversation.'
} = {}) {
  if (!container) return;
  container.replaceChildren();

  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    const icon = document.createElement('div');
    icon.className = 'chat-empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '💬';
    const title = document.createElement('p');
    title.textContent = emptyTitle;
    const description = document.createElement('small');
    description.textContent = emptyDescription;
    empty.append(icon, title, description);
    container.appendChild(empty);
    return;
  }

  messages.forEach((item) => {
    const id = String(getId(item) || '');
    const authorId = getAuthorId(item) || null;
    const authorName = String(getAuthorName(item) || 'Workspace member');
    const isMine = Boolean(currentUserId && authorId && authorId === currentUserId);
    const createdAt = getCreatedAt(item) || '';
    const updatedAt = getUpdatedAt(item) || '';
    const wasEdited = Boolean(updatedAt && createdAt && updatedAt !== createdAt);

    const article = document.createElement('article');
    article.className = `chat-message ${isMine ? 'mine' : 'theirs'}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = authorName.split(/\s+/).filter(Boolean).slice(0, 2)
      .map((part) => part[0] || '').join('').toUpperCase() || '?';

    const stack = document.createElement('div');
    stack.className = 'chat-message-stack';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    const text = document.createElement('p');
    text.textContent = String(getMessage(item) || '');
    bubble.appendChild(text);

    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    const author = document.createElement('strong');
    author.textContent = isMine ? 'You' : authorName;
    const separator = document.createElement('span');
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '·';
    const time = document.createElement('time');
    time.dateTime = updatedAt || createdAt;
    time.textContent = `${formatTimestamp(updatedAt || createdAt)}${wasEdited ? ' · edited' : ''}`;
    meta.append(author, separator, time);

    if (isMine && onEdit) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'chat-message-action';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', 'Edit your message');
      edit.addEventListener('click', () => onEdit(item));
      meta.appendChild(edit);
    }

    if (isMine && onDelete) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = `chat-message-action chat-message-delete${deletingId === id ? ' is-loading' : ''}`;
      remove.textContent = deletingId === id ? 'Deleting…' : 'Delete';
      remove.disabled = deletingId === id;
      remove.setAttribute('aria-label', 'Delete your message');
      remove.addEventListener('click', () => onDelete(item));
      meta.appendChild(remove);
    }

    stack.append(bubble, meta);
    article.append(avatar, stack);
    container.appendChild(article);
  });

  requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}

export function setChatComposerMode({
  label,
  textarea,
  sendButton,
  cancelButton,
  editing = false,
  value = ''
} = {}) {
  if (label) label.textContent = editing ? 'Edit message' : 'Add a message';
  if (textarea) {
    textarea.value = value;
    textarea.placeholder = editing ? 'Update your message…' : 'Write a message…';
  }
  if (sendButton) {
    const action = editing ? 'Save edited message' : 'Send message';
    sendButton.setAttribute('aria-label', action);
    sendButton.title = action;
  }
  if (cancelButton) cancelButton.classList.toggle('hidden', !editing);
}
