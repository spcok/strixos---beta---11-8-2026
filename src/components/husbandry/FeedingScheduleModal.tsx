import React from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { CalendarClock, Loader2, Utensils, RefreshCw, X, AlertCircle } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Animal, FeedingSchedule as FeedingScheduleType, OperationalList } from '../../types';
import { feedingService } from '../../services/feedingService';

interface FeedingScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCategory: string;
}

const getAnimalsOptions = () => queryOptions({
  queryKey: ['animals', 'dashboard'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('*').eq('archived', false);
    if (error) throw error;
    return data as Animal[];
  },
  staleTime: 1000 * 60 * 5,
  networkMode: 'offlineFirst',
});

const getFoodOptions = () => queryOptions({
  queryKey: ['operational_lists', 'food_type'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('operational_lists')
      .select('*')
      .ilike('category', 'food_type')
      .eq('is_deleted', false)
      .order('name');
    if (error) throw error;
    return data as OperationalList[];
  },
  staleTime: 1000 * 60 * 5,
  networkMode: 'offlineFirst',
});

const getLocalDateString = () => format(new Date(), 'yyyy-MM-dd');

export const FeedingScheduleModal: React.FC<FeedingScheduleModalProps> = ({ isOpen, onClose, activeCategory }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: animals = [], isLoading: loadingAnimals } = useQuery(getAnimalsOptions());
  const { data: foodOptions = [], isLoading: loadingFood } = useQuery(getFoodOptions());

  const filteredAnimals = React.useMemo(() => 
    animals.filter(a => (a.category || '').toUpperCase() === activeCategory),
  [animals, activeCategory]);

  const filteredFoodOptions = React.useMemo(() => 
    foodOptions.filter((f: any) => 
      !f.animal_category || String(f.animal_category).toUpperCase().includes(activeCategory)
    ),
  [foodOptions, activeCategory]);

  const form = useForm({
    defaultValues: {
      animal_id: '',
      food_type: '',
      quantity: 1,
      calci_dust: false,
      feed_not_required: false,
      schedule_mode: 'single' as 'single' | 'interval',
      target_date: getLocalDateString(),
      interval_days: 3,
      occurrences: 5
    },
    onSubmit: async ({ value }) => {
      try {
        if (!user?.id) throw new Error('You must be logged in to schedule diets.');
        
        let datesToSchedule: string[] = [];

        if (value.schedule_mode === 'single') {
          datesToSchedule.push(value.target_date);
        } else {
          const startDate = parseISO(value.target_date);
          for (let i = 0; i < value.occurrences; i++) {
            const nextFeedDate = addDays(startDate, i * value.interval_days);
            datesToSchedule.push(format(nextFeedDate, 'yyyy-MM-dd'));
          }
        }

        // Schema-validated payload matching feeding_schedules table
        const newSchedules: Partial<FeedingScheduleType>[] = datesToSchedule.map(date => ({
          animal_id: value.animal_id,
          scheduled_date: date,
          food_type: value.feed_not_required ? 'NOT REQUIRED' : value.food_type,
          quantity: value.feed_not_required ? 0 : value.quantity,
          quantity_unit: 'item',
          status: 'PENDING',
          supplements: value.calci_dust ? 'Calci-Dust' : null,
          notes: value.feed_not_required ? 'FAST DAY / NOT REQUIRED' : null,
          presentation_method: null,
          is_deleted: false,
          created_by: user.id
        }));

        await feedingService.bulkCreateSchedules(newSchedules as any, user.id);
        queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
        toast.success('Feeding schedule generated!');
        form.reset();
        onClose();
      } catch (err: any) {
        toast.error(`Generation failed: ${err.message}`);
      }
    }
  });

  if (!isOpen) return null;

  const inputClass = "w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm";

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl border border-slate-100 flex flex-col my-8">
        
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Utensils size={18} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm md:text-base tracking-tight">Generate Diet Schedule</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">Category: {activeCategory}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-4 md:p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          
          <form.Field name="animal_id" children={(field) => (
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Animal / Collection *</label>
              <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} disabled={loadingAnimals} required>
                <option value="">{loadingAnimals ? 'Loading animals...' : 'Select Animal...'}</option>
                {filteredAnimals.map(a => <option key={a.id} value={a.id!}>{a.name} ({a.species})</option>)}
              </select>
            </div>
          )}/>

          <form.Field name="feed_not_required" children={(field) => (
            <div className="flex items-center gap-3 bg-rose-50/80 p-3 rounded-xl border border-rose-200 cursor-pointer" onClick={() => field.handleChange(!field.state.value)}>
              <input type="checkbox" checked={field.state.value} onChange={e => field.handleChange(e.target.checked)} className="w-4 h-4 text-rose-600 bg-white rounded border-rose-300 focus:ring-rose-500/50" />
              <span className="text-xs font-bold text-rose-700 uppercase tracking-widest">Fast Day / Not Required</span>
            </div>
          )}/>

          <form.Subscribe selector={(state) => state.values.feed_not_required} children={(notRequired) => (
            !notRequired ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <form.Field name="food_type" children={(field) => (
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Food Type *</label>
                      {filteredFoodOptions.length > 0 ? (
                        <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} disabled={loadingFood} required>
                          <option value="">{loadingFood ? 'Loading...' : 'Select...'}</option>
                          {filteredFoodOptions.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                        </select>
                      ) : (
                        <input value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} placeholder="E.g. Mice" required />
                      )}
                    </div>
                  )}/>
                  <form.Field name="quantity" children={(field) => (
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Quantity *</label>
                      <input type="number" step="0.1" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(parseFloat(e.target.value))} className={inputClass} required />
                    </div>
                  )}/>
                </div>

                <form.Field name="calci_dust" children={(field) => (
                  <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer" onClick={() => field.handleChange(!field.state.value)}>
                    <input type="checkbox" checked={field.state.value} onChange={e => field.handleChange(e.target.checked)} className="w-4 h-4 text-emerald-600 bg-white rounded border-slate-300 focus:ring-emerald-500/50" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Include Calci-Dust Supplement</span>
                  </div>
                )}/>
              </>
            ) : null
          )}/>

          <div className="pt-3 border-t border-slate-100">
            <form.Field name="schedule_mode" children={(field) => (
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 mb-4">
                <button type="button" onClick={() => field.handleChange('single')} className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${field.state.value === 'single' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}>Single Feed</button>
                <button type="button" onClick={() => field.handleChange('interval')} className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${field.state.value === 'interval' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}><RefreshCw size={12}/> Auto-Interval</button>
              </div>
            )}/>

            <form.Subscribe selector={(state) => state.values.schedule_mode} children={(mode) => (
              <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
                <form.Field name="target_date" children={(field) => (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">{mode === 'interval' ? 'Start Date' : 'Target Date'} *</label>
                    <input type="date" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required/>
                  </div>
                )}/>
                
                {mode === 'interval' && (
                  <div className="grid grid-cols-2 gap-3">
                    <form.Field name="interval_days" children={(field) => (
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Repeat Every (Days)</label>
                        <input type="number" min="1" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(parseInt(e.target.value))} className={inputClass} required/>
                      </div>
                    )}/>
                    <form.Field name="occurrences" children={(field) => (
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Occurrences</label>
                        <input type="number" min="1" max="50" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(parseInt(e.target.value))} className={inputClass} required/>
                      </div>
                    )}/>
                  </div>
                )}
              </div>
            )}/>
          </div>

          <div className="pt-2 flex gap-2.5">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors">Cancel</button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]} children={([canSubmit, isSubmitting]) => (
              <button type="submit" disabled={!canSubmit || (isSubmitting as boolean)} className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.99]">
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
                {isSubmitting ? 'SCHEDULING...' : 'CONFIRM SCHEDULE'}
              </button>
            )}/>
          </div>
        </form>
      </div>
    </div>
  );
};