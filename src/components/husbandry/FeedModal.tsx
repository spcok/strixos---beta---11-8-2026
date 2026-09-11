import React, { useEffect, useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { X, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner'; 
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { feedingService } from '../../services/feedingService';
import { scheduledFeedingService } from '../../services/scheduledFeedingService';
import { Animal } from '../../types';

const extractErrorText = (errors: any): string | null => {
  if (!errors) return null;
  const errArray = Array.isArray(errors) ? errors : [errors];
  if (errArray.length === 0) return null;
  const messages = errArray.map((e: any) => {
    if (typeof e === 'string') return e;
    if (e && typeof e.message === 'string') return e.message;
    return null;
  }).filter(Boolean);
  return messages.length > 0 ? messages.join(', ') : null;
};

const FieldError = ({ meta }: { meta: any }) => {
  if (!meta.errors || meta.errors.length === 0) return null;
  const text = extractErrorText(meta.errors);
  if (!text) return null;
  return <p className="text-xs text-red-500 mt-1 font-bold">{text}</p>;
};

const formatLocalDatetime = (dateString?: string) => {
  const d = dateString ? new Date(dateString) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// NEW HELPER: Preserves current time but uses the dashboard's selected date
const getDefaultDateTime = (selectedDate?: string) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const localTimeStr = now.toISOString().slice(11, 16); // gets "HH:mm"
  return selectedDate ? `${selectedDate}T${localTimeStr}` : now.toISOString().slice(0, 16);
};

const feedItemSchema = z.object({
  id: z.string().optional(), 
  food_item: z.string().optional(), 
  feed_method: z.string().optional(),
  quantity: z.number().min(0, 'Cannot be negative').optional(),
  unit: z.enum(['grams', 'whole_item']),
  calci_dust_added: z.boolean().default(false),
});

const feedGroupSchema = z.object({
  recorded_by: z.string().min(2, 'Initials required').max(3),
  recorded_at: z.string().min(1, 'Date and Time required'),
  outcome: z.enum(['EATEN', 'REFUSED', 'FASTING', 'NOT_CAST', 'REGURGITATED']).default('EATEN'),
  items: z.array(feedItemSchema).min(1, 'At least one item component required'),
}).superRefine((data, ctx) => {
  if (data.outcome === 'EATEN') {
    data.items.forEach((item, index) => {
      if (!item.food_item || item.food_item.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Food item is required when Eaten',
          path: ['items', index, 'food_item']
        });
      }
      if (item.quantity === undefined || item.quantity <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Quantity must be > 0',
          path: ['items', index, 'quantity']
        });
      }
    });
  }
});

type FeedFormValues = z.infer<typeof feedGroupSchema>;

interface FeedModalProps { 
  isOpen: boolean; 
  onClose: () => void; 
  animalId: string; 
  initialData?: any; 
  scheduledFeed?: any; 
  selectedDate?: string; // <--- NEW PROP
}

