import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual'; // CRITICAL: Swapped to element-based virtualizer
import { 
  CheckCircle2, AlertCircle, Droplets, Lock, HeartPulse, 
  ChevronLeft, ChevronRight, Loader2, Edit3, X, Save, Search, Users, User
} from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dailyRoundsService } from '../services/dailyRoundsService';
import { Animal, DailyRound } from '../types';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const getAnimalsOptions = () => queryOptions({
  queryKey: ['animals', 'dashboard'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('*').order('name');
    if (error) throw error;
    return data as Animal[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const getRoundsOptions = (date: string, shift: 'MORNING' | 'AFTERNOON') => queryOptions({
  queryKey: ['rounds', date, shift],
  queryFn: () => dailyRoundsService.getRoundsByDateAndShift(date, shift),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// 2. ROUTE DEFINITION
// ------------------------------------------------------------------
export const Route = createFileRoute('/husbandry/rounds')({
  loader: async ({ context: { queryClient } }) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const shift = new Date().getHours() < 12 ? 'MORNING' : 'AFTERNOON';
    
    queryClient.prefetchQuery(getAnimalsOptions());
    queryClient.prefetchQuery(getRoundsOptions(today, shift));
  },
  component: DailyRounds
});

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768); // Mobile breakpoint
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  return isMobile;
}

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
function DailyRounds() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  
  // -- Local State --
  const [activeDate, setActiveDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [inputDate, setInputDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [activeShift, setActiveShift] = useState<'MORNING' | 'AFTERNOON'>(
    new Date().getHours() < 12 ? 'MORNING' : 'AFTERNOON'
  );
  
  // -- Unified Control Deck State --
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [draftRounds, setDraftRounds] = useState<Record<string, Partial<DailyRound>>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  
  // -- Modal State --
  const [noteModalState, setNoteModalState] = useState<{
    isOpen: boolean;
    animal: Animal | null;
    round: DailyRound | null;
    currentNote: string;
  }>({
    isOpen: false,
    animal: null,
    round: null,
    currentNote: ''
  });

  // -- Virtualizer Ref --
  const parentRef = useRef<HTMLDivElement>(null);

  // -- Queries --
  const { data: animals = [], isLoading: loadingAnimals } = useQuery(getAnimalsOptions());
  const { data: rounds = [], isLoading: loadingRounds } = useQuery(getRoundsOptions(activeDate, activeShift));

  const isLoading = loadingAnimals || loadingRounds;

  // -- Derived Data --
  const categories = useMemo(() => Array.from(new Set(animals.map(a => a.category).filter(Boolean))).sort(), [animals]);
  const tabs = ['ALL', ...categories];

  const displayAnimals = useMemo(() => {
    let filtered = animals.filter(a => a.status !== 'ARCHIVED');
    
    if (activeTab !== 'ALL') {
      filtered = filtered.filter(a => a.category === activeTab);
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.name.toLowerCase().includes(q) || 
        a.species?.toLowerCase().includes(q) ||
        a.ring_number?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [animals, activeTab, searchQuery]);

  // CRITICAL: The Architecturally Sound Virtualizer
  const virtualizer = useVirtualizer({
    count: displayAnimals.length,
    getScrollElement: () => parentRef.current, // Bind directly to the scrolling div
    estimateSize: () => isMobile ? 120 : 80, // Taller on mobile for stacked layout
    overscan: 5,
  });

  // -- Realtime Subscription --
  useEffect(() => {
    const channel = supabase.channel('rounds_sync')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'daily_rounds',
        filter: `record_date=eq.${activeDate}` 
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['rounds', activeDate, activeShift] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeDate, activeShift, queryClient]);

  // -- Event Handlers --
  const handleDateChange = (newDate: string) => {
    setActiveDate(newDate);
    setInputDate(newDate);
    setDraftRounds({});
    setHasUnsavedChanges(false);
    setSubmissionStatus(null);
  };

  const shiftDate = (days: number) => {
    const newDate = format(addDays(parseISO(activeDate), days), 'yyyy-MM-dd');
    handleDateChange(newDate);
  };

  const handleToggle = (animalId: string, field: keyof DailyRound) => {
    setDraftRounds(prev => {
      const existingDraft = prev[animalId];
      const dbRound = rounds.find(r => r.animal_id === animalId);
      
      const currentState = existingDraft?.[field] !== undefined 
        ? existingDraft[field] 
        : (dbRound?.[field] ?? (field === 'is_alive' ? true : false)); // Defaults

      const newState = !currentState;

      return {
        ...prev,
        [animalId]: {
          ...prev[animalId],
          animal_id: animalId,
          [field]: newState
        }
      };
    });
    setHasUnsavedChanges(true);
    setSubmissionStatus(null);
  };

  const handleSubmit = async () => {
    if (!user) {
      setSubmissionStatus({ type: 'error', message: 'You must be logged in to submit rounds.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmissionStatus(null);

      const roundsToSubmit: Partial<DailyRound>[] = Object.values(draftRounds).map(draft => {
        const dbRound = rounds.find(r => r.animal_id === draft.animal_id);
        
        return {
          id: dbRound?.id,
          animal_id: draft.animal_id,
          record_date: activeDate,
          shift: activeShift,
          is_alive: draft.is_alive !== undefined ? draft.is_alive : (dbRound?.is_alive ?? true),
          water_checked: draft.water_checked !== undefined ? draft.water_checked : (dbRound?.water_checked ?? false),
          locks_secured: draft.locks_secured !== undefined ? draft.locks_secured : (dbRound?.locks_secured ?? false),
          animal_issue_note: draft.animal_issue_note !== undefined ? draft.animal_issue_note : dbRound?.animal_issue_note,
          conducted_by: user.id 
        };
      });

      await dailyRoundsService.upsertRounds(roundsToSubmit);
      
      setDraftRounds({});
      setHasUnsavedChanges(false);
      setSubmissionStatus({ type: 'success', message: 'Rounds successfully saved.' });
      
    } catch (error) {
      console.error("Error submitting rounds:", error);
      setSubmissionStatus({ type: 'error', message: 'Failed to save rounds. They will sync when online.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col space-y-3 md:space-y-4 animate-in fade-in duration-500 max-w-7xl mx-auto w-full">
      
      {/* --- BLOCK A: THE HEADER RIBBON --- */}
      <div className="flex justify-between items-center w-full portrait:flex landscape:hidden md:landscape:flex">
        <div className="shrink-0 pr-4">
           <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Daily Rounds</h1>
        </div>
      </div>

      {/* --- BLOCK B: THE CONTROL DECK --- */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 md:gap-3 w-full bg-slate-50/80 p-2 md:p-3 rounded-2xl border border-slate-200 shadow-inner portrait:flex landscape:hidden md:landscape:flex">
        
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search animals..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center justify-between bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-full sm:w-auto shrink-0">
          <button onClick={() => shiftDate(-1)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-all active:scale-95"><ChevronLeft size={16} /></button>
          <div className="flex-1 sm:flex-none relative flex justify-center border-l border-r border-slate-100 px-2 min-w-[120px]">
            <input 
              type="date" 
              value={inputDate}
              onChange={(e) => setInputDate(e.target.value)}
              onBlur={(e) => handleDateChange(e.target.value)}
              className="bg-transparent border-none text-[10px] md:text-xs font-bold text-slate-700 focus:outline-none focus:ring-0 py-1 cursor-pointer w-full text-center"
            />
          </div>
          <button onClick={() => shiftDate(1)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-800 transition-all active:scale-95"><ChevronRight size={16} /></button>
        </div>

        <div className="flex bg-slate-200/50 p-1 rounded-xl w-full sm:w-auto shrink-0">
          <button
            onClick={() => setActiveShift('MORNING')}
            className={`flex-1 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeShift === 'MORNING' 
                ? 'bg-white text-emerald-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            {isMobile ? 'AM' : 'Morning Shift'}
          </button>
          <button
            onClick={() => setActiveShift('AFTERNOON')}
            className={`flex-1 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeShift === 'AFTERNOON' 
                ? 'bg-white text-emerald-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            {isMobile ? 'PM' : 'Afternoon Shift'}
          </button>
        </div>
      </div>

      {/* --- BLOCK C: THE CATEGORY TABS --- */}
      <div className="grid grid-cols-4 md:flex md:gap-2 w-full shrink-0 gap-1.5">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-1 md:px-4 py-1.5 md:py-2 rounded-xl text-[9px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap md:whitespace-normal transition-all shadow-sm ${
              activeTab === tab 
                ? 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* --- MAIN DATA VIEW --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 relative overflow-hidden">
        
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-emerald-500 mb-4" size={32} />
            <p className="text-slate-500 font-medium animate-pulse">Syncing offline queue...</p>
          </div>
        )}

        {/* Desktop/Tablet Header Row */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_120px] bg-slate-50 border-b border-slate-200 px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
          <div>Animal Profile</div>
          <div className="text-center">Visual Check</div>
          <div className="text-center">Water Checked</div>
          <div className="text-center">Locks Secured</div>
          <div className="text-center">Notes</div>
        </div>

        {/* CRITICAL: The Architecturally Sound Scrolling Container */}
        {/* Must be relative so the absolute children position correctly */}
        <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar">
          
          {displayAnimals.length === 0 && !isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4 border border-slate-200">
                <Search size={24} className="text-slate-400" />
              </div>
              <p className="font-bold text-slate-700 mb-1">No collections found</p>
              <p className="text-xs">Adjust your search or filters.</p>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const animal = displayAnimals[virtualItem.index];
                const dbRound = rounds.find(r => r.animal_id === animal.id);
                const draft = draftRounds[animal.id];
                const mergedRound = draft ? { ...dbRound, ...draft } : dbRound;

                const isGroup = animal.record_type === 'GROUP';
                const isAlive = mergedRound?.is_alive !== undefined ? mergedRound.is_alive : true;
                const waterChecked = mergedRound?.water_checked !== undefined ? mergedRound.water_checked : false;
                const locksSecured = mergedRound?.locks_secured !== undefined ? mergedRound.locks_secured : false;
                const hasNote = !!mergedRound?.animal_issue_note;

                return (
                  <div
                    key={animal.id} // Replaced virtualItem.index with animal.id for stable rendering
                    className="absolute top-0 left-0 w-full border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    style={{
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    
                    {/* RESPONSIVE ROW LAYOUT */}
                    <div className="h-full w-full px-3 py-3 md:py-0 md:px-6 flex flex-col md:grid md:grid-cols-[2fr_1fr_1fr_1fr_120px] md:items-center md:gap-4 justify-center box-border">
                      
                      {/* IDENTITY BLOCK */}
                      <div className="flex items-center gap-3 min-w-0 mb-3 md:mb-0 w-full">
                        {animal.profile_image_url ? (
                          <img src={animal.profile_image_url} className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 shadow-sm" alt="" />
                        ) : (
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${isGroup ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            {isGroup ? <Users size={16} /> : <User size={16} />}
                          </div>
                        )}
                        
                        <div className="min-w-0 flex flex-col justify-center flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm tracking-tight truncate" title={animal.name}>{animal.name}</span>
                            {hasNote && <AlertCircle size={14} className="text-amber-500 shrink-0" />}
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate mt-0.5">
                            {animal.ring_number && <span className="font-black text-slate-400 uppercase tracking-widest">{animal.ring_number}</span>}
                            {animal.ring_number && animal.species && <span>•</span>}
                            {animal.species && <span className="italic truncate" title={animal.species}>{animal.species}</span>}
                          </div>
                        </div>
                      </div>

                      {/* ACTIONS BLOCK */}
                      <div className="flex items-center justify-between md:contents w-full shrink-0">
                        
                        <button
                          onClick={() => handleToggle(animal.id, 'is_alive')}
                          className={`flex items-center justify-center shrink-0 transition-all ${
                            isMobile 
                              ? `w-12 h-12 rounded-full shadow-sm ${isAlive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`
                              : `w-full h-10 rounded-xl font-bold text-[11px] lg:text-xs gap-2 border shadow-sm ${isAlive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`
                          }`}
                        >
                          {isAlive ? <HeartPulse size={isMobile ? 20 : 16} /> : <AlertCircle size={isMobile ? 20 : 16} />}
                          {!isMobile && (isAlive ? 'Alive & Well' : 'Issue Detected')}
                        </button>

                        <button
                          onClick={() => handleToggle(animal.id, 'water_checked')}
                          className={`flex items-center justify-center shrink-0 transition-all ${
                            isMobile 
                              ? `w-12 h-12 rounded-full shadow-sm ${waterChecked ? 'bg-sky-50 text-sky-600 border border-sky-100' : 'bg-slate-50 text-slate-400 border border-slate-200'}`
                              : `w-full h-10 rounded-xl font-bold text-[11px] lg:text-xs gap-2 border shadow-sm ${waterChecked ? 'bg-sky-50 text-sky-600 border-sky-100' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`
                          }`}
                        >
                          <Droplets size={isMobile ? 20 : 16} className={!isMobile && !waterChecked ? 'text-slate-400' : ''} />
                          {!isMobile && (waterChecked ? 'Water Fresh' : 'Check Water')}
                        </button>

                        <button
                          onClick={() => handleToggle(animal.id, 'locks_secured')}
                          className={`flex items-center justify-center shrink-0 transition-all ${
                            isMobile 
                              ? `w-12 h-12 rounded-full shadow-sm ${locksSecured ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-slate-50 text-slate-400 border border-slate-200'}`
                              : `w-full h-10 rounded-xl font-bold text-[11px] lg:text-xs gap-2 border shadow-sm ${locksSecured ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`
                          }`}
                        >
                          <Lock size={isMobile ? 20 : 16} className={!isMobile && !locksSecured ? 'text-slate-400' : ''} />
                          {!isMobile && (locksSecured ? 'Secured' : 'Check Locks')}
                        </button>

                        {/* Mobile Notes Button */}
                        {isMobile && (
                          <button
                            onClick={() => setNoteModalState({ isOpen: true, animal, round: mergedRound as DailyRound, currentNote: mergedRound?.animal_issue_note || '' })}
                            className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all border shadow-sm ${
                              hasNote 
                                ? 'bg-amber-50 text-amber-600 border-amber-200' 
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                          >
                            {hasNote ? <AlertCircle size={20} /> : <Edit3 size={20} />}
                          </button>
                        )}
                      </div>

                      {/* Desktop Notes Button */}
                      <div className="hidden md:flex justify-center w-full">
                        <button
                          onClick={() => setNoteModalState({ isOpen: true, animal, round: mergedRound as DailyRound, currentNote: mergedRound?.animal_issue_note || '' })}
                          className={`w-full max-w-[100px] h-10 rounded-xl flex items-center justify-center transition-colors border shadow-sm font-bold text-[11px] lg:text-xs gap-2 ${
                            hasNote 
                              ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {hasNote ? <AlertCircle size={16} /> : <Edit3 size={16} className="text-slate-400" />}
                          {hasNote ? 'Logged' : 'Add Note'}
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* --- FIXED BOTTOM SUBMIT BAR --- */}
        <div className="border-t border-slate-200 bg-white p-3 md:p-4 flex items-center justify-between z-20">
          <div className="flex-1 min-w-0 pr-4">
             {hasUnsavedChanges ? (
               <div className="flex items-center gap-2 text-amber-600">
                 <AlertCircle size={16} />
                 <span className="text-[10px] md:text-xs font-bold truncate">Unsaved checks detected</span>
               </div>
             ) : submissionStatus ? (
               <div className={`flex items-center gap-2 ${submissionStatus.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                 <CheckCircle2 size={16} />
                 <span className="text-[10px] md:text-xs font-bold truncate">{submissionStatus.message}</span>
               </div>
             ) : (
               <span className="text-[10px] md:text-xs text-slate-500 truncate hidden sm:block">All checks synced to database.</span>
             )}
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={!hasUnsavedChanges || isSubmitting}
            className={`px-4 md:px-6 py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0 shadow-sm ${
              hasUnsavedChanges && !isSubmitting
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white hover:shadow-md active:scale-95'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Submit Rounds
          </button>
        </div>
      </div>

      {/* --- NOTE MODAL --- */}
      {noteModalState.isOpen && noteModalState.animal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-slate-100 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm tracking-tight">{noteModalState.animal.name}</h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">Round Issue Note</p>
              </div>
              <button 
                onClick={() => setNoteModalState({ isOpen: false, animal: null, round: null, currentNote: '' })}
                className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4">
              <textarea
                value={noteModalState.currentNote}
                onChange={(e) => setNoteModalState(prev => ({ ...prev, currentNote: e.target.value }))}
                placeholder="Enter details about broken locks, empty water, or animal condition..."
                className="w-full h-32 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none resize-none"
              />
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
              <button
                onClick={() => setNoteModalState({ isOpen: false, animal: null, round: null, currentNote: '' })}
                className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const animalId = noteModalState.animal!.id;
                  const trimmed = noteModalState.currentNote.trim();
                  
                  setDraftRounds(prev => {
                    const existingDraft = prev[animalId];
                    const dbRound = rounds.find(r => r.animal_id === animalId);
                    const merged = existingDraft ? { ...dbRound, ...existingDraft } : dbRound;

                    return {
                      ...prev,
                      [animalId]: {
                        ...prev[animalId],
                        animal_id: animalId,
                        is_alive: merged?.is_alive !== undefined ? merged.is_alive : true,
                        water_checked: merged?.water_checked !== undefined ? merged.water_checked : false,
                        locks_secured: merged?.locks_secured !== undefined ? merged.locks_secured : false,
                        animal_issue_note: trimmed
                      }
                    };
                  });
                  setHasUnsavedChanges(true);
                  setSubmissionStatus(null);
                  setNoteModalState({ isOpen: false, animal: null, round: null, currentNote: '' });
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <Save size={16} />
                Save Draft Note
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}