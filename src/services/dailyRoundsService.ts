import { supabase } from '../lib/supabase';
import { DailyRound } from '../types';

export const dailyRoundsService = {
  async getRoundsByDateAndShift(date: string, shift: string): Promise<DailyRound[]> {
    const { data, error } = await supabase
      .from('daily_rounds')
      .select('*')
      .eq('date', date)
      .eq('shift', shift)
      .eq('is_deleted', false);

    if (error) throw error;
    return data as DailyRound[];
  },

  async bulkUpsertRounds(rounds: Partial<DailyRound>[]) {
    // Supabase upsert automatically merges existing records based on unique constraints
    // This replaces all the manual loop/merge logic we had previously
    const { data, error } = await supabase
      .from('daily_rounds')
      .upsert(rounds, { onConflict: 'animal_id,date,shift' })
      .select();

    if (error) throw error;
    return data;
  },

  async updateRoundNotes(roundId: string, notes: string | null) {
    const { data, error } = await supabase
      .from('daily_rounds')
      .update({
        animal_issue_note: notes
      })
      .eq('id', roundId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};