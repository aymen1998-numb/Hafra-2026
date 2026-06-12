import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import { collection, query, getDocs, limit, addDoc, deleteDoc, doc } from 'firebase/firestore';
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

function MapClickEvents({ onMapClick }: { onMapClick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    }
  });
  return null;
}

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
  const [roads, setRoads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [roadName, setRoadName] = useState('');
  const [roadQuality, setRoadQuality] = useState('bad');

  useEffect(() => {
    async function fetchMapData() {
      try {
        const qReports = query(collection(db, 'reports'), limit(500));
        const snapReports = await getDocs(qReports);
        setReports(snapReports.docs.map(d => ({ id: d.id, ...d.data() })));

        const qRoads = query(collection(db, 'roads'));
        const snapRoads = await getDocs(qRoads);
        setRoads(snapRoads.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Map data fetch error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchMapData();
  }, []);

  const handleMapClick = (latlng: L.LatLng) => {
    if (!isDrawing) return;
    setDrawnPoints(prev => [...prev, [latlng.lat, latlng.lng]]);
  };

  const handleSaveRoad = async () => {
    if (!roadName.trim()) {
      alert("Please enter a road name.");
      return;
    }
    if (drawnPoints.length < 2) {
      alert("Please click at least 2 points on the map to define the road.");
      return;
    }
    try {
      const payload = {
        name: roadName,
        quality: roadQuality,
        coordinates: drawnPoints,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'roads'), payload);
      setRoads(prev => [...prev, { id: docRef.id, ...payload }]);
      
      // Reset drawing state
      setIsDrawing(false);
      setDrawnPoints([]);
      setRoadName('');
      setRoadQuality('bad');
    } catch (err) {
      console.error("Save road error:", err);
      alert("Failed to save the road.");
    }
  };

  const handleDeleteRoad = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this road? It will be removed for all users.")) return;
    try {
      await deleteDoc(doc(db, 'roads', id));
      setRoads(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error("Delete road error:", err);
      alert("Failed to delete the road.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden relative">
      <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-[#0A0E17]/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg max-w-sm w-80">
         <h2 className="font-bold text-slate-900 dark:text-white flex items-center">
            <Layers className="w-5 h-5 mr-2 text-orange-500" />
            Live Incident & Quality Map
         </h2>
         <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Real-time tracking of hazard reports and custom admin-defined road infrastructure networks.</p>
         
         <div className="mt-3 flex flex-wrap gap-2.5 text-xs font-semibold border-b border-slate-100 dark:border-white/5 pb-3">
            <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 mr-1.5 ring-2 ring-white dark:ring-[#111111]"></span> Critical</div>
            <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-1.5 ring-2 ring-white dark:ring-[#111111]"></span> Active</div>
            <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5 ring-2 ring-white dark:ring-[#111111]"></span> Resolved</div>
         </div>

         <div className="mt-3 flex flex-wrap gap-2.5 text-xs font-semibold border-b border-slate-100 dark:border-white/5 pb-3">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider w-full mb-1">Road Quality</div>
            <div className="flex items-center"><span className="w-4 h-1 bg-emerald-500 rounded mr-1.5"></span> Good</div>
            <div className="flex items-center"><span className="w-4 h-1 bg-orange-500 rounded mr-1.5"></span> Fair</div>
            <div className="flex items-center"><span className="w-4 h-1 bg-rose-500 rounded mr-1.5"></span> Bad</div>
         </div>

         <div className="mt-3 flex flex-col gap-2">
            {!isDrawing ? (
              <button 
                onClick={() => setIsDrawing(true)}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-orange-500/10 cursor-pointer hover:scale-[1.02]"
              >
                🛠️ Draw Damaged Road
              </button>
            ) : (
              <div className="flex flex-col gap-2 bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/10">
                <span className="text-xs font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">📍 Click on map to add points</span>
                <input 
                  type="text" 
                  value={roadName}
                  onChange={(e) => setRoadName(e.target.value)}
                  placeholder="Road Name (e.g. RN 1)" 
                  className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-orange-500 text-slate-800 dark:text-white"
                />
                <select 
                  value={roadQuality}
                  onChange={(e) => setRoadQuality(e.target.value)}
                  className="w-full bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-orange-500 text-slate-800 dark:text-white"
                >
                  <option value="bad">🔴 Bad / Damaged (Red)</option>
                  <option value="average">🟡 Fair / Moderate (Orange)</option>
                  <option value="good">🟢 Good / Repaired (Green)</option>
                </select>
                
                <div className="text-[10px] text-slate-500 dark:text-slate-400 flex justify-between">
                  <span>Nodes placed: <span className="font-bold">{drawnPoints.length}</span></span>
                  {drawnPoints.length > 0 && (
                    <button 
                      onClick={() => setDrawnPoints(prev => prev.slice(0, -1))}
                      className="text-[9px] text-orange-600 hover:text-orange-700 font-bold"
                    >
                      Undo Last
                    </button>
                  )}
                </div>
                
                <div className="flex gap-2 mt-1">
                  <button 
                    onClick={() => {
                      setIsDrawing(false);
                      setDrawnPoints([]);
                      setRoadName('');
                    }}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white font-semibold py-1.5 px-2 rounded-lg text-[10px] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveRoad}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-1.5 px-2 rounded-lg text-[10px] transition-colors cursor-pointer"
                  >
                    💾 Save Road
                  </button>
                </div>
              </div>
            )}
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
          <MapClickEvents onMapClick={handleMapClick} />

          {/* Render incidents */}
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

          {/* Render existing admin drawn roads */}
          {roads.map((road) => {
            if (!road.coordinates || !road.coordinates.length) return null;
            let color = '#10b981'; // green good
            if (road.quality === 'average' || road.quality === 'fair') color = '#f97316'; // orange
            else if (road.quality === 'bad') color = '#f43f5e'; // rose/red

            // Transform coordinates to L.LatLngExpression[]
            const positions = road.coordinates.map((pt: any) => [pt[0], pt[1]]);

            return (
              <Polyline 
                key={road.id} 
                positions={positions} 
                pathOptions={{ color: color, weight: 6 }}
              >
                <Popup className="premium-popup">
                  <div className="p-1 min-w-[150px]">
                    <strong className="block text-sm text-slate-900 border-b pb-1 mb-1">{road.name || 'Unnamed Road'}</strong>
                    <span className="text-xs text-slate-600 block mb-2">Quality: <span className="font-bold capitalize">{road.quality}</span></span>
                    <button 
                      onClick={() => handleDeleteRoad(road.id)} 
                      className="text-xs bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-2.5 rounded transition-colors w-full cursor-pointer"
                    >
                      Delete Road
                    </button>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

          {/* Render active temporary drawing polyline */}
          {isDrawing && drawnPoints.length > 1 && (
            <Polyline positions={drawnPoints} pathOptions={{ color: '#FF5722', weight: 4, dashArray: '5, 5' }} />
          )}
          {isDrawing && drawnPoints.map((pt, idx) => (
            <Marker 
              key={`draw-node-${idx}`} 
              position={pt} 
              icon={L.divIcon({
                className: 'draw-node-icon',
                html: `<div style="background-color: #FF5722; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
                iconSize: [10, 10],
                iconAnchor: [5, 5]
              })}
            />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
