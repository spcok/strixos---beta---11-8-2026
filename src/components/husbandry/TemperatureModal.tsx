import React, { useEffect } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { X, Save, Loader2, Thermometer } from 'lucide-react';
import { toast } from 'sonner'; 
import { useAuth } from '../../lib/auth';
import { temperatureService } from '../../services/temperatureService'; 

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

const temperatureSchema = z.object({
  recorded_by: z.string().min(2, 'Initials required').max(3),
  recorded_at: z.string().min(1, 'Date and time required'),
  temp_ambient: z.number().optional(),
  temp_basking: z.number().optional(),
  temp_cool: z.number().optional(),
}).refine((data) => {
  return data.temp_ambient !== undefined || data.temp_basking !== undefined || data.temp_cool !== undefined;
}, {
  message: "Please enter a valid temperature reading.",
  path: ["temp_ambient"] 
});

type TemperatureFormValues = z.infer<typeof temperatureSchema>;

interface TemperatureModalProps { 
  isOpen: boolean; 
  onClose: () => void; 
  animalId: string; 
  ambientOnly: boolean; 
  initialData?: any; 
  selectedDate?: string; // <--- NEW PROP
}

export function TemperatureModal({ isOpen, onClose, animalId, ambientOnly, initialData, selectedDate }: TemperatureModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const insertTempMutation = useMutation({
    mutationFn: async (values: TemperatureFormValues) => {
      let tempAverage = null;
      if (values.temp_basking !== undefined && values.temp_cool !== undefined) {
        tempAverage = Math.round(((values.temp_basking + values.temp_cool) / 2) * 10) / 10;
      }

      const payload = {
        id: initialData?.id || crypto.randomUUID(), 
        animal_id: animalId,
        recorded_by: values.recorded_by.toUpperCase(),
        recorded_at: new Date(values.recorded_at).toISOString(),
        created_by: profile?.id,
        temp_ambient: values.temp_ambient ?? null,
        temp_basking: values.temp_basking ?? null,
        temp_cool: values.temp_cool ?? null,
        temp_average: tempAverage,
      };
      return await temperatureService.insertTemperatureLog(payload);
    },
    onSuccess: () => {
      toast.success(initialData ? 'Temperature updated successfully' : 'Temperature logged successfully');
      queryClient.invalidateQueries({ queryKey: ['temperatures'] });
      onClose();
    },
    onError: (error) => toast.error(`Failed to log temperature: ${error.message}`),
  });

  const form = useForm<TemperatureFormValues>({
    defaultValues: {
      recorded_by: initialData?.recorded_by || '', 
      recorded_at: initialData?.recorded_at ? formatLocalDatetime(initialData.recorded_at) : getDefaultDateTime(selectedDate),
      temp_ambient: initialData?.temp_ambient ?? initialData?.temperature_c ?? undefined,
      temp_basking: initialData?.temp_basking ?? initialData?.basking_temp_c ?? undefined,
      temp_cool: initialData?.temp_cool ?? initialData?.cool_temp_c ?? undefined,
    },
    validators: { onSubmit: temperatureSchema },
    onSubmit: async ({ value }) => insertTempMutation.mutate(value),
  });

  useEffect(() => {
    if (isOpen && !initialData) {
      form.reset();
      form.setFieldValue('recorded_at', getDefaultDateTime(selectedDate));
    }
  }, [isOpen, form, initialData, selectedDate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Thermometer size={20} className="text-orange-500" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              {initialData ? 'Edit Temperature' : 'Log Temperature'}
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
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-base font-bold uppercase focus:ring-2 focus:ring-orange-500 outline-none text-center block"
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
                    className="w-full px-3 py-3 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          </div>

          {ambientOnly ? (
            <form.Field name="temp_ambient">
              {(field) => (
                <div className="space-y-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ambient Temperature</label>
                  <div className="relative w-full">
                    <input
                      type="number" step="0.1"
                      value={field.state.value === undefined ? '' : field.state.value}
                      onChange={(e) => field.handleChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="w-full pl-3 pr-12 py-3 border border-slate-200 rounded-lg text-xl font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="0.0"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">°C</span>
                  </div>
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          ) : (
            <div className="space-y-4 bg-orange-50/50 p-4 rounded-xl border border-orange-100">
              <div className="grid grid-cols-2 gap-4">
                <form.Field name="temp_basking">
                  {(field) => (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Basking End</label>
                      <div className="relative">
                        <input type="number" step="0.1" value={field.state.value === undefined ? '' : field.state.value} onChange={(e) => field.handleChange(e.target.value ? parseFloat(e.target.value) : undefined)} className="w-full pl-3 pr-10 py-3 border border-orange-200 rounded-lg text-lg font-bold focus:ring-2 focus:ring-orange-500 outline-none" placeholder="0.0" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-400 font-bold">°C</span>
                      </div>
                    </div>
                  )}
                </form.Field>

                <form.Field name="temp_cool">
                  {(field) => (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Cool End</label>
                      <div className="relative">
                        <input type="number" step="0.1" value={field.state.value === undefined ? '' : field.state.value} onChange={(e) => field.handleChange(e.target.value ? parseFloat(e.target.value) : undefined)} className="w-full pl-3 pr-10 py-3 border border-blue-200 rounded-lg text-lg font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0.0" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold">°C</span>
                      </div>
                    </div>
                  )}
                </form.Field>
              </div>

              <form.Subscribe
                selector={(state) => ({ basking: state.values.temp_basking, cool: state.values.temp_cool })}
                children={({ basking, cool }) => {
                  const hasBoth = basking !== undefined && cool !== undefined;
                  const avg = hasBoth ? ((basking + cool) / 2).toFixed(1) : '--';
                  return (
                    <div className="pt-3 border-t border-orange-200/50 flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Calculated Average</span>
                      <span className={`text-xl font-black ${hasBoth ? 'text-slate-800' : 'text-slate-300'}`}>{avg} <span className="text-sm text-slate-400">°C</span></span>
                    </div>
                  );
                }}
              />
              
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
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <form.Subscribe
              selector={(state) => [state.isSubmitting]}
              children={([isSubmitting]) => (
                <button type="submit" disabled={insertTempMutation.isPending} className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                  {insertTempMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 
                  {initialData ? 'Update Temp' : 'Log Temp'}
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}