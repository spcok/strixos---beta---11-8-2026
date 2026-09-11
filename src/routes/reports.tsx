import React, { useState, useMemo, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { reportExportService } from '../services/reportExportService';
import { 
  CalendarDays, ListOrdered, AlertTriangle, ArrowRightLeft, 
  Download, Loader2, FileText, Eye, Filter, WifiOff,
  Scale, Utensils, Wrench, HeartPulse, Archive, Thermometer
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS - v3 SCHEMA COMPLIANCE POOL
// ------------------------------------------------------------------
const reportDataOptions = queryOptions({
  queryKey: ['report_data_pool_v3'],
  queryFn: async () => {
    const [
      animals, logs, feedLogs, weightLogs, tempLogs, 
      internal, external, incidents, maintenance, firstAid, users
    ] = await Promise.all([
      supabase.from('animals').select('*, animals:parent_group_id(name)').eq('is_deleted', false).order('name'),
      supabase.from('daily_logs').select('*, animals(name, species, category)').eq('is_deleted', false).order('log_date', { ascending: false }),
      supabase.from('feed_logs').select('*, animals(name, species, category)').eq('is_deleted', false).order('recorded_at', { ascending: false }),
      supabase.from('weight_logs').select('*, animals(name, species, category)').eq('is_deleted', false).order('recorded_at', { ascending: false }),
      supabase.from('temperature_logs').select('*, animals(name, species, category)').eq('is_deleted', false).order('recorded_at', { ascending: false }),
      supabase.from('internal_movements').select('*, animals(name, species, category)').eq('is_deleted', false).order('movement_date', { ascending: false }),
      supabase.from('external_transfers').select('*, animals(name, species, category)').eq('is_deleted', false).order('transfer_date', { ascending: false }),
      supabase.from('incidents').select('*').eq('is_deleted', false).order('incident_date', { ascending: false }),
      supabase.from('maintenance_tickets').select('*').eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('first_aid_logs').select('*').eq('is_deleted', false).order('incident_date', { ascending: false }),
      supabase.from('users').select('id, name, initials')
    ]);

    return {
      animals: animals.data || [],
      logs: logs.data || [],
      feedLogs: feedLogs.data || [],
      weightLogs: weightLogs.data || [],
      tempLogs: tempLogs.data || [],
      internal: internal.data || [],
      external: external.data || [],
      incidents: incidents.data || [],
      maintenance: maintenance.data || [],
      firstAid: firstAid.data || [],
      users: users.data || []
    };
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/reports')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) await queryClient.ensureQueryData(reportDataOptions);
  },
  component: ReportsDashboard,
});

const REPORTS = [
  { id: 'husbandry', title: 'Husbandry Logs', description: 'Export general observation records.', icon: CalendarDays, columns: ['Date', 'Animal', 'Notes', 'Staff'] },
  { id: 'weekly_feed', title: 'Feed Logs', description: 'Dedicated nutritional intake & diet tracking.', icon: Utensils, columns: ['Date', 'Animal', 'Diet/Method', 'Quantity', 'Notes', 'Staff'] },
  { id: 'weekly_weight', title: 'Weight Charts', description: 'Dedicated mass tracking & condition logs.', icon: Scale, columns: ['Date', 'Animal', 'Weight (g)', 'Time', 'Notes', 'Staff'] },
  { id: 'temperature', title: 'Temperature Logs', description: 'Ambient, basking, and cool zone gradients.', icon: Thermometer, columns: ['Date', 'Animal', 'Basking', 'Cool', 'Ambient', 'Staff'] },
  { id: 'internal_movements', title: 'Internal Movements', description: 'Log of enclosure biosecurity changes.', icon: ArrowRightLeft, columns: ['Date', 'Animal', 'Species', 'From', 'To', 'Reason'] },
  { id: 'external_movements', title: 'External Transfers', description: 'Acquisitions, loans, and dispositions.', icon: ArrowRightLeft, columns: ['Date', 'Animal', 'Transfer Type', 'Origin/Destination', 'Auth By'] },
  { id: 'census', title: 'Site Census', description: 'Complete site inventory.', icon: ListOrdered, columns: ['Name', 'Species', 'Category', 'Sex', 'Status'] },
  { id: 'incidents', title: 'Safety Incidents', description: 'Operational and safety incident log.', icon: AlertTriangle, columns: ['Date', 'Category', 'Severity', 'Description', 'Reported By'] },
  { id: 'first_aid', title: 'First Aid Logs', description: 'Medical interventions for staff/public.', icon: HeartPulse, columns: ['Date', 'Person Type', 'Injury', 'Treatment', 'Staff'] },
  { id: 'maintenance', title: 'Site Maintenance', description: 'Facility repair and upkeep log.', icon: Wrench, columns: ['Date', 'Location', 'Issue', 'Priority', 'Status'] },
  { id: 'inspection_pack', title: 'ZLA Inspection Pack', description: 'Auto-generates a .zip containing all statutory requirements.', icon: Archive, columns: ['Included Document', 'Description'] }
];

export function ReportsDashboard() {
  const { user, profile } = useAuth();
  const [activeReportId, setActiveReportId] = useState('husbandry');
  
  const [startDate, setStartDate] = useState(format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { data: db, isLoading } = useQuery(reportDataOptions);
  const activeReport = REPORTS.find(r => r.id === activeReportId) || REPORTS[0];

  // ------------------------------------------------------------------
  // 2. DATA TRANSFORMATION ENGINE
  // ------------------------------------------------------------------
  const getStaffName = (identifier: string | null | undefined) => {
    if (!identifier) return '-';
    if (!identifier.includes('-')) return identifier;
    if (!db?.users) return identifier.substring(0, 8);
    const match = db.users.find((u: any) => u.id === identifier);
    return match ? match.name || match.initials : identifier.substring(0, 8);
  };

  const getTransformedData = (reportId: string) => {
    if (!db) return [];
    const sDate = new Date(startDate).getTime();
    const eDate = new Date(endDate).getTime() + 86399999; 
    
    const filterByDateAndCategory = (items: any[], dateField: string) => {
      return items.filter(item => {
        const t = new Date(item[dateField]).getTime();
        const categoryMatch = selectedCategory === 'ALL' || item.animals?.category === selectedCategory;
        return t >= sDate && t <= eDate && categoryMatch;
      });
    };

    switch (reportId) {
      case 'husbandry':
        return filterByDateAndCategory(db.logs.filter((l: any) => l.log_type === 'OBSERVATION'), 'log_date')
          .map((l: any) => [
            format(parseISO(l.log_date), 'dd MMM yyyy HH:mm'), 
            l.animals?.name || 'Unknown', 
            l.notes || '-', 
            getStaffName(l.conducted_by || l.created_by) 
          ]);
      
      case 'weekly_feed':
        return filterByDateAndCategory(db.feedLogs, 'recorded_at')
          .map((l: any) => [
            format(parseISO(l.recorded_at), 'dd MMM yyyy'), 
            l.animals?.name || 'Unknown', 
            `${l.food_item} ${l.feed_method ? `(${l.feed_method})` : ''}`, 
            `${l.quantity} ${l.unit}`, 
            l.notes || '-',
            getStaffName(l.recorded_by || l.created_by)
          ]);

      case 'weekly_weight':
        return filterByDateAndCategory(db.weightLogs, 'recorded_at')
          .map((l: any) => [
            format(parseISO(l.recorded_at), 'dd MMM yyyy'), 
            l.animals?.name || 'Unknown', 
            l.weight_grams, 
            l.am_pm || '-', 
            l.notes || '-',
            getStaffName(l.recorded_by || l.created_by)
          ]);

      case 'temperature':
        return filterByDateAndCategory(db.tempLogs, 'recorded_at')
          .map((l: any) => [
            format(parseISO(l.recorded_at), 'dd MMM yyyy'), 
            l.animals?.name || 'Unknown', 
            l.temp_basking ? `${l.temp_basking}°C` : '-', 
            l.temp_cool ? `${l.temp_cool}°C` : '-', 
            l.temp_ambient ? `${l.temp_ambient}°C` : '-', 
            getStaffName(l.recorded_by || l.created_by)
          ]);

      case 'internal_movements':
        return filterByDateAndCategory(db.internal, 'movement_date')
          .map((m: any) => [
            format(parseISO(m.movement_date), 'dd MMM yyyy'), 
            m.animals?.name || 'Unknown', 
            m.animals?.species || '-', 
            m.from_location || 'External', 
            m.to_location || 'Unknown', 
            m.reason || '-'
          ]);

      case 'external_movements':
        return filterByDateAndCategory(db.external, 'transfer_date')
          .map((m: any) => [
            format(parseISO(m.transfer_date), 'dd MMM yyyy'), 
            m.animals?.name || 'Unknown', 
            m.transfer_type, 
            m.transfer_type === 'OUT' ? m.entity_name : 'External', 
            m.entity_contact || '-'
          ]);

      case 'census':
        return db.animals.filter((a: any) => selectedCategory === 'ALL' || a.category === selectedCategory)
          .map((a: any) => [a.name, a.species, a.category || '-', a.gender || 'U', a.status || 'ACTIVE']);

      case 'incidents':
        return db.incidents.filter((i: any) => new Date(i.incident_date).getTime() >= sDate && new Date(i.incident_date).getTime() <= eDate)
          .map((i: any) => [
            format(parseISO(i.incident_date), 'dd MMM yyyy HH:mm'), 
            i.incident_type, 
            i.severity, 
            i.description, 
            getStaffName(i.reported_by)
          ]);

      case 'first_aid':
        return db.firstAid.filter((f: any) => new Date(f.incident_date).getTime() >= sDate && new Date(f.incident_date).getTime() <= eDate)
          .map((f: any) => [
            format(parseISO(f.incident_date), 'dd MMM yyyy HH:mm'), 
            f.person_type, 
            f.treatment_provided, 
            f.injury_description || '-', 
            getStaffName(f.administered_by)
          ]);

      case 'maintenance':
        return db.maintenance.filter((m: any) => new Date(m.created_at).getTime() >= sDate && new Date(m.created_at).getTime() <= eDate)
          .map((m: any) => [
            format(parseISO(m.created_at), 'dd MMM yyyy'), 
            m.location || 'Site Wide', 
            m.title || m.description || '-', 
            m.priority, 
            m.status
          ]);

      case 'inspection_pack':
        return [
          ['1_Husbandry_Logs.docx', 'Daily observation records.'],
          ['2_Feed_and_Diet_Logs.docx', 'Nutritional intake matrices.'],
          ['3_Weight_Logs.docx', 'Mass tracking and scaling conditions.'],
          ['4_Internal_Movements.docx', 'Audit of enclosure biosecurity changes.'],
          ['5_External_Transfers.docx', 'Audit of acquisitions and dispositions.'],
          ['6_Site_Census.docx', 'Current active population list.']
        ];

      default:
        return [];
    }
  };

  const reportData = useMemo(() => getTransformedData(activeReportId), [db, activeReportId, startDate, endDate, selectedCategory]);

  // ------------------------------------------------------------------
  // 3. EXPORT HANDLER
  // ------------------------------------------------------------------
  const handleExport = async () => {
    if (!isOnline) {
      alert("Compliance exports require an active internet connection to securely fetch the latest data and letterheads.");
      return;
    }

    setIsGenerating(true);
    try {
      const basePayload = {
        generatorName: profile?.name || user?.email || "System Administrator",
        dateRange: `${format(new Date(startDate), 'dd MMM yyyy')} to ${format(new Date(endDate), 'dd MMM yyyy')}`
      };

      if (activeReportId === 'inspection_pack') {
        const packReports = [
          { filenameId: 'Husbandry_Logs', payload: { ...basePayload, title: 'Husbandry Logs', columns: REPORTS.find(r => r.id === 'husbandry')!.columns, data: getTransformedData('husbandry') } },
          { filenameId: 'Feed_Logs', payload: { ...basePayload, title: 'Feed Logs', columns: REPORTS.find(r => r.id === 'weekly_feed')!.columns, data: getTransformedData('weekly_feed') } },
          { filenameId: 'Weight_Logs', payload: { ...basePayload, title: 'Weight Logs', columns: REPORTS.find(r => r.id === 'weekly_weight')!.columns, data: getTransformedData('weekly_weight') } },
          { filenameId: 'Internal_Movements', payload: { ...basePayload, title: 'Internal Movements', columns: REPORTS.find(r => r.id === 'internal_movements')!.columns, data: getTransformedData('internal_movements') } },
          { filenameId: 'External_Transfers', payload: { ...basePayload, title: 'External Transfers', columns: REPORTS.find(r => r.id === 'external_movements')!.columns, data: getTransformedData('external_movements') } },
          { filenameId: 'Census', payload: { ...basePayload, title: 'Site Census', columns: REPORTS.find(r => r.id === 'census')!.columns, data: getTransformedData('census') } },
        ];
        await reportExportService.generateInspectionPackZip(packReports);
      } else {
        await reportExportService.exportSingleReport({
          ...basePayload,
          title: activeReport.title,
          columns: activeReport.columns,
          data: reportData
        }, activeReportId);
      }
    } catch (error) {
      console.error("Export Failed:", error);
      alert("Failed to generate report export.");
    } finally {
      setIsGenerating(false);
    }
  };

  // ------------------------------------------------------------------
  // 4. UNIFIED 3-BLOCK RESPONSIVE LAYOUT
  // ------------------------------------------------------------------
  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-6rem)] md:h-[calc(100vh-64px)] w-full max-w-[1600px] mx-auto animate-in fade-in duration-500">
      
      {/* --- Sidebar / Mobile Scrollable Tabs --- */}
      <div className="w-full md:w-72 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-row md:flex-col shrink-0 overflow-x-auto md:overflow-y-auto custom-scrollbar md:pb-24 z-10 shadow-sm md:shadow-none min-w-0">
        
        <div className="hidden md:block p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-slate-200/60 p-2 rounded-lg border border-slate-200">
              <FileText className="w-5 h-5 text-slate-700" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Compliance</h2>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Statutory Reporting</p>
        </div>

        {/* The Tabs - Built to constrain text size exactly to the box limits */}
        <nav className="flex md:flex-col gap-2 md:gap-1.5 p-2 md:p-4 md:w-full w-max flex-nowrap shrink-0">
          {REPORTS.map((report) => (
            <button
              key={report.id}
              onClick={() => setActiveReportId(report.id)}
              className={`flex items-center justify-between px-3 md:px-4 py-2.5 rounded-xl transition-all duration-200 group border shrink-0 md:w-full min-w-0 ${
                activeReportId === report.id 
                  ? 'bg-slate-900 border-slate-800 text-white shadow-slate-900/20 shadow-sm' 
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 w-full">
                <report.icon size={16} className={`shrink-0 ${activeReportId === report.id ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-left truncate w-full">
                  {report.title}
                </span>
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* --- Main Content Pane --- */}
      <div className="flex-1 flex flex-col min-w-0 p-3 md:p-6 space-y-3 md:space-y-4 relative bg-slate-50">
        
        {!isOnline && (
          <div className="absolute inset-0 z-50 bg-slate-100/60 backdrop-blur-md flex flex-col items-center justify-center m-4 rounded-3xl border border-slate-200/50">
            <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-200 flex flex-col items-center text-center max-w-md animate-in zoom-in-95">
              <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mb-4">
                <WifiOff className="text-rose-600" size={32} />
              </div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Network Disconnected</h2>
              <p className="text-sm font-medium text-slate-500 mb-6">
                Statutory compliance reports must be generated using globally synchronized data. 
                Please reconnect to Wi-Fi to export ZLA documents.
              </p>
            </div>
          </div>
        )}

        {/* --- BLOCK A: THE HEADER RIBBON --- */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-4 shrink-0">
          <div className="shrink-0 pr-4 min-w-0">
             <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 truncate">
               <activeReport.icon className="text-slate-400 shrink-0" size={24} />
               {activeReport.title}
             </h1>
             <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-widest mt-1 truncate">
               {activeReport.description}
             </p>
          </div>
          
          <button
            onClick={handleExport}
            disabled={isGenerating || isLoading || reportData.length === 0 || !isOnline}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 shrink-0 disabled:opacity-50 text-white ${
              activeReportId === 'inspection_pack' 
                ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20 border border-indigo-700' 
                : 'bg-slate-900 hover:bg-slate-800 shadow-slate-900/20 border border-slate-950'
            }`}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin text-white/70" /> : activeReportId === 'inspection_pack' ? <Archive size={16} className="text-indigo-200" /> : <Download size={16} className="text-emerald-400" />}
            <span>{activeReportId === 'inspection_pack' ? 'Compile .ZIP' : 'Export .DOCX'}</span>
          </button>
        </div>

        {/* --- BLOCK B: THE CONTROL DECK --- */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 md:gap-3 w-full bg-white p-2 md:p-3 rounded-2xl border border-slate-200 shadow-sm shrink-0">
          
          {activeReportId !== 'census' && activeReportId !== 'inspection_pack' && (
            <div className="flex gap-2 flex-1 sm:flex-none">
              <div className="flex-1 sm:w-40">
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-inner transition-all" />
              </div>
              <div className="flex-1 sm:w-40">
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-inner transition-all" />
              </div>
            </div>
          )}

          {['husbandry', 'census', 'weekly_feed', 'weekly_weight', 'temperature'].includes(activeReportId) && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Taxonomic Filter</label>
              <div className="relative">
                <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-4 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-inner appearance-none transition-all">
                  <option value="ALL">All Categories</option>
                  <option value="OWL">Owls</option>
                  <option value="RAPTOR">Raptors</option>
                  <option value="MAMMAL">Mammals</option>
                  <option value="EXOTIC">Exotics</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* --- MAIN DATA VIEW (Virtualized CSS Containment Table) --- */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 relative overflow-hidden">
          
          <div className="p-3 md:p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between shrink-0">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <Eye size={14} className="text-emerald-600" /> 
              {activeReportId === 'inspection_pack' ? 'Zip Contents Preview' : 'Data Preview'}
            </h3>
            <span className="text-[10px] font-black text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm tracking-widest uppercase">
              {isLoading ? 'Querying...' : `${reportData.length} Records`}
            </span>
          </div>
          
          <div className="flex-1 overflow-auto custom-scrollbar relative">
            {isLoading ? (
               <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                 <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Processing Matrices...</span>
                 </div>
               </div>
            ) : reportData.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 p-8">
                  <FileText size={48} className="opacity-20 text-slate-300" />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 text-center">No data matches the current filters.</p>
               </div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                <thead className="bg-white sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                  <tr>
                    {activeReport.columns.map((col, i) => (
                      <th key={i} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors group">
                      {row.map((cell: any, j: number) => (
                        <td key={j} className="px-6 py-4 text-xs font-bold text-slate-700 truncate max-w-[250px] group-hover:text-slate-900">
                           {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}