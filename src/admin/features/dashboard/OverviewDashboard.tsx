import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../firebase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, CheckCircle, Clock, ShieldAlert, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function OverviewDashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, fixed: 0, critical: 0 });
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        let total = docs.length;
        let active = 0;
        let fixed = 0;
        let critical = 0;
        
        const dateMap: Record<string, number> = {};

        docs.forEach(doc => {
          if (doc.status === 'fixed' || doc.status === 'resolved') fixed++;
          else active++;
          
          if (doc.score >= 4 || doc.severity === 'high') critical++;

          // For chart
          if (doc.createdAt) {
             const dateStr = typeof doc.createdAt === 'string' ? doc.createdAt.split('T')[0] : new Date(doc.createdAt).toISOString().split('T')[0];
             dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;
          }
        });

        const sortedDates = Object.keys(dateMap).sort();
        const cData = sortedDates.map(d => ({
           name: d,
           reports: dateMap[d]
        }));

        setStats({ total, active, fixed, critical });
        setRecentReports(docs.slice(0, 5));
        setChartData(cData);
      } catch (error) {
        console.error("Error fetching overview:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return <div className="h-full flex items-center justify-center"><div className="animate-pulse w-8 h-8 rounded-full bg-orange-500"></div></div>;
  }

  const kpis = [
    { name: 'Total Reports', value: stats.total, icon: AlertTriangle, trend: '+12%', isUp: true, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10' },
    { name: 'Active Issues', value: stats.active, icon: Clock, trend: '-2%', isUp: false, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10' },
    { name: 'Resolved', value: stats.fixed, icon: CheckCircle, trend: '+18%', isUp: true, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { name: 'Critical Hazards', value: stats.critical, icon: ShieldAlert, trend: '+5%', isUp: true, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
         <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Overview</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Here's what's happening today on Hafra.DZ</p>
         </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
         {kpis.map((kpi, idx) => (
           <div key={idx} className="bg-white dark:bg-[#121826] rounded-2xl border border-slate-200 dark:border-white/5 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                 <div className={`p-2 rounded-xl ${kpi.bg}`}>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                 </div>
              </div>
              <div className="mt-2">
                 <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{kpi.name}</p>
                 <div className="flex items-baseline mt-2 space-x-2">
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{kpi.value.toLocaleString()}</h2>
                    <span className={`flex items-center text-xs font-semibold ${kpi.isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                       {kpi.isUp ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                       {kpi.trend}
                    </span>
                 </div>
              </div>
           </div>
         ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
         {/* Main Chart */}
          <div className="xl:col-span-2 bg-white dark:bg-[#121826] rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm p-6">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-6">Reports Intake (Last 30 Days)</h3>
            <div className="h-72 w-full">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorReports" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" strokeOpacity={0.2} />
                    <XAxis 
                       dataKey="name" 
                       axisLine={false} 
                       tickLine={false} 
                       tick={{ fill: '#64748b', fontSize: 12 }} 
                       tickFormatter={(val) => {
                          try { return format(parseISO(val), 'MMM d'); } catch { return val; } 
                       }} 
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip 
                       contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(10,14,23,0.95)', backdropFilter: 'blur(10px)', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }} 
                       itemStyle={{ color: '#e2e8f0' }}
                    />
                    <Area type="monotone" dataKey="reports" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorReports)" />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>

         {/* Recent Reports List */}
         <div className="bg-white dark:bg-[#121826] rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-base font-semibold text-slate-900 dark:text-white">Recent Reports</h3>
               <button className="text-sm text-orange-600 dark:text-orange-400 font-medium hover:underline">View All</button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
               {recentReports.map(report => (
                  <div key={report.id} className="flex items-center space-x-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border border-transparent dark:hover:border-white/5">
                     <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className={`w-5 h-5 ${report.score >= 4 ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}`} />
                     </div>
                     <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                           {report.category === 'pothole' ? 'Pothole' : report.category || 'Issue'} reported
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{report.wilaya || 'Unknown Location'}</p>
                     </div>
                     <div className="text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                           report.status === 'fixed' || report.status === 'resolved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400' :
                           report.status === 'active' || !report.status ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400' :
                           'bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-300'
                        }`}>
                           {report.status || 'active'}
                        </span>
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
}
