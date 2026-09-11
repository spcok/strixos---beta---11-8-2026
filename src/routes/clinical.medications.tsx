import React, { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Pill, Activity, WifiOff, FileText } from 'lucide-react';

import DigitalMAR from '../components/medical/DigitalMAR';
import PrescriptionList from '../components/medical/PrescriptionList';
import PrescriptionFormModal from '../components/medical/PrescriptionFormModal';
import MedicationHistory from '../components/medical/MedicationHistory';
import { marExportService } from '../services/marExportService';

export const Route = createFileRoute('/clinical/medications')({
  component: MedicationsModule,
});

function MedicationsModule() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'DIGITAL_MAR' | 'PRESCRIPTIONS' | 'HISTORY'>('DIGITAL_MAR');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<any>(null);

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

  useEffect(() => {
    const channel = supabase
      .channel('medication_administrations_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'medication_administrations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['medication_administrations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // FIX: Added date_of_birth and status to the fetch query for the DOCX Age/Quarantine checks
  const { data: prescriptions = [], isLoading: loadingRx } = useQuery({
    queryKey: ['prescriptions', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prescriptions')
        .select('*, animals(id, name, species, location, gender, flying_weight, weight_unit, special_requirements, date_of_birth, status)')
        .eq('status', 'ACTIVE')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    networkMode: 'offlineFirst',
  });

  const handleOpenNewOrder = () => {
    setEditingPrescription(null);
    setIsPrescriptionModalOpen(true);
  };

  const handleEditOrder = (rx: any) => {
    setEditingPrescription(rx);
    setIsPrescriptionModalOpen(true);
  };

  const handlePrintUnifiedMar = async (rx: any, setLoading: (b: boolean) => void) => {
    setLoading(true);
    try {
      const patientPrescriptions = prescriptions.filter(p => p.animal_id === rx.animal_id);
      await marExportService.exportUnifiedMAR(
        rx.animals, 
        patientPrescriptions, 
        profile?.name || 'Staff', 
        user?.id || 'Unknown-ID'
      );
    } catch (error) {
      console.error(error);
      alert("Failed to generate DOCX MAR chart. Ensure you are online to fetch the logo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      {!isOnline && (
        <div className="bg-rose-600 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3">
            <WifiOff size={20} />
            <div>
              <p className="font-black uppercase tracking-widest text-xs">Clinical Network Disconnected</p>
              <p className="text-sm font-medium text-rose-100">Medication administration is locked to prevent double-dosing. Please reconnect to WiFi.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Clinical Dispensary</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">Prescription Management & Digital MAR</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleOpenNewOrder} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-700 shadow-[0_0_15px_rgba(37,99,235,0.2)] transition-all">
            <Pill size={14} /> Provision Order
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-px overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('DIGITAL_MAR')} className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'DIGITAL_MAR' ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'}`}>
          <Activity size={16} /> Today's MAR
        </button>
        <button onClick={() => setActiveTab('PRESCRIPTIONS')} className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'PRESCRIPTIONS' ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'}`}>
          <Pill size={16} /> Active Orders
        </button>
        <button onClick={() => setActiveTab('HISTORY')} className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'HISTORY' ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'}`}>
          <FileText size={16} /> Medication History
        </button>
      </div>

      <div className="animate-in fade-in duration-300">
        {activeTab === 'DIGITAL_MAR' && <DigitalMAR prescriptions={prescriptions} isOnline={isOnline} />}
        {activeTab === 'PRESCRIPTIONS' && <PrescriptionList prescriptions={prescriptions} onEditOrder={handleEditOrder} onPrintMar={handlePrintUnifiedMar} />}
        {activeTab === 'HISTORY' && <MedicationHistory />}
      </div>

      {isPrescriptionModalOpen && (
        <PrescriptionFormModal isOpen={isPrescriptionModalOpen} onClose={() => setIsPrescriptionModalOpen(false)} initialData={editingPrescription} />
      )}
    </div>
  );
}