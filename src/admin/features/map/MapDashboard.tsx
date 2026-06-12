import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '../../../firebase';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Maximize2, Layers } from 'lucide-react';

// Fix Leaflet blank marker issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const createCustomIcon = (score: number, status: string) => {
  let color = '#3b82f6'; // default blue
  if (status === 'fixed' || status === 'resolved') color = '#10b981'; // emerald
  else if (score >= 4) color = '#f43f5e'; // rose

  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        background-color: ${color};
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10]
  });
};


export default function MapDashboard() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMapData() {
      try {
        const q = query(collection(db, 'reports'), limit(500));
        const snap = await getDocs(q);
        setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Map data fetch error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchMapData();
  }, []);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden relative">
      <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-black/80 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-white/10 shadow-lg max-w-sm">
         <h2 className="font-bold text-slate-900 dark:text-white flex items-center">
            <Layers className="w-5 h-5 mr-2 text-orange-500" />
            Live Incident Map
         </h2>
         <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Real-time geospatial tracking of all active hazard reports across the national infrastructure network.</p>
         <div className="mt-4 flex gap-3 text-xs font-medium">
            <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 mr-1.5 ring-2 ring-white dark:ring-[#111111]"></span> Critical</div>
            <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-1.5 ring-2 ring-white dark:ring-[#111111]"></span> Active</div>
            <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5 ring-2 ring-white dark:ring-[#111111]"></span> Resolved</div>
         </div>
      </div>

      <div className="absolute top-4 right-4 z-[1000] flex gap-2">
         <button className="bg-white dark:bg-black/90 p-2 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
            <Maximize2 className="w-5 h-5" />
         </button>
      </div>

      <div className="flex-1 w-full h-full bg-slate-100 dark:bg-slate-900 z-0">
        <MapContainer 
          center={[36.7538, 3.0588]} // Algiers coordinates
          zoom={6} 
          style={{ height: '100%', width: '100%', zIndex: 0 }}
          className="admin-map-container"
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {reports.map((report) => {
            if (!report.lat || !report.lng) return null;
            return (
              <Marker 
                key={report.id} 
                position={[report.lat, report.lng]}
                icon={createCustomIcon(report.score || 0, report.status || 'active')}
              >
                <Popup className="premium-popup">
                   <div className="p-1 min-w-[200px]">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-orange-500 mb-1 block">#{report.id.substring(0,8)}</span>
                      <strong className="block text-sm text-slate-900 border-b pb-2 mb-2">{report.category === 'pothole' ? 'Pothole' : report.category || 'Issue'}</strong>
                      {report.photo_url && (
                         <img src={report.photo_url} alt="Issue" className="w-full h-24 object-cover rounded-md mb-2 bg-slate-100" />
                      )}
                      <p className="text-xs text-slate-600 line-clamp-3">{report.comment || 'No description provided.'}</p>
                      <div className="mt-3 text-right">
                         <a href={`/admin#/reports?id=${report.id}`} className="text-xs font-semibold text-orange-600 hover:text-orange-700">View Details &rarr;</a>
                      </div>
                   </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
