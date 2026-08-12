-- Enable RLS on notes
alter table public.property_notes enable row level security;

-- Recreate the delete-own-note policy
drop policy if exists
  "Authenticated users can delete their own property notes"
on public.property_notes;

create policy
  "Authenticated users can delete their own property notes"
on public.property_notes
for delete
to authenticated
using (
  (select auth.uid()) = author_user_id
);

-- Permissions
revoke delete on table public.property_notes from anon;

grant select, insert, delete
on table public.property_notes
to authenticated;