import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function buildMissingEnvError() {
  return new Error('Supabase environment variables are missing.');
}

const stubAuth = {
  getSession: async () => ({ data: { session: null }, error: buildMissingEnvError() }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  signOut: async () => ({ error: buildMissingEnvError() }),
  signInWithPassword: async () => ({ data: null, error: buildMissingEnvError() }),
  updateUser: async () => ({ data: null, error: buildMissingEnvError() }),
  signInWithOtp: async () => ({ data: null, error: buildMissingEnvError() }),
  verifyOtp: async () => ({ data: null, error: buildMissingEnvError() }),
  resetPasswordForEmail: async () => ({ data: null, error: buildMissingEnvError() }),
  setSession: async () => ({ data: null, error: buildMissingEnvError() }),
};

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : {
        auth: stubAuth,
      };
