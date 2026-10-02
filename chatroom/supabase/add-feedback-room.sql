-- Add #feedback to the allowed public chat rooms.

drop policy if exists "Insert messages" on public.messages;

create policy "Insert messages"
  on public.messages for insert
  with check (
    length(content) <= 500
    and length(username) <= 30
    and room in ('lobby', 'artists', 'builders', 'marketers', 'travelers', 'random', 'feedback')
  );
