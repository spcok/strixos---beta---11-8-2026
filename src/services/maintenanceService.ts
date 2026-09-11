import { supabase } from '../lib/supabase';

export const maintenanceService = {
  async getTickets() {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('is_deleted', false)
      .or(`status.in.(OPEN,IN_PROGRESS),created_at.gte.${fourteenDaysAgo}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getStaffMembers() {
    const { data, error } = await supabase
      .from('users')
      // ENTERPRISE FIX: Fetch all staff (including deleted) so historical tickets don't say "Unknown"
      .select('id, name, initials, email, is_deleted, is_active')
      .order('name');

    if (error) throw error;
    return data;
  },

  async saveTicket(payload: any) {
    if (!payload.id) payload.id = crypto.randomUUID();

    const { data, error } = await supabase
      .from('maintenance_tickets')
      .insert([{ ...payload, is_deleted: false }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};