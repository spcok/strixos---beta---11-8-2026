import { createClient } from '@supabase/supabase-js';
import { get, set, del } from 'idb-keyval';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Critical Infrastructure Failure: Missing Supabase Environment Variables');
}

// Documentation Standard: Custom Storage Adapter for Offline-First Auth
const customStorageAdapter = {
  getItem: async (key: string) => {
    const val = await get(key);
    return val ?? null;
  },
  setItem: async (key: string, value: string) => await set(key, value),
  removeItem: async (key: string) => await del(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
});