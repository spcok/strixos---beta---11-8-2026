import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, HardDrive, Wifi, WifiOff, CloudUpload, ShieldCheck, Cpu } from 'lucide-react';

export const Route = createFileRoute('/settings/health')({
  component: SystemHealthPage,
});

export function SystemHealthPage() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [storageData, setStorageData] = useState<{ usage: string, quota: string, percent: number }>({ usage: '0 MB', quota: '0 MB', percent: 0 });

  // ------------------------------------------------------------------
  // REACT 19 ARCHITECTURE: Native External Store Subscription
  // Safely watches the TanStack cache without triggering render collisions
  // ------------------------------------------------------------------
  const pausedMutations = useSyncExternalStore(
    // 1. The Subscriber: Tells React when to update
    (onStoreChange) => queryClient.getMutationCache().subscribe(onStoreChange),
    // 2. The Snapshot: Tells React what data to extract
    () => queryClient.getMutationCache().getAll().filter(m => m.state.isPaused).length
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Track IndexedDB/Browser Quota safely
    const fetchStorage = async () => {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        try {
          const { usage, quota } = await navigator.storage.estimate();
          if (usage && quota) {
            setStorageData({
              usage: (usage / (1024 * 1024)).toFixed(2) + ' MB',
              quota: (quota / (1024 * 1024)).toFixed(2) + ' MB',
              percent: Math.min((usage / quota) * 100, 100)
            });
          }
        } catch (e) {
          console.warn('Storage API not supported on this browser.');
        }
      }
    };
    fetchStorage();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Determine App Mode based on the bypass logic
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="border-b-2 border-slate-200 pb-6">
        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
          <Activity className="text-emerald-600" size={24} /> System Health & Telemetry
        </h3>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">StrixOS Engine Diagnostics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Network Status */}
        <div className={`p-6 rounded-2xl border ${isOnline ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h4 className={`text-xs font-black uppercase tracking-widest ${isOnline ? 'text-emerald-800' : 'text-rose-800'}`}>Network Link</h4>
            {isOnline ? <Wifi size={20} className="text-emerald-600" /> : <WifiOff size={20} className="text-rose-600" />}
          </div>
          <p className="text-3xl font-black text-slate-900 mb-1">{isOnline ? 'ONLINE' : 'OFFLINE'}</p>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${isOnline ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isOnline ? 'Connected to Supabase' : 'Operating via IndexedDB Queue'}
          </p>
        </div>

        {/* Mutation Queue */}
        <div className={`p-6 rounded-2xl border ${pausedMutations > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h4 className={`text-xs font-black uppercase tracking-widest ${pausedMutations > 0 ? 'text-amber-800' : 'text-slate-500'}`}>Pending Payloads</h4>
            <CloudUpload size={20} className={pausedMutations > 0 ? 'text-amber-600 animate-pulse' : 'text-slate-400'} />
          </div>
          <p className="text-3xl font-black text-slate-900 mb-1">{pausedMutations}</p>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${pausedMutations > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
            {pausedMutations > 0 ? 'Awaiting Network Restoration' : 'All local queues synced'}
          </p>
        </div>

        {/* Architecture Mode */}
        <div className="p-6 rounded-2xl border bg-white border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Engine Profile</h4>
            <Cpu size={20} className="text-slate-400" />
          </div>
          <p className="text-xl font-black text-slate-900 mb-1 tracking-tight">{isIOS ? 'iOS RAM Memory' : 'IndexedDB Persist'}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
            {isIOS ? 'Operating in strict memory mode to prevent WebKit purges.' : 'Operating with 14-day persistent hard drive caching.'}
          </p>
        </div>

        {/* Local Storage */}
        <div className="md:col-span-2 lg:col-span-3 p-6 rounded-2xl border bg-white border-slate-200 shadow-sm flex flex-col md:flex-row gap-8 items-center justify-between">
          <div className="flex items-center gap-6 w-full">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100 shrink-0">
              <HardDrive size={24} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 mb-2 flex items-center gap-2">
                Local Device Storage Quota <ShieldCheck size={14} className="text-emerald-500" />
              </h4>
              <div className="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden border border-slate-200">
                <div className="bg-blue-600 h-full rounded-full transition-all duration-1000" style={{ width: `${storageData.percent}%` }}></div>
              </div>
              <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <span>Used: {storageData.usage}</span>
                <span>Max Capacity: {storageData.quota}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}