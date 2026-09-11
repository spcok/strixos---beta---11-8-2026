import React, { useEffect, useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { X, Save, Loader2, Scale } from 'lucide-react';
import { toast } from 'sonner'; 
import { useAuth } from '../../lib/auth';
import { weightService } from '../../services/weightService'; 
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

const getDefaultDateTime = (selectedDate?: string) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const localTimeStr = now.toISOString().slice(11, 16); // gets "HH:mm"
  return selectedDate ? `${selectedDate}T${localTimeStr}` : now.toISOString().slice(0, 16);
};

const GRAMS_PER_OZ = 28.349523125;

const toGrams = (values: any, unit: string) => {
  if (unit === 'lb') {
    const totalOz = (values.weight_lb || 0) * 16 + (values.weight_oz || 0) + (values.weight_eighths || 0) / 8;
    return Math.round(totalOz * GRAMS_PER_OZ);
  }
  if (unit === 'oz') {
    const totalOz = (values.weight_oz || 0) + (values.weight_eighths || 0) / 8;
    return Math.round(totalOz * GRAMS_PER_OZ);
  }
  if (unit === 'kg') return Math.round((values.weight_kg || 0) * 1000);
  return Math.round(values.weight_g || 0);
};

const fromGrams = (grams: number | null | undefined, unit: string) => {
  if (!grams) return { weight_g: undefined, weight_kg: undefined, weight_lb: undefined, weight_oz: undefined, weight_eighths: undefined };
  
  let weight_lb = 0, weight_oz = 0, weight_eighths = 0;
  const weight_g = Math.round(grams);
  const weight_kg = Number((grams / 1000).toFixed(3));
  
  const totalOunces = grams / GRAMS_PER_OZ;
  let totalOzInt = Math.floor(totalOunces);
  let e = Math.round((totalOunces - totalOzInt) * 8);
  
  if (e >= 8) {
    totalOzInt += 1;
    e = 0;
  }
  
  if (unit === 'lb') {
    weight_lb = Math.floor(totalOzInt / 16);
    weight_oz = totalOzInt % 16;
    weight_eighths = e;
  } else if (unit === 'oz') {
    weight_oz = totalOzInt;
    weight_eighths = e;
  }
  
  return { weight_g, weight_kg, weight_lb, weight_oz, weight_eighths };
};

const weightSchema = z.object({
  weight_g: z.number().min(0).optional(),
  weight_kg: z.number().min(0).optional(),
  weight_lb: z.number().min(0).optional(),
  weight_oz: z.number().min(0).max(15, 'Max 15').optional(),
  weight_eighths: z.number().min(0).max(7, 'Max 7').optional(),
  am_pm: z.enum(['AM', 'PM']),
  has_cast: z.boolean().default(false),
  recorded_by: z.string().min(2, 'Initials required').max(3),
  recorded_at: z.string().min(1, 'Date and time required'),
}).refine((data) => {
  return toGrams(data, 'lb') > 0 || toGrams(data, 'oz') > 0 || toGrams(data, 'g') > 0 || toGrams(data, 'kg') > 0;
}, {
  message: "Total calculated weight must be greater than 0"
});

type WeightFormValues = z.infer<typeof weightSchema>;

interface WeightModalProps { 
  isOpen: boolean; 
  onClose: () => void; 
  animalId: string; 
  initialData?: any; 
  selectedDate?: string; // <--- NEW PROP
}

