import { supabase } from '../lib/supabase';
import { addDays, format, parseISO, getDay } from 'date-fns';

export const rotaService = {
  async getRotaData(startStr: string, endStr: string) {
    const [shifts, leave, staff] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .gte('start_time', `${startStr}T00:00:00Z`)
        .lte('start_time', `${endStr}T23:59:59Z`)
        .eq('is_deleted', false),
      supabase
        .from('leave_requests')
        .select('*')
        .gte('start_date', startStr)
        .lte('end_date', endStr)
        .eq('is_deleted', false),
      supabase
        .from('users')
        // ENTERPRISE FIX: Fetch all staff so historical shift grids render correctly
        .select('id, name, initials, role, is_deleted, is_active')
        .order('name')
    ]);
    
    if (shifts.error) throw shifts.error;
    if (leave.error) throw leave.error;
    if (staff.error) throw staff.error;

    return { shifts: shifts.data || [], leave: leave.data || [], staff: staff.data || [] };
  },

  async getStaffRoster() {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, role, is_deleted, is_active')
      .order('name');
    if (error) throw error;
    return data;
  },

  async getShiftPatterns() {
    const { data, error } = await supabase
      .from('shift_patterns')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async saveShift(payload: any) {
    const { data, error } = await supabase
      .from('shifts')
      .insert([{ ...payload, is_deleted: false }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteShift(id: string) {
    const { error } = await supabase
      .from('shifts')
      .update({ is_deleted: true })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  async saveLeave(payload: any) {
    const { data, error } = await supabase
      .from('leave_requests')
      .insert([{ ...payload, is_deleted: false, status: payload.status || 'APPROVED' }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async savePattern(payload: any) {
    const { data, error } = await supabase
      .from('shift_patterns')
      .insert([{ ...payload, is_deleted: false }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deployPattern(patternId: string, userId: string, pattern: any, startDateStr: string, days: number = 28) {
    const startDate = parseISO(startDateStr);
    const shifts = [];
    const daysMap = [pattern.sunday, pattern.monday, pattern.tuesday, pattern.wednesday, pattern.thursday, pattern.friday, pattern.saturday];
    const deploymentHorizon = Math.min(days, 90);

    for (let i = 0; i < deploymentHorizon; i++) {
      const date = addDays(startDate, i);
      const dayConfig = daysMap[getDay(date)]; 
      
      if (dayConfig && dayConfig.start && dayConfig.end) {
        const dStr = format(date, 'yyyy-MM-dd');
        shifts.push({
          user_id: userId,
          start_time: `${dStr}T${dayConfig.start}:00Z`,
          end_time: `${dStr}T${dayConfig.end}:00Z`,
          status: 'SCHEDULED',
          is_deleted: false
        });
      }
    }
    
    if (shifts.length === 0) return true; 

    const { error } = await supabase.from('shifts').insert(shifts);
    if (error) throw error;
    return true;
  }
};