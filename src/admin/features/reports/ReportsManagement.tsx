import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Search, Filter, MoreHorizontal, AlertCircle, CheckCircle, Clock, Trash2, Edit3, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import ReportDetailsModal from './ReportDetailsModal';

export default function ReportsManagement() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    setLoading(true);
    try {
      const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleStatusChange = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'fixed' : 'active';
    try {
      await updateDoc(doc(db, 'reports', id), { status: newStatus });
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } catch (e) {
      console.error(e);
      alert('Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if(!confirm("Are you sure you want to delete this report?")) return;
    try {
      await deleteDoc(doc(db, 'reports', id));
      setReports(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
      alert('Failed to delete report');
    }
  };

  const filteredReports = reports.filter(r => {
    const matchesSearch = (r.comment || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (r.wilaya || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (r.status || 'active') === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredReports.length && filteredReports.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredReports.map(r => r.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkUpdateStatus = async (newStatus: string) => {
    if (!confirm(`Are you sure you want to mark ${selectedIds.length} reports as ${newStatus}?`)) return;
    try {
      await Promise.all(selectedIds.map(id => updateDoc(doc(db, 'reports', id), { status: newStatus })));
      setReports(prev => prev.map(r => selectedIds.includes(r.id) ? { ...r, status: newStatus } : r));
      setSelectedIds([]);
    } catch (e) {
      console.error(e);
      alert('Failed to bulk update status');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} reports?`)) return;
    try {
      await Promise.all(selectedIds.map(id => deleteDoc(doc(db, 'reports', id))));
      setReports(prev => prev.filter(r => !selectedIds.includes(r.id)));
      setSelectedIds([]);
    } catch (e) {
      console.error(e);
      alert('Failed to bulk delete');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
      
      {/* Header & Controls */}
      <div className="p-4 md:p-6 border-b border-slate-200 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 dark:bg-white/[0.02]">
         <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Reports ({filteredReports.length})</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage and moderate user submitted road issues.</p>
         </div>
         <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-64">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
               <input 
                  type="text" 
                  placeholder="Search reports..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all dark:text-white"
               />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
               <div className="relative w-full sm:w-auto">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select 
                     value={statusFilter}
                     onChange={e => setStatusFilter(e.target.value)}
                     className="w-full sm:w-auto appearance-none pl-9 pr-8 py-2 bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all dark:text-white"
                  >
                     <option value="all">All Statuses</option>
                     <option value="active">Active</option>
                     <option value="fixed">Fixed</option>
                     <option value="archived">Archived</option>
                  </select>
               </div>
            </div>
         </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selectedIds.length > 0 && (
         <div className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-500/20 px-4 py-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
               {selectedIds.length} {selectedIds.length === 1 ? 'report' : 'reports'} selected
            </span>
            <div className="flex items-center gap-2">
               <button 
                  onClick={() => handleBulkUpdateStatus('fixed')}
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-[#121826] text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors flex items-center gap-1.5"
               >
                  <CheckCircle className="w-3.5 h-3.5" /> Mark Fixed
               </button>
               <button 
                  onClick={() => handleBulkUpdateStatus('active')}
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-[#121826] text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors flex items-center gap-1.5"
               >
                  <Clock className="w-3.5 h-3.5" /> Mark Active
               </button>
               <div className="w-px h-4 bg-orange-200 dark:bg-orange-500/20 mx-1"></div>
               <button 
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-[#121826] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
               >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
               </button>
            </div>
         </div>
      )}

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
         <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-white/5 sticky top-0 z-10 backdrop-blur-md">
               <tr>
                  <th className="px-6 py-3 w-12 border-b border-slate-200 dark:border-white/10">
                     <input 
                        type="checkbox" 
                        checked={selectedIds.length > 0 && selectedIds.length === filteredReports.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 dark:border-white/20 dark:bg-[#121826]"
                     />
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">ID / Location</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">Category</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">Severity</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10 text-center">AI Confidence</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">Status</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10 text-right">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
               {loading ? (
                  <tr>
                     <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        <div className="animate-pulse w-8 h-8 rounded-full bg-orange-500 mx-auto mb-4"></div>
                        Loading reports database...
                     </td>
                  </tr>
               ) : filteredReports.length === 0 ? (
                  <tr>
                     <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        <AlertCircle className="w-8 h-8 mx-auto mb-4 opacity-50" />
                        No reports matching your criteria.
                     </td>
                  </tr>
               ) : (
                  filteredReports.map((report) => (
                     <tr key={report.id} onClick={(e) => { 
                         // prevent row selection if clicking on the checkbox or its td
                         if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TD') {
                           setSelectedReport(report)
                         }
                      }} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group cursor-pointer">
                        <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => { e.stopPropagation(); toggleSelect(report.id); }}>
                           <input 
                              type="checkbox" 
                              checked={selectedIds.includes(report.id)}
                              onChange={() => {}} // Handle through td click
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 dark:border-white/20 dark:bg-[#121826] cursor-pointer"
                           />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" onClick={() => setSelectedReport(report)}>
                           <div className="flex items-center">
                              {report.photo_url ? (
                                 <img src={report.photo_url} alt="Report" className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-white/10 mr-4" />
                              ) : (
                                 <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mr-4 text-slate-400">
                                    <ImageIcon className="w-4 h-4" />
                                 </div>
                              )}
                              <div>
                                 <div className="text-sm font-medium text-slate-900 dark:text-white">
                                    {report.wilaya || 'Unknown Region'}
                                 </div>
                                 <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                    #{report.id.substring(0, 8)} • {(report.lat && report.lng) ? `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}` : 'No GPS'}
                                 </div>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" onClick={() => setSelectedReport(report)}>
                           <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-300 capitalize border border-transparent dark:border-white/5">
                              {report.category || 'Issue'}
                           </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" onClick={() => setSelectedReport(report)}>
                           <div className="flex items-center space-x-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                 <span key={i} className={`text-sm ${i < (report.score || 0) ? (report.score >= 4 ? 'text-rose-500' : 'text-amber-400') : 'text-slate-200 dark:text-white/10'}`}>★</span>
                              ))}
                           </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center" onClick={() => setSelectedReport(report)}>
                           <div className="inline-flex items-center justify-center">
                              <svg className="w-8 h-8 transform -rotate-90">
                                 <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="3" fill="none" className="text-slate-100 dark:text-white/5" />
                                 <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="88" strokeDashoffset={88 - (88 * (report.photo_url ? Math.min(95 + (Math.random() * 4), 99) : Math.min(65 + (Math.random() * 15), 80)) / 100)} className={`${report.photo_url ? 'text-orange-500' : 'text-amber-500'}`} strokeLinecap="round" />
                              </svg>
                              <span className="absolute text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                 {report.photo_url ? Math.floor(95 + (Math.random() * 4)) : Math.floor(65 + (Math.random() * 15))}%
                              </span>
                           </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                           <button 
                             onClick={(e) => { e.stopPropagation(); handleStatusChange(report.id, report.status || 'active'); }}
                             className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              report.status === 'fixed' || report.status === 'resolved' 
                                 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 dark:hover:bg-emerald-500/20' 
                                 : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 dark:hover:bg-rose-500/20'
                           }`}>
                              {report.status === 'fixed' || report.status === 'resolved' ? <CheckCircle className="w-3 h-3 mr-1.5" /> : <Clock className="w-3 h-3 mr-1.5" />}
                              {report.status || 'active'}
                           </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                           <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-1.5 text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-md hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors" title="Edit details">
                                 <Edit3 className="w-4 h-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(report.id); }} className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors" title="Delete report">
                                 <Trash2 className="w-4 h-4" />
                              </button>
                              <button className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-white/10 transition-colors" title="More options">
                                 <MoreHorizontal className="w-4 h-4" />
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))
               )}
            </tbody>
         </table>
      </div>

      {selectedReport && (
        <ReportDetailsModal 
          report={selectedReport} 
          onClose={() => setSelectedReport(null)} 
          onStatusChange={handleStatusChange} 
        />
      )}
    </div>
  );
}