export function WeightModal({ isOpen, onClose, animalId, initialData, selectedDate }: WeightModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const animalUnit = useMemo(() => {
    const cachedAnimals = queryClient.getQueryData<Animal[]>(['animals', 'dashboard']) || [];
    const animal = cachedAnimals.find(a => a.id === animalId);
    return animal?.weight_unit || 'g'; 
  }, [queryClient, animalId]);

  const insertWeightMutation = useMutation({
    mutationFn: async (values: WeightFormValues) => {
      const payload = {
        id: initialData?.id || crypto.randomUUID(), 
        animal_id: animalId,
        recorded_by: values.recorded_by.toUpperCase(),
        recorded_at: new Date(values.recorded_at).toISOString(),
        created_by: profile?.id,
        weight_grams: toGrams(values, animalUnit),
        am_pm: values.am_pm,
        has_cast: values.has_cast,
      };
      return await weightService.insertWeightLog(payload);
    },
    onSuccess: () => {
      toast.success(initialData ? 'Weight updated successfully' : 'Weight logged successfully');
      queryClient.invalidateQueries({ queryKey: ['weights'] });
      onClose();
    },
    onError: (error) => toast.error(`Failed to log weight: ${error.message}`),
  });

  const form = useForm<WeightFormValues>({
    defaultValues: {
      ...fromGrams(initialData?.weight_grams, animalUnit),
      am_pm: initialData?.am_pm || (new Date().getHours() < 12 ? 'AM' : 'PM'),
      has_cast: initialData?.has_cast || false,
      recorded_by: initialData?.recorded_by || '',
      recorded_at: initialData?.recorded_at ? formatLocalDatetime(initialData.recorded_at) : getDefaultDateTime(selectedDate),
    },
    validators: { onSubmit: weightSchema },
    onSubmit: async ({ value }) => insertWeightMutation.mutate(value),
  });

  useEffect(() => {
    if (isOpen && !initialData) {
      form.reset();
      form.setFieldValue('am_pm', new Date().getHours() < 12 ? 'AM' : 'PM');
      form.setFieldValue('recorded_at', getDefaultDateTime(selectedDate));
    }
  }, [isOpen, form, initialData, selectedDate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Scale size={20} className="text-slate-700" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              {initialData ? 'Edit Weight' : 'Log Weight'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }} className="p-6 space-y-5">
          
          <div className="grid grid-cols-2 gap-4">
            <form.Field name="recorded_by">
              {(field) => (
                <div className="space-y-1">
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
                <div className="space-y-1">
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

          <div className="space-y-1">
             <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Bio-Weight ({animalUnit})</label>
             
             {animalUnit === 'lb' && (
               <div className="grid grid-cols-3 gap-3">
                 <form.Field name="weight_lb">
                    {(field) => (
                      <div className="relative">
                        <input type="number" step="1" value={field.state.value ?? ''} onChange={(e) => field.handleChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} className="w-full pl-3 pr-8 py-3 border border-slate-200 rounded-lg text-xl font-bold focus:ring-2 focus:ring-emerald-500 outline-none text-center" placeholder="0" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">lb</span>
                        <FieldError meta={field.state.meta} />
                      </div>
                    )}
                 </form.Field>
                 <form.Field name="weight_oz">
                    {(field) => (
                      <div className="relative">
                        <input type="number" step="1" max="15" value={field.state.value ?? ''} onChange={(e) => field.handleChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} className="w-full pl-3 pr-8 py-3 border border-slate-200 rounded-lg text-xl font-bold focus:ring-2 focus:ring-emerald-500 outline-none text-center" placeholder="0" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">oz</span>
                        <FieldError meta={field.state.meta} />
                      </div>
                    )}
                 </form.Field>
                 <form.Field name="weight_eighths">
                    {(field) => (
                      <div className="relative">
                        <input type="number" step="1" max="7" value={field.state.value ?? ''} onChange={(e) => field.handleChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} className="w-full pl-3 pr-8 py-3 border border-slate-200 rounded-lg text-xl font-bold focus:ring-2 focus:ring-emerald-500 outline-none text-center" placeholder="0" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">1/8</span>
                        <FieldError meta={field.state.meta} />
                      </div>
                    )}
                 </form.Field>
               </div>
             )}

             {animalUnit === 'oz' && (
               <div className="grid grid-cols-2 gap-3">
                 <form.Field name="weight_oz">
                    {(field) => (
                      <div className="relative">
                        <input type="number" step="1" value={field.state.value ?? ''} onChange={(e) => field.handleChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} className="w-full pl-3 pr-10 py-3 border border-slate-200 rounded-lg text-xl font-bold focus:ring-2 focus:ring-emerald-500 outline-none text-center" placeholder="0" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">oz</span>
                        <FieldError meta={field.state.meta} />
                      </div>
                    )}
                 </form.Field>
                 <form.Field name="weight_eighths">
                    {(field) => (
                      <div className="relative">
                        <input type="number" step="1" max="7" value={field.state.value ?? ''} onChange={(e) => field.handleChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} className="w-full pl-3 pr-10 py-3 border border-slate-200 rounded-lg text-xl font-bold focus:ring-2 focus:ring-emerald-500 outline-none text-center" placeholder="0" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">1/8</span>
                        <FieldError meta={field.state.meta} />
                      </div>
                    )}
                 </form.Field>
               </div>
             )}

             {animalUnit === 'g' && (
               <form.Field name="weight_g">
                 {(field) => (
                    <div className="relative">
                      <input type="number" step="1" value={field.state.value ?? ''} onChange={(e) => field.handleChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} className="w-full pl-3 pr-10 py-3 border border-slate-200 rounded-lg text-xl font-bold focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">g</span>
                      <FieldError meta={field.state.meta} />
                    </div>
                 )}
               </form.Field>
             )}
             
             {animalUnit === 'kg' && (
               <form.Field name="weight_kg">
                 {(field) => (
                    <div className="relative">
                      <input type="number" step="0.01" value={field.state.value ?? ''} onChange={(e) => field.handleChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} className="w-full pl-3 pr-10 py-3 border border-slate-200 rounded-lg text-xl font-bold focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0.00" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">kg</span>
                      <FieldError meta={field.state.meta} />
                    </div>
                 )}
               </form.Field>
             )}
             
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

          <form.Field name="am_pm">
            {(field) => (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Time of Day</label>
                <div className="flex gap-2">
                  <label className={`flex-1 py-3 text-center rounded-lg border-2 font-black transition-all cursor-pointer ${field.state.value === 'AM' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' : 'border-slate-100 text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}>
                    <input type="radio" className="hidden" value="AM" checked={field.state.value === 'AM'} onChange={() => field.handleChange('AM')} /> AM Weight
                  </label>
                  <label className={`flex-1 py-3 text-center rounded-lg border-2 font-black transition-all cursor-pointer ${field.state.value === 'PM' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm' : 'border-slate-100 text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}>
                    <input type="radio" className="hidden" value="PM" checked={field.state.value === 'PM'} onChange={() => field.handleChange('PM')} /> PM Weight
                  </label>
                </div>
              </div>
            )}
          </form.Field>

          <form.Field name="has_cast">
            {(field) => (
              <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors mt-2">
                <input
                  type="checkbox"
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                  className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <span className="text-base font-bold text-slate-700">Bird has cast pellet</span>
              </label>
            )}
          </form.Field>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <form.Subscribe
              selector={(state) => [state.isSubmitting]}
              children={([isSubmitting]) => (
                <button type="submit" disabled={insertWeightMutation.isPending} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                  {insertWeightMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 
                  {initialData ? 'Update Weight' : 'Log Weight'}
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}