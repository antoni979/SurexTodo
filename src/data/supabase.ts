import { createClient } from "@supabase/supabase-js";

// SurexTodo vive en el proyecto Supabase de la Intranet (esquema `todo`).
//
// La URL y la clave anónima son PÚBLICAS por diseño: van dentro del bundle de
// cualquier web que use Supabase (la propia Intranet incluida). Lo que
// protege los datos son las políticas RLS y las funciones del esquema `todo`,
// que exigen sesión y ser usuario activo del todo. Por eso pueden vivir aquí
// en vez de en variables de entorno de Vercel.
export const SUPABASE_URL = "https://ujfyperwnppmrnvnnrhy.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZnlwZXJ3bnBwbXJudm5ucmh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0ODA1ODQsImV4cCI6MjA4MjA1NjU4NH0.ZFmJOal1xuHqt7D1JAHPfzqJd9Gv8o6Is9QqpHcU83Q";

export const ATTACHMENTS_BUCKET = "todo-adjuntos";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "sxt-auth" },
  db: { schema: "todo" },
});
