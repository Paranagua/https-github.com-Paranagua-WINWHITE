// Cliente Supabase EXTERNO — aponta para o projeto onde o bot da Discloud grava
// os resultados da Blaze. Mantido separado do cliente do Lovable Cloud.
import { createClient } from "@supabase/supabase-js";

const BLAZE_SUPABASE_URL = "https://fprjzaawmhadvwdlyfun.supabase.co";
const BLAZE_SUPABASE_ANON_KEY = "sb_publishable_6_SYqk2nwh4IyEgwLGtiuQ_JI_Zf9Ov";

export const blazeSupabase = createClient(BLAZE_SUPABASE_URL, BLAZE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("apikey", BLAZE_SUPABASE_ANON_KEY);
      if (headers.get("Authorization") === `Bearer ${BLAZE_SUPABASE_ANON_KEY}`) {
        headers.delete("Authorization");
      }
      return fetch(input, { ...init, headers });
    },
  },
});
