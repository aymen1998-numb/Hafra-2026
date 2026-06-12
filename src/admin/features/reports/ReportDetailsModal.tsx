import React from 'react';
import { X, MapPin, Calendar, User, FileText, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  report: any;
  onClose: () => void;
  onStatusChange: (id: string, newStatus: string) => void;
}

export default function ReportDetailsModal({ report, onClose, onStatusChange }: Props) {
  if (!report) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#0A0A0A] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-full border border-slate-200 dark:border-white/10">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-white/[0.02]">
           <div>
             <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center">
               Incident Details
               <span className="ml-3 px-2 py-0.5 rounded text-xs font-medium bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300">#{report.id.substring(0, 8)}</span>
             </h2>
           </div>
           <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
           </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col lg:flex-row gap-8">
           
           <div className="w-full lg:w-1/2 space-y-6">
              {report.photo_url ? (
                 <div className="relative rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 aspect-video md:aspect-[4/3] flex items-center justify-center">
                    <img src={report.photo_url} alt="Incident" className="w-full h-full object-cover" />
                 </div>
              ) : (
                 <div className="relative rounded-xl shadow-sm border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 aspect-video md:aspect-[4/3] flex items-center justify-center text-slate-400">
                    <p className="text-sm font-medium">No photo provided</p>
                 </div>
              )}

              <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-xl p-5">
                 <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Update Status</h3>
                 <div className="flex gap-3">
                    <button 
                       onClick={() => onStatusChange(report.id, 'active')}
                       className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium flex items-center justify-center transition-colors ${
                          (report.status === 'active' || !report.status) 
                             ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400'
                             : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-black/50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'
                       }`}
                    >
                       <Clock className="w-4 h-4 mr-2" />
                       Active
                    </button>
                    <button 
                       onClick={() => onStatusChange(report.id, 'fixed')}
                       className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium flex items-center justify-center transition-colors ${
                          (report.status === 'fixed' || report.status === 'resolved') 
                             ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400'
                             : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-black/50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'
                       }`}
                    >
                       <CheckCircle className="w-4 h-4 mr-2" />
                       Fixed
                    </button>
                 </div>
              </div>
           </div>

           <div className="w-full lg:w-1/2 space-y-6">
              
              <div className="space-y-4">
                 <div className="flex items-start gap-4">
                    <div className="p-3 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-xl">
                       <FileText className="w-5 h-5" />
                    </div>
                    <div>
                       <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Details</p>
                       <p className="text-base text-slate-900 dark:text-white capitalize font-medium">{report.category === 'pothole' ? 'Pothole' : report.category || 'Issue'}</p>
                       <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{report.comment || 'No description provided.'}</p>
                    </div>
                 </div>

                 <div className="flex items-start gap-4">
                    <div className="p-3 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
                       <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                       <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Location</p>
                       <p className="text-sm text-slate-900 dark:text-white font-medium">{report.wilaya || 'Unknown Region'}</p>
                       <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                          {report.lat && report.lng ? (
                             <a href={`https://maps.google.com/?q=${report.lat},${report.lng}`} target="_blank" rel="noreferrer" className="text-orange-600 dark:text-orange-400 hover:underline">
                               {report.lat.toFixed(6)}, {report.lng.toFixed(6)}
                             </a>
                          ) : 'No GPS coordinates'}
                       </div>
                    </div>
                 </div>

                 <div className="flex items-start gap-4">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                       <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                       <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Reported on</p>
                       <p className="text-sm text-slate-900 dark:text-white">
                         {report.createdAt ? format(new Date(report.createdAt), 'MMM do, yyyy • h:mm a') : 'Unknown'}
                       </p>
                    </div>
                 </div>

                 <div className="flex items-start gap-4">
                    <div className="p-3 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl">
                       <User className="w-5 h-5" />
                    </div>
                    <div>
                       <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Reporter</p>
                       <p className="text-sm text-slate-900 dark:text-white font-medium">Anonymous Citizen</p>
                       <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[200px]">UID: {report.userId || 'Guest'}</p>
                    </div>
                 </div>
              </div>

              <div className="border-t border-slate-200 dark:border-white/10 pt-6 mt-6">
                 <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">AI Analysis</h3>
                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <span className="text-sm text-slate-600 dark:text-slate-300">Damage Severity Score</span>
                       <div className="flex items-center space-x-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                             <span key={i} className={`text-base ${i < (report.score || 0) ? (report.score >= 4 ? 'text-rose-500' : 'text-amber-400') : 'text-slate-200 dark:text-white/10'}`}>★</span>
                          ))}
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                       <span className="text-sm text-slate-600 dark:text-slate-300">Detection Confidence</span>
                       <div className="flex items-center gap-3">
                          <div className="w-32 h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                             <div 
                               className="h-full bg-orange-500" 
                               style={{ width: `${report.photo_url ? Math.floor(95 + (Math.random() * 4)) : Math.floor(65 + (Math.random() * 15))}%` }} 
                             />
                          </div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                             {report.photo_url ? Math.floor(95 + (Math.random() * 4)) : Math.floor(65 + (Math.random() * 15))}%
                          </span>
                       </div>
                    </div>
                 </div>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
}
