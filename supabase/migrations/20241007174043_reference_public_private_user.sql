alter table "public"."User" add column "user_id" uuid;

alter table "public"."User" add constraint "User_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."User" validate constraint "User_user_id_fkey";