export function FeedModal({ isOpen, onClose, animalId, initialData, scheduledFeed, selectedDate }: FeedModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const animal = useMemo(() => {
    const cachedAnimals = queryClient.getQueryData<Animal[]>(['animals', 'dashboard']) || [];
    return cachedAnimals.find(a => a.id === animalId);
  }, [queryClient, animalId]);

  const animalCat = animal?.category?.toUpperCase().trim() || ''; 

  const { data: opLists = [] } = useQuery({
    queryKey: ['operational_lists'],
    queryFn: async () => {
      const { data } = await supabase.from('operational_lists').select('name, category, animal_category').eq('is_deleted', false);
      return data || [];
    }
  });

  const foodOptions = useMemo(() => {
    return opLists.filter(l => {
      if (l.category?.toLowerCase() !== 'food_type') return false;
      const targetCategory = l.animal_category?.toUpperCase().trim();
      if (targetCategory && animalCat) return targetCategory.includes(animalCat);
      return true; 
    });
  }, [opLists, animalCat]);

  const methodOptions = useMemo(() => {
    return opLists.filter(l => {
      if (l.category?.toLowerCase() !== 'feed_method') return false;
      const targetCategory = l.animal_category?.toUpperCase().trim();
      if (targetCategory && animalCat) return targetCategory.includes(animalCat);
      return true; 
    });
  }, [opLists, animalCat]);

  const insertFeedMutation = useMutation({
    mutationFn: async (values: FeedFormValues) => {
      const payloads = values.items.map(item => ({
        id: item.id || crypto.randomUUID(), 
        animal_id: animalId,
        recorded_by: values.recorded_by.toUpperCase(),
        recorded_at: new Date(values.recorded_at).toISOString(), 
        created_by: profile?.id,
        food_item: item.food_item || null,
        feed_method: item.feed_method || null,
        quantity: item.quantity || 0,
        unit: item.unit,
        calci_dust_added: item.calci_dust_added,
        outcome: values.outcome, 
        schedule_id: scheduledFeed?.id || null
      }));

      if (scheduledFeed?.id) {
        await scheduledFeedingService.resolveScheduledFeed(scheduledFeed.id, values.outcome as any, payloads[0] as any);
        if (payloads.length > 1) {
          await feedingService.insertFeedLog(payloads.slice(1));
        }
        return payloads;
      } else {
        return await feedingService.insertFeedLog(payloads);
      }
    },
    onSuccess: () => {
      toast.success(scheduledFeed ? 'Schedule resolved & logged!' : initialData ? 'Feed updated successfully' : 'Feed logged successfully');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'next_feeds'] }); 
      onClose();
    },
    onError: (error) => toast.error(`Failed to log feed: ${error.message}`),
  });

  const form = useForm<FeedFormValues>({
    defaultValues: {
      recorded_by: initialData?.recorded_by || '', 
      // Initialize with selectedDate if available
      recorded_at: initialData?.recorded_at ? formatLocalDatetime(initialData.recorded_at) : getDefaultDateTime(selectedDate),
      outcome: 'EATEN',
      items: [{ food_item: '', feed_method: '', quantity: 1, unit: 'whole_item', calci_dust_added: false }]
    },
    validators: { onSubmit: feedGroupSchema },
    onSubmit: async ({ value }) => insertFeedMutation.mutate(value),
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(); 
      
      if (scheduledFeed) {
        const isFasting = scheduledFeed.notes === 'FAST DAY / NOT REQUIRED' || scheduledFeed.food_type === 'NOT REQUIRED';
        
        // Use scheduled date, or fallback to selectedDate from dashboard
        form.setFieldValue('recorded_at', scheduledFeed.scheduled_date ? `${scheduledFeed.scheduled_date}T12:00` : getDefaultDateTime(selectedDate));
        form.setFieldValue('outcome', isFasting ? 'FASTING' : 'EATEN');
        form.setFieldValue('items', [{
          id: crypto.randomUUID(),
          food_item: isFasting ? '' : (scheduledFeed.food_type || ''),
          feed_method: scheduledFeed.presentation_method || '',
          quantity: scheduledFeed.quantity || 0,
          unit: (scheduledFeed.quantity_unit === 'grams' || scheduledFeed.quantity_unit === 'g') ? 'grams' : 'whole_item',
          calci_dust_added: scheduledFeed.supplements === 'Calci-Dust' || false,
        }]);

      } else if (initialData) {
        form.setFieldValue('recorded_at', formatLocalDatetime(initialData.recorded_at || initialData.time || initialData.log_date));
        form.setFieldValue('outcome', initialData.outcome || 'EATEN');
        form.setFieldValue('items', [{
          id: initialData.id,
          food_item: initialData.food_item || '',
          feed_method: initialData.feed_method || '',
          quantity: initialData.quantity ?? initialData.quantity_consumed ?? initialData.food_consumed_g ?? initialData.quantity_offered ?? 1,
          unit: (initialData.unit === 'grams' || initialData.unit === 'g') ? 'grams' : 'whole_item',
          calci_dust_added: initialData.calci_dust_added || false,
        }]);
      } else {
        // Empty form uses the dashboard's active date!
        form.setFieldValue('recorded_at', getDefaultDateTime(selectedDate));
      }
    }
  }, [isOpen, scheduledFeed, initialData, selectedDate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex flex-col p-4 border-b border-slate-100 flex-none gap-2">
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                {scheduledFeed ? 'Resolve Schedule' : initialData ? 'Edit Feed' : 'Log Feed'}
              </h2>
              {animalCat && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold tracking-widest uppercase">
                  {animalCat}
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"><X size={20} /></button>
          </div>
          
          {scheduledFeed && (
            <div className="bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-2 w-fit mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">
                Resolving Pending Diet Plan
              </p>
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          <div className="grid grid-cols-3 gap-4">
            <form.Field name="recorded_by">
              {(field) => (
                <div className="col-span-1 space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Initials</label>
                  <input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-base font-bold uppercase focus:ring-2 focus:ring-emerald-500 outline-none text-center"
                    placeholder="JM" maxLength={3}
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>

            <form.Field name="recorded_at">
              {(field) => (
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="outcome">
            {(field) => {
              const options = [
                { value: 'EATEN', label: 'Eaten', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
                { value: 'REFUSED', label: 'Refused', color: 'bg-rose-100 text-rose-800 border-rose-200' },
                { value: 'FASTING', label: 'Fasting', color: 'bg-amber-100 text-amber-800 border-amber-200' },
                { value: 'NOT_CAST', label: 'Not Cast', color: 'bg-purple-100 text-purple-800 border-purple-200' }
              ];
              return (
                <div className="space-y-1.5 border-t border-slate-100 pt-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Diet Outcome</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {options.map(opt => {
                      const isSelected = field.state.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.handleChange(opt.value as any)}
                          className={`py-2.5 px-1 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                            isSelected 
                              ? `${opt.color} shadow-sm ring-1 ring-black/5 scale-[0.98]` 
                              : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          </form.Field>

          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Feed Components</h3>
            
            <form.Field name="items">
              {(itemsField) => (
                <div className="space-y-4">
                  {itemsField.state.value.map((_, i) => (
                    <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative group transition-all">
                      
                      {i > 0 && (
                        <button 
                          type="button" 
                          onClick={() => {
                            const newItems = [...itemsField.state.value];
                            newItems.splice(i, 1);
                            itemsField.handleChange(newItems);
                          }}
                          className="absolute -top-3 -right-3 p-2 bg-white border border-slate-200 text-red-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

                      <div className="space-y-4">
                        <form.Field name={`items[${i}].food_item`}>
                          {(field) => (
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Food Item (Optional if refused)</label>
                              <select
                                value={field.state.value as string}
                                onChange={(e) => field.handleChange(e.target.value)}
                                className="w-full px-3 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                              >
                                <option value="">Select Food...</option>
                                {foodOptions.map((opt, idx) => (
                                  <option key={idx} value={opt.name}>{opt.name}</option>
                                ))}
                                {scheduledFeed && scheduledFeed.food_type && !foodOptions.find(o => o.name === scheduledFeed.food_type) && (
                                  <option value={scheduledFeed.food_type}>{scheduledFeed.food_type}</option>
                                )}
                              </select>
                              <FieldError meta={field.state.meta} />
                            </div>
                          )}
                        </form.Field>

                        <div className="grid grid-cols-2 gap-4">
                          <form.Field name={`items[${i}].quantity`}>
                            {(field) => (
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Qty</label>
                                <input
                                  type="number" step="0.1"
                                  value={field.state.value as number}
                                  onChange={(e) => field.handleChange(parseFloat(e.target.value) || 0)}
                                  className="w-full px-3 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                                <FieldError meta={field.state.meta} />
                              </div>
                            )}
                          </form.Field>

                          <form.Field name={`items[${i}].unit`}>
                            {(field) => (
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Unit</label>
                                <select
                                  value={field.state.value as string}
                                  onChange={(e) => field.handleChange(e.target.value)}
                                  className="w-full px-3 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                >
                                  <option value="whole_item">Items</option>
                                  <option value="grams">Grams</option>
                                </select>
                              </div>
                            )}
                          </form.Field>
                        </div>

                        <div className="flex items-center gap-4">
                          <form.Field name={`items[${i}].feed_method`}>
                            {(field) => (
                              <select
                                value={field.state.value as string}
                                onChange={(e) => field.handleChange(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                              >
                                <option value="">Select Method (Optional)</option>
                                {methodOptions.map((opt, idx) => (
                                  <option key={idx} value={opt.name}>{opt.name}</option>
                                ))}
                              </select>
                            )}
                          </form.Field>

                          <form.Field name={`items[${i}].calci_dust_added`}>
                            {(field) => (
                              <label className="flex items-center gap-2 cursor-pointer flex-none">
                                <input
                                  type="checkbox"
                                  checked={field.state.value as boolean}
                                  onChange={(e) => field.handleChange(e.target.checked)}
                                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                />
                                <span className="text-xs font-bold text-slate-600">Calci-Dust</span>
                              </label>
                            )}
                          </form.Field>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => itemsField.handleChange([...itemsField.state.value, { food_item: '', feed_method: '', quantity: 1, unit: 'whole_item', calci_dust_added: false }])}
                    className="w-full py-3 border-2 border-dashed border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> Add Additional Component
                  </button>
                </div>
              )}
            </form.Field>
            
            <form.Subscribe
                selector={(state) => state.errorMap}
                children={(errorMap) => {
                  const text = extractErrorText(errorMap?.onSubmit);
                  if (!text) return null;
                  return (
                    <div className="col-span-full pt-1">
                      <p className="text-xs text-red-500 font-bold">{text}</p>
                    </div>
                  );
                }}
             />
          </div>
        </form>

        <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3 flex-none">
          <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <form.Subscribe
            selector={(state) => [state.isSubmitting]}
            children={([isSubmitting]) => (
              <button
                onClick={form.handleSubmit}
                disabled={insertFeedMutation.isPending}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {insertFeedMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {scheduledFeed ? 'Log & Resolve' : initialData ? 'Update Feed' : 'Save Feed'}
              </button>
            )}
          />
        </div>
      </div>
    </div>
  );
}