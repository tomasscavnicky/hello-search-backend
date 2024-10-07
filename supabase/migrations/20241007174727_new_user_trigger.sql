set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public."User" (name, type, user_id)
  values (new.raw_user_meta_data ->> 'first_name' || ' ' || new.raw_user_meta_data ->> 'last_name', 'human', new.id);
  return new;
end;
$function$
;


