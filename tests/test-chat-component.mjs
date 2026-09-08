import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const component = fs.readFileSync(new URL('src/components/chat-thread.js', root), 'utf8');
const sharedCss = fs.readFileSync(new URL('styles/components/chat-thread.css', root), 'utf8');
const styles = fs.readFileSync(new URL('styles.css', root), 'utf8');
const propertyApp = fs.readFileSync(new URL('src/app/app.js', root), 'utf8');
const propertyHtml = fs.readFileSync(new URL('index.html', root), 'utf8');
const editorCss = fs.readFileSync(new URL('styles/features/editor.css', root), 'utf8');
const taskApp = fs.readFileSync(new URL('src/features/tasks/tasks.js', root), 'utf8');
const taskHtml = fs.readFileSync(new URL('tasks/index.html', root), 'utf8');
const taskCss = fs.readFileSync(new URL('styles/features/tasks.css', root), 'utf8');

assert.match(component, /export function renderChatThread/, 'Shared chat renderer must be exported');
assert.match(component, /export function setChatComposerMode/, 'Shared chat composer state must be exported');
assert.match(component, /text\.textContent = String\(getMessage/, 'Chat messages must render through textContent');
assert.doesNotMatch(component, /innerHTML/, 'Shared chat must not render message content through innerHTML');
assert.match(sharedCss, /\.chat-list/, 'Shared chat list styles are missing');
assert.match(sharedCss, /\.chat-composer/, 'Shared chat composer styles are missing');
assert.match(styles, /styles\/components\/chat-thread\.css/, 'Global stylesheet must import shared chat styles');

assert.match(propertyApp, /renderChatThread/, 'Property Notes must use the shared chat renderer');
assert.match(propertyHtml, /id="notesList" class="chat-list"/, 'Property Notes must use the shared chat list');
assert.match(propertyHtml, /class="chat-composer"/, 'Property Notes must use the shared chat composer');
assert.doesNotMatch(editorCss, /\.note-message(?:\s|\{|\.)|\.note-bubble(?:\s|\{|\.)|\.notes-list\s*\{|\.note-composer(?:\s|\{|\.)|\.note-send-btn(?:\s|\{|\.)/, 'Retired note-specific chat styles must be removed');

assert.match(taskApp, /renderChatThread/, 'Task Discussion must use the shared chat renderer');
assert.match(taskApp, /setChatComposerMode/, 'Task Discussion edit state must use the shared chat composer');
assert.match(taskHtml, /id="taskDiscussionHeading"[^>]*>Discussion</, 'Task chat must remain labelled Discussion');
assert.match(taskHtml, /id="taskCommentList" class="chat-list task-discussion-list"/, 'Task Discussion must use the shared chat list');
assert.match(taskHtml, /id="addTaskCommentBtn" class="chat-send-btn"/, 'Task Discussion must use the shared send action');
assert.doesNotMatch(taskCss, /\.task-comment-(?:list|meta|body|composer|actions|edit-btn)/, 'Retired task-specific discussion styles must be removed');

console.log('Shared chat component checks passed.');
