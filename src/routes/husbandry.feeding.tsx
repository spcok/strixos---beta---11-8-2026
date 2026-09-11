import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus, Trash2, Loader2, Utensils, Calendar as CalIcon, Filter, Search } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Animal, FeedingSchedule as FeedingScheduleType } from '../types';
import { feedingService } from '../services/feedingService';
import { FeedingScheduleModal } from '../components/husbandry/FeedingScheduleModal';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const getAnimalsOptions = () => queryOptions({
  queryKey: ['animals', 'dashboard'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('*').eq('archived', false);
    if (error) throw error;
    return data as Animal[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const getSchedulesOptions = () => queryOptions({
  queryKey: ['feeding_schedules'],
  queryFn: async () => {
    const maxDateStr = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('feeding_schedules')
      .select('*')
      .eq('is_deleted', false)
      .lte('scheduled_date', maxDateStr);
    if (error) throw error;
    return data as FeedingScheduleType[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION
// ------------------------------------------------------------------
export const Route = createFileRoute('/husbandry/feeding')({
  loader: async ({ context: { queryClient } }) => {
    if (queryClient) {
      await Promise.all([
        queryClient.ensureQueryData(getAnimalsOptions()),
        queryClient.ensureQueryData(getSchedulesOptions())
      ]);
    }
  },
  component: FeedingSchedulePage,
});

const getLocalDateString = () => format(new Date(), 'yyyy-MM-dd');

// ------------------------------------------------------------------
// 3. MAIN COMPONENT (UNIFIED 3-BLOCK LAYOUT WITH STRICT RBAC)
// ------------------------------------------------------------------
export function FeedingSchedulePage() {
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const [activeTab, setActiveTab] = useState<string>('EXOTIC');
  const categories = ['OWL', 'RAPTOR', 'MAMMAL', 'EXOTIC'];

  const [filterAnimalId, setFilterAnimalId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewLayout, setViewLayout] = useState<'individual' | 'grouped'>('individual');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const channel = supabase
      .channel('feeding-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feeding_schedules' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: animals = [], isLoading: loadingAnimals } = useQuery(getAnimalsOptions());
  const { data: schedules = [], isLoading: loadingSchedules } = useQuery(getSchedulesOptions());

  const deleteSingleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      if (!user?.id) throw new Error('Unauthorized');
      await feedingService.deleteSchedule(scheduleId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
      toast.success('Schedule deleted.');
    },
    onError: (err: any) => {
      toast.error(`Deletion failed: ${err.message}`);
    }
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (scheduleIds: string[]) => {
      if (!user?.id) throw new Error('Unauthorized');
      await Promise.all(scheduleIds.map(id => feedingService.deleteSchedule(id, user.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
      toast.success('Schedules deleted.');
    },
    onError: (err: any) => {
      toast.error(`Group deletion failed: ${err.message}`);
    }
  });

  const upcomingSchedules = useMemo(() => 
    [...schedules].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
  [schedules]);

  const displayedSchedules = useMemo(() => {
    let filtered = upcomingSchedules.filter(s => {
      const animal = animals.find(a => a.id === s.animal_id);
      return (animal?.category || '').toUpperCase() === activeTab;
    });

    if (filterAnimalId !== 'ALL') {
      filtered = filtered.filter(s => s.animal_id === filterAnimalId);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => {
        const animal = animals.find(a => a.id === s.animal_id);
        const matchName = animal?.name?.toLowerCase().includes(q);
        const matchSpecies = animal?.species?.toLowerCase().includes(q);
        const matchFood = s.food_type?.toLowerCase().includes(q);
        return matchName || matchSpecies || matchFood;
      });
    }
    return filtered;
  }, [upcomingSchedules, filterAnimalId, searchQuery, animals, activeTab]);

  const groupedSchedules = useMemo(() => {
    const groups = new Map();
    displayedSchedules.forEach(schedule => {
      const isNotRequired = schedule.notes === 'FAST DAY / NOT REQUIRED';
      const supplementKey = schedule.supplements || 'none';
      const key = `${schedule.animal_id}_${schedule.food_type}_${schedule.quantity}_${supplementKey}_${isNotRequired}`;
      
      if (!groups.has(key)) {
        groups.set(key, { 
          ...schedule, count: 1, end_date: schedule.scheduled_date, start_date: schedule.scheduled_date, child_ids: [schedule.id],
          feed_not_required: isNotRequired
        });
      } else {
        const existing = groups.get(key);
        existing.count += 1;
        if (schedule.scheduled_date > existing.end_date) existing.end_date = schedule.scheduled_date;
        if (schedule.scheduled_date < existing.start_date) existing.start_date = schedule.scheduled_date;
        existing.child_ids.push(schedule.id);
      }
    });
    return Array.from(groups.values());
  }, [displayedSchedules]);

  const activeList = viewLayout === 'individual' ? displayedSchedules : groupedSchedules;

  const rowVirtualizer = useVirtualizer({
    count: activeList.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 64,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col space-y-3 md:space-y-4 animate-in fade-in duration-500 max-w-7xl mx-auto w-full">
      
      {/* --- BLOCK A: THE HEADER RIBBON --- */}
      <div className="flex justify-between items-center w-full">
        <div className="shrink-0 pr-4">
           <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Feeding Schedules</h1>
           <p className="text-[10px] md:text-xs text-slate-500 font-medium">Dietary management & kitchen prep routines</p>
        </div>
        
        {/* Tier 2 RBAC: Write Action Gate */}
        {hasPermission('husbandry:write') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Plus size={16} className="text-emerald-400" />
            <span>Add Schedule</span>
          </button>
        )}
      </div>

      {/* --- BLOCK B: THE CONTROL DECK (Search + Animal Dropdown + Toggles) --- */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 md:gap-3 w-full bg-slate-50/80 p-2 md:p-3 rounded-2xl border border-slate-200 shadow-inner">
        
        {/* Real-time Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Search animal, diet item, or species..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm placeholder:text-slate-400"
          />
        </div>

        {/* Animal Dropdown Filter */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm shrink-0">
          <Filter size={14} className="text-slate-400 shrink-0" />
          <select 
            value={filterAnimalId} 
            onChange={(e) => setFilterAnimalId(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-700 uppercase tracking-wider border-none focus:ring-0 cursor-pointer outline-none py-0.5 pr-2 w-full sm:w-48 truncate"
          >
            <option value="ALL">All Animals ({animals.length})</option>
            {animals.filter(a => (a.category || '').toUpperCase() === activeTab).map(a => (
              <option key={a.id} value={a.id!}>{a.name} ({a.species})</option>
            ))}
          </select>
        </div>

        {/* View Layout Toggles */}
        <div className="bg-slate-200/60 p-1 rounded-xl flex border border-slate-200/80 shrink-0">
          <button onClick={() => setViewLayout('individual')} className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewLayout === 'individual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Individual</button>
          <button onClick={() => setViewLayout('grouped')} className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewLayout === 'grouped' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Grouped</button>
        </div>
      </div>

      {/* --- BLOCK C: THE CATEGORY TABS --- */}
      <div className="grid grid-cols-4 md:flex md:gap-2 w-full shrink-0 gap-1.5 overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => { setActiveTab(cat); setFilterAnimalId('ALL'); }}
            className={`px-1 md:px-6 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-sm ${
              activeTab === cat 
                ? 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* --- MAIN DATA VIEW (Full-Width Virtualized Table) --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 relative overflow-hidden">
        
        <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex justify-between items-center">
          <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
            <Utensils size={14} className="text-emerald-600"/> Active Kitchen Diets ({activeList.length})
          </h4>
        </div>

        <div ref={scrollParentRef} className="flex-1 overflow-y-auto relative custom-scrollbar">
          {loadingSchedules && (
            <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Syncing Kitchen Schedules...</span>
              </div>
            </div>
          )}
          <table className="w-full text-left min-w-[600px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">Date / Window</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/3">Animal</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/3">Diet Specifics & Ration</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loadingSchedules && activeList.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-16 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No active feeding schedules in this view. Click '+ Add Schedule' above.</td></tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={4} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const item = activeList[virtualRow.index];
                    
                    if (viewLayout === 'individual') {
                      const schedule = item as FeedingScheduleType;
                      const animal = animals.find(a => a.id === schedule.animal_id);
                      const dateObj = parseISO(schedule.scheduled_date);
                      const isToday = schedule.scheduled_date === getLocalDateString();
                      const isNotRequired = schedule.notes === 'FAST DAY / NOT REQUIRED';

                      return (
                        <tr key={schedule.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="px-6 py-4">
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${isToday ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                              <CalIcon size={12}/> {format(dateObj, 'd MMM yyyy')}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">{animal?.name || 'Unknown'}</p>
                            <span className="text-[10px] text-slate-400 font-bold block">{animal?.species}</span>
                          </td>
                          <td className="px-6 py-4">
                            {isNotRequired ? (
                              <span className="inline-block px-2.5 py-1 rounded bg-rose-50 border border-rose-100 text-xs font-black text-rose-600 uppercase tracking-widest">FAST DAY • NOT REQUIRED</span>
                            ) : (
                              <div>
                                <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">{schedule.quantity}x {schedule.food_type}</p>
                                {schedule.supplements && <span className="inline-block mt-1 px-2 py-0.5 rounded text-[9px] bg-amber-50 border border-amber-200 text-amber-800 font-bold uppercase tracking-widest">+ {schedule.supplements}</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {/* Tier 2 RBAC: Delete Action Gate */}
                            {hasPermission('husbandry:delete') && (
                              <button 
                                onClick={() => deleteSingleMutation.mutate(schedule.id!)}
                                disabled={deleteSingleMutation.isPending}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                title="Delete Schedule"
                              >
                                {deleteSingleMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    } else {
                      const group = item as any;
                      const animal = animals.find(a => a.id === group.animal_id);
                      const startDateObj = parseISO(group.start_date);
                      const endDateObj = parseISO(group.end_date);

                      return (
                        <tr key={virtualRow.index} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1 w-fit">
                              <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest">
                                From: {format(startDateObj, 'd MMM')}
                              </span>
                              {group.count > 1 && (
                                <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest">
                                  Until: {format(endDateObj, 'd MMM')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">{animal?.name || 'Unknown'}</p>
                            <span className="text-[10px] text-slate-400 font-bold block">{animal?.species}</span>
                          </td>
                          <td className="px-6 py-4">
                            {group.feed_not_required ? (
                              <span className="inline-block px-2.5 py-1 rounded bg-rose-50 border border-rose-100 text-xs font-black text-rose-600 uppercase tracking-widest">FAST DAY • NOT REQUIRED ({group.count} days)</span>
                            ) : (
                              <div>
                                <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">
                                  {group.quantity}x {group.food_type} <span className="text-slate-400 font-medium">({group.count} feeds)</span>
                                </p>
                                {group.supplements && <span className="inline-block mt-1 px-2 py-0.5 rounded text-[9px] bg-amber-50 border border-amber-200 text-amber-800 font-bold uppercase tracking-widest">+ {group.supplements}</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {/* Tier 2 RBAC: Delete Action Gate */}
                            {hasPermission('husbandry:delete') && (
                              <button 
                                onClick={() => deleteGroupMutation.mutate(group.child_ids)}
                                disabled={deleteGroupMutation.isPending}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50" 
                                title="Delete entire interval group"
                              >
                                {deleteGroupMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  })}
                  {paddingBottom > 0 && <tr><td colSpan={4} style={{ height: `${paddingBottom}px` }} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Standalone Schedule Modal Component */}
      <FeedingScheduleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        activeCategory={activeTab}
      />

    </div>
  );
}