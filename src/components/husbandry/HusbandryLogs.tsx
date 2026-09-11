import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface HusbandryLogsProps {
  animalId: string;
  weightUnit?: string;
  animal?: any;
}

const getLocalDateString = (dateObj: Date) => {
  return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
};

export default function HusbandryLogs({ animalId, weightUnit = 'g', animal }: HusbandryLogsProps) {
  const [endDate, setEndDate] = useState<string>(getLocalDateString(new Date()));
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  });
  
  const [logFilter, setLogFilter] = useState<'ALL' | 'FEEDING' | 'WEIGHT' | 'TEMP'>('ALL');

  const { data: feeds = [], isLoading: loadingFeeds, error: feedsError } = useQuery({
    queryKey: ['feed_logs', animalId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('feed_logs').select('*').eq('animal_id', animalId).eq('is_deleted', false).gte('recorded_at', `${startDate}T00:00:00Z`).lte('recorded_at', `${endDate}T23:59:59.999Z`);
      if (error) throw error; return data || [];
    },
    enabled: !!animalId,
  });

  const { data: weights = [], isLoading: loadingWeights, error: weightsError } = useQuery({
    queryKey: ['weight_logs', animalId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('weight_logs').select('*').eq('animal_id', animalId).eq('is_deleted', false).gte('recorded_at', `${startDate}T00:00:00Z`).lte('recorded_at', `${endDate}T23:59:59.999Z`);
      if (error) throw error; return data || [];
    },
    enabled: !!animalId,
  });

  const { data: temps = [], isLoading: loadingTemps, error: tempsError } = useQuery({
    queryKey: ['temperature_logs', animalId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('temperature_logs').select('*').eq('animal_id', animalId).eq('is_deleted', false).gte('recorded_at', `${startDate}T00:00:00Z`).lte('recorded_at', `${endDate}T23:59:59.999Z`);
      if (error) throw error; return data || [];
    },
    enabled: !!animalId,
  });

  const unifiedTimeline = useMemo(() => {
    let combined: any[] = [];

    if (logFilter === 'ALL' || logFilter === 'FEEDING') {
      feeds.forEach(f => combined.push({ id: `feed_${f.id}`, type: 'FEEDING', timestamp: new Date(f.recorded_at).getTime(), dateObj: new Date(f.recorded_at), data: f }));
    }
    if (logFilter === 'ALL' || logFilter === 'WEIGHT') {
      weights.forEach(w => combined.push({ id: `weight_${w.id}`, type: 'WEIGHT', timestamp: new Date(w.recorded_at).getTime(), dateObj: new Date(w.recorded_at), data: w }));
    }
    if (logFilter === 'ALL' || logFilter === 'TEMP') {
      temps.forEach(t => combined.push({ id: `temp_${t.id}`, type: 'TEMP', timestamp: new Date(t.recorded_at).getTime(), dateObj: new Date(t.recorded_at), data: t }));
    }

    return combined.sort((a, b) => b.timestamp - a.timestamp);
  }, [feeds, weights, temps, logFilter]);

  const isLoading = loadingFeeds || loadingWeights || loadingTemps;
  const hasError = feedsError || weightsError || tempsError;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-12">
      
      {/* MINIMAL FILTER BAR */}
      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex gap-4 w-full sm:w-auto">
          <div className="flex-1 sm:w-36">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex-1 sm:w-36">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
        <div className="w-full sm:w-48 sm:ml-auto">
           <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Log Type</label>
           <select value={logFilter} onChange={(e) => setLogFilter(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500">
             <option value="ALL">All Logs</option>
             <option value="FEEDING">Feeds</option>
             <option value="WEIGHT">Weights</option>
             <option value="TEMP">Temperatures</option>
           </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3"><Loader2 className="animate-spin text-emerald-500 w-8 h-8" /><span className="text-xs font-black uppercase tracking-widest text-slate-400">Compiling Telemetry...</span></div>
      ) : hasError ? (
        <div className="flex flex-col items-center justify-center py-20 text-rose-500 gap-3"><AlertCircle size={32} /><span className="text-xs font-black uppercase tracking-widest">Error fetching logs.</span></div>
      ) : unifiedTimeline.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3"><ClipboardList size={32} className="opacity-40" /><p className="text-[10px] font-bold uppercase tracking-widest mt-1">No telemetry matched these filters.</p></div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Date & Time</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Type</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 min-w-[200px]">Recorded Values</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 min-w-[200px]">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unifiedTimeline.map((item) => {
                  const dateStr = item.dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                  const timeStr = item.dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

                  let typeBadge = null;
                  let details = null;

                  if (item.type === 'FEEDING') {
                    typeBadge = <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">Feed</span>;
                    const qty = item.data.quantity ? `(${item.data.quantity}${item.data.unit === 'grams' ? 'g' : ''})` : '';
                    details = <span className="text-sm font-bold text-slate-800">{item.data.food_item || 'Standard Diet'} {qty}</span>;
                  } 
                  else if (item.type === 'WEIGHT') {
                    typeBadge = <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">Weight</span>;
                    details = <span className="text-sm font-black text-emerald-600">{item.data.weight_grams}g</span>;
                  } 
                  else if (item.type === 'TEMP') {
                    typeBadge = <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">Env</span>;
                    const tempDisplay = item.data.temp_ambient ? `Amb: ${item.data.temp_ambient}°C` : `Bask: ${item.data.temp_basking}°C | Cool: ${item.data.temp_cool}°C`;
                    const humDisplay = item.data.humidity_percent ? ` | Hum: ${item.data.humidity_percent}%` : '';
                    details = <span className="text-sm font-bold text-slate-800">{tempDisplay}{humDisplay}</span>;
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-bold text-slate-900 block">{dateStr}</span>
                        <span className="text-[10px] font-bold text-slate-400">{timeStr}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{typeBadge}</td>
                      <td className="px-4 py-3">{details}</td>
                      <td className="px-4 py-3">
                        {item.data.notes 
                          ? <span className="text-xs font-medium text-slate-600 italic">"{item.data.notes}"</span> 
                          : <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">--</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}