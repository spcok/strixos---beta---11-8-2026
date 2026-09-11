import { supabase } from '../lib/supabase';

export const feedingService = {
  insertFeedLog: async (payload: any | any[]) => {
    try {
      const { data, error } = await supabase
        .from('feed_logs')
        .upsert(payload) 
        .select();
        
      if (error) throw error;
      return data;
    } catch (error: any) {
      console.warn("Network unreachable or upsert failed. Queueing offline...", error);
      throw error; 
    }
  },

  bulkCreateSchedules: async (schedules: any[], userId: string) => {
    try {
      const payload = schedules.map(schedule => ({
        ...schedule,
        created_by: userId,
        modified_by: userId 
      }));

      const { data, error } = await supabase
        .from('feeding_schedules')
        .insert(payload)
        .select();
        
      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error("Failed to create feeding schedules:", error);
      throw error;
    }
  },

  // FIX: Converted to a Soft-Delete to satisfy RLS and Audit constraints
  deleteSchedule: async (scheduleId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('feeding_schedules')
        .update({ 
          is_deleted: true, 
          modified_by: userId 
        })
        .eq('id', scheduleId);
        
      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error(`Failed to delete schedule ${scheduleId}:`, error);
      throw error;
    }
  }
};