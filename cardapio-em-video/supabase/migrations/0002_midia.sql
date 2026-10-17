-- Cardápio em Vídeo · vídeos e fotos do cardápio
-- Rode DEPOIS do 0001_inicial.sql (SQL Editor > New query > colar > Run).
-- Os arquivos ficam na pasta do restaurante: <restaurant_id>/<item_id>/<arquivo>.
-- Qualquer pessoa assiste (é o cardápio), mas só dono e gerente daquele restaurante enviam, trocam ou apagam.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midia', 'midia', true, 52428800,
        array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Confere se quem está logado é dono ou gerente do restaurante da pasta do arquivo
create or replace function public.is_manager_of_path(path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare rid uuid;
begin
  begin
    rid := split_part(path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.is_manager(rid);
end;
$$;
grant execute on function public.is_manager_of_path(text) to authenticated;

create policy "gerente envia mídia do seu restaurante" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'midia' and public.is_manager_of_path(name));

create policy "gerente troca mídia do seu restaurante" on storage.objects
  for update to authenticated
  using (bucket_id = 'midia' and public.is_manager_of_path(name))
  with check (bucket_id = 'midia' and public.is_manager_of_path(name));

create policy "gerente apaga mídia do seu restaurante" on storage.objects
  for delete to authenticated
  using (bucket_id = 'midia' and public.is_manager_of_path(name));

create policy "gerente lista mídia do seu restaurante" on storage.objects
  for select to authenticated
  using (bucket_id = 'midia' and public.is_manager_of_path(name));
