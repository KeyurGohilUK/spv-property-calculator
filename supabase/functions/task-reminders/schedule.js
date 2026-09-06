const LONDON_ZONE = 'Europe/London';

export function todayInLondon(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Returns tasks that need a reminder today. Filters to due_date <= today and >= today-7 days.
// A task overdue by more than 7 days is silently dropped to avoid endless spam.
export function findDueTasks(tasks, now = new Date()) {
  const today = todayInLondon(now);
  const cutoff = addDays(today, -7);
  const due = [];
  for (const task of tasks || []) {
    if (!task.id || !task.due_date || task.status === 'done' || task.deleted_at) continue;
    if (task.due_date > today) continue;
    if (task.due_date < cutoff) continue;
    due.push({
      taskId: String(task.id),
      taskTitle: String(task.title || 'Untitled task').slice(0, 120),
      dueDate: String(task.due_date),
      assignedTo: task.assigned_to || null,
      reminderType: task.due_date === today ? 'due_today' : 'overdue'
    });
  }
  return due;
}

export { LONDON_ZONE };
