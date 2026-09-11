import { supabase } from '../lib/supabase';

export const weightService = {
  // Keeping the function name 'insertWeightLog' so we don't break UI imports
  insertWeightLog: async (payload: any) => {
    try {
      // FIX: Changed .insert() to .upsert() to handle edits
      const { data, error } = await supabase
        .from('weight_logs')
        .upsert(payload) 
        .select()
        .single();
        
      if (error) throw error;
      return data;
      
    } catch (error: any) {
      console.warn("Network unreachable or upsert failed. Queueing offline...", error);
      throw error; 
    }
  }
};