import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap, ZoomControl } from 'react-leaflet';
import { collection, query, getDocs, limit, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Maximize2, Minimize2, Layers, Search, Trash2, Scissors, MapPin, Plus, X, Save, Edit3, Undo2 } from 'lucide-react';

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

// Binds the Leaflet Map instance to React state
function MapRefBinder({ setMap }: { setMap: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    if (map) {
      setMap(map);
    }
  }, [map, setMap]);
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

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Panel View tabs: 'incidents' | 'roads'
  const [activeTab, setActiveTab] = useState<'incidents' | 'roads'>('incidents');
  const [roadSearch, setRoadSearch] = useState('');

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [roadName, setRoadName] = useState('');
  const [roadQuality, setRoadQuality] = useState('bad');

  // Editing state
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuality, setEditQuality] = useState('bad');
  const [editCoordinates, setEditCoordinates] = useState<[number, number][]>([]);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [isAppendingNode, setIsAppendingNode] = useState(false);

  // Map instance reference for centering
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  useEffect(() => {
    async function fetchMapData() {
      try {
        const qReports = query(collection(db, 'reports'), limit(500));
        const snapReports = await getDocs(qReports);
        setReports(snapReports.docs.map(d => ({ id: d.id, ...d.data() })));

        const qRoads = query(collection(db, 'roads'));
        const snapRoads = await getDocs(qRoads);
        setRoads(snapRoads.docs.map(d => {
          const data = d.data();
          const coords = (data.coordinates || []).map((pt: any) => [pt.lat, pt.lng]);
          return { id: d.id, ...data, coordinates: coords };
        }));
      } catch (error) {
        console.error("Map data fetch error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchMapData();
  }, []);

  // Handle Map size recalculation on fullscreen toggling
  useEffect(() => {
    const handleResize = () => {
      window.dispatchEvent(new Event('resize'));
      if (mapInstance) {
        mapInstance.invalidateSize();
      }
    };
    const timer = setTimeout(handleResize, 150);
    return () => clearTimeout(timer);
  }, [isFullscreen, mapInstance]);

  const handleMapClick = (latlng: L.LatLng) => {
    if (isDrawing) {
      setDrawnPoints(prev => [...prev, [latlng.lat, latlng.lng]]);
    } else if (selectedRoadId && isAppendingNode) {
      setEditCoordinates(prev => [...prev, [latlng.lat, latlng.lng]]);
    }
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
      const payloadCoordinates = drawnPoints.map(pt => ({ lat: pt[0], lng: pt[1] }));
      const payload = {
        name: roadName,
        quality: roadQuality,
        coordinates: payloadCoordinates,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'roads'), payload);
      setRoads(prev => [...prev, { id: docRef.id, ...payload, coordinates: drawnPoints }]);
      
      // Reset drawing state
      setIsDrawing(false);
      setDrawnPoints([]);
      setRoadName('');
      setRoadQuality('bad');
      setActiveTab('roads'); // Shift to road list tab on complete
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
      if (selectedRoadId === id) {
        setSelectedRoadId(null);
        setSelectedNodeIndex(null);
        setIsAppendingNode(false);
      }
    } catch (err) {
      console.error("Delete road error:", err);
      alert("Failed to delete the road.");
    }
  };

  const handleFocusRoad = (road: any) => {
    if (!mapInstance || !road.coordinates || !road.coordinates.length) return;
    const firstPt = road.coordinates[0];
    mapInstance.setView([firstPt[0], firstPt[1]], 14, { animate: true });
  };

  const handleSelectRoad = (road: any) => {
    setSelectedRoadId(road.id);
    setEditName(road.name || '');
    setEditQuality(road.quality || 'bad');
    setEditCoordinates(road.coordinates || []);
    setSelectedNodeIndex(null);
    setIsAppendingNode(false);
    
    if (mapInstance && road.coordinates && road.coordinates.length) {
      const firstPt = road.coordinates[0];
      mapInstance.setView([firstPt[0], firstPt[1]], 14, { animate: true });
    }
  };

  const handleSaveEdits = async () => {
    if (!selectedRoadId) return;
    if (!editName.trim()) {
      alert("Please enter a road name.");
      return;
    }
    if (editCoordinates.length < 2) {
      alert("Road must have at least 2 nodes.");
      return;
    }
    try {
      const roadRef = doc(db, 'roads', selectedRoadId);
      const payloadCoordinates = editCoordinates.map(pt => ({ lat: pt[0], lng: pt[1] }));
      await updateDoc(roadRef, {
        name: editName,
        quality: editQuality,
        coordinates: payloadCoordinates
      });
      
      setRoads(prev => prev.map(r => r.id === selectedRoadId ? { ...r, name: editName, quality: editQuality, coordinates: editCoordinates } : r));
      
      setSelectedRoadId(null);
      setSelectedNodeIndex(null);
      setIsAppendingNode(false);
      alert("Road modifications saved successfully!");
    } catch (err) {
      console.error("Save edits error:", err);
      alert("Failed to save road updates.");
    }
  };

  const handleMoveNode = (idx: number, lat: number, lng: number) => {
    setEditCoordinates(prev => {
      const copy = [...prev];
      copy[idx] = [lat, lng];
      return copy;
    });
  };

  const handleDeleteNode = (idx: number) => {
    if (editCoordinates.length <= 2) {
      alert("A road must have at least 2 nodes. If you want to remove the entire road, use the 'Delete Road' button.");
      return;
    }
    const newCoords = editCoordinates.filter((_, i) => i !== idx);
    setEditCoordinates(newCoords);
    setSelectedNodeIndex(null);
  };

  const handleSplitRoad = async (idx: number) => {
    if (idx <= 0 || idx >= editCoordinates.length - 1) {
      alert("Cannot split at the starting or ending node.");
      return;
    }
    if (!window.confirm(`Are you sure you want to split this road into two sections at node #${idx + 1}?`)) return;

    try {
      const part1Coords = editCoordinates.slice(0, idx + 1);
      const part2Coords = editCoordinates.slice(idx);

      const part1PayloadCoords = part1Coords.map(pt => ({ lat: pt[0], lng: pt[1] }));
      const part2PayloadCoords = part2Coords.map(pt => ({ lat: pt[0], lng: pt[1] }));

      const payload1 = {
        name: `${editName} (Part A)`,
        quality: editQuality,
        coordinates: part1PayloadCoords,
        createdAt: new Date().toISOString()
      };

      const payload2 = {
        name: `${editName} (Part B)`,
        quality: editQuality,
        coordinates: part2PayloadCoords,
        createdAt: new Date().toISOString()
      };

      // Delete original
      await deleteDoc(doc(db, 'roads', selectedRoadId!));

      // Save two new parts
      const docRef1 = await addDoc(collection(db, 'roads'), payload1);
      const docRef2 = await addDoc(collection(db, 'roads'), payload2);

      // Refresh roads local list
      setRoads(prev => {
        const filtered = prev.filter(r => r.id !== selectedRoadId);
        return [
          ...filtered,
          { id: docRef1.id, ...payload1, coordinates: part1Coords },
          { id: docRef2.id, ...payload2, coordinates: part2Coords }
        ];
      });

      setSelectedRoadId(null);
      setSelectedNodeIndex(null);
      setIsAppendingNode(false);
      alert("Road successfully split in two sections!");
    } catch (err) {
      console.error("Split road error:", err);
      alert("Failed to split road.");
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-[#111111] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden relative transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-[9999] rounded-none border-none w-screen h-screen' : ''}`}>
      
      {/* Sidebar Control Panel overlay */}
      <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-[#0A0E17]/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg max-w-sm w-80 max-h-[calc(100%-2rem)] flex flex-col overflow-y-auto custom-scrollbar">
         {selectedRoadId === null ? (
           <>
             {/* Tab selector header */}
             <div className="flex border-b border-slate-200 dark:border-white/10 mb-3 select-none">
               <button
                 onClick={() => {
                   setActiveTab('incidents');
                   setIsDrawing(false);
                 }}
                 className={`flex-1 pb-2 text-xs font-bold transition-colors border-b-2 outline-none ${activeTab === 'incidents' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
               >
                 📌 Incidents & Legend
               </button>
               <button
                 onClick={() => setActiveTab('roads')}
                 className={`flex-1 pb-2 text-xs font-bold transition-colors border-b-2 outline-none ${activeTab === 'roads' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
               >
                 🛣️ Manage Roads ({roads.length})
               </button>
             </div>

             {activeTab === 'incidents' ? (
               <div className="flex flex-col gap-2">
                 <h2 className="font-bold text-slate-900 dark:text-white flex items-center">
                    <Layers className="w-5 h-5 mr-2 text-orange-500" />
                    Incident Map Overview
                 </h2>
                 <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Real-time visualization of citizen reports and current street networks.</p>
                 
                 <div className="mt-3 flex flex-wrap gap-2.5 text-xs font-semibold border-b border-slate-100 dark:border-white/5 pb-3">
                    <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 mr-1.5 ring-2 ring-white dark:ring-[#111111]"></span> Critical</div>
                    <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-1.5 ring-2 ring-white dark:ring-[#111111]"></span> Active</div>
                    <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5 ring-2 ring-white dark:ring-[#111111]"></span> Resolved</div>
                 </div>

                 <div className="mt-3 flex flex-wrap gap-2.5 text-xs font-semibold">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider w-full mb-1">Road Quality Legend</div>
                    <div className="flex items-center"><span className="w-4 h-1 bg-emerald-500 rounded mr-1.5"></span> Good</div>
                    <div className="flex items-center"><span className="w-4 h-1 bg-orange-500 rounded mr-1.5"></span> Fair</div>
                    <div className="flex items-center"><span className="w-4 h-1 bg-rose-500 rounded mr-1.5"></span> Bad</div>
                 </div>
               </div>
             ) : (
               <div className="flex flex-col gap-2 flex-1 min-h-0">
                 {/* Roads Actions */}
                 {!isDrawing ? (
                   <button 
                     onClick={() => setIsDrawing(true)}
                     className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-orange-500/10 cursor-pointer hover:scale-[1.02] mb-1.5"
                   >
                     <Plus className="w-4 h-4" /> Draw New Road
                   </button>
                 ) : (
                   <div className="flex flex-col gap-2 bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/10 mb-2">
                     <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">📍 Click on map to add nodes</span>
                     <input 
                       type="text" 
                       value={roadName}
                       onChange={(e) => setRoadName(e.target.value)}
                       placeholder="Road Name (e.g. N1, RN 5)" 
                       className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-orange-500 text-slate-800 dark:text-white"
                     />
                     <div className="flex gap-1.5 mt-0.5">
                        <button
                          type="button"
                          onClick={() => setRoadQuality('bad')}
                          className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${roadQuality === 'bad' ? 'bg-red-500/20 border-red-500 text-red-600 dark:text-red-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'}`}
                        >
                          🔴 Bad
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoadQuality('average')}
                          className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${roadQuality === 'average' ? 'bg-orange-500/20 border-orange-500 text-orange-600 dark:text-orange-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'}`}
                        >
                          🟡 Fair
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoadQuality('good')}
                          className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${roadQuality === 'good' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'}`}
                        >
                          🟢 Good
                        </button>
                      </div>
                     
                     <div className="text-[10px] text-slate-500 dark:text-slate-400 flex justify-between">
                       <span>Placed nodes: <span className="font-bold">{drawnPoints.length}</span></span>
                       {drawnPoints.length > 0 && (
                         <button 
                           onClick={() => setDrawnPoints(prev => prev.slice(0, -1))}
                           className="text-[9px] text-orange-600 hover:text-orange-700 font-bold flex items-center gap-0.5"
                         >
                           <Undo2 className="w-3 h-3" /> Undo Last
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

                 {/* Road list search */}
                 <div className="relative mb-2">
                   <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                   <input
                     type="text"
                     value={roadSearch}
                     onChange={(e) => setRoadSearch(e.target.value)}
                     placeholder="Search roads by name..."
                     className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs outline-none focus:border-orange-500 text-slate-800 dark:text-white"
                   />
                 </div>

                 {/* Scrollable Road List */}
                 <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 flex-1 max-h-[200px]">
                   {roads.filter(r => (r.name || '').toLowerCase().includes(roadSearch.toLowerCase())).length === 0 ? (
                     <div className="text-[11px] text-slate-400 text-center py-4">No roads match search.</div>
                   ) : (
                     roads.filter(r => (r.name || '').toLowerCase().includes(roadSearch.toLowerCase())).map(road => {
                       let badgeCol = 'bg-rose-500';
                       if (road.quality === 'good') badgeCol = 'bg-emerald-500';
                       else if (road.quality === 'average' || road.quality === 'fair') badgeCol = 'bg-orange-500';

                       return (
                         <div 
                           key={road.id} 
                           className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20 transition-all text-[11px]"
                         >
                           <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                             <span className={`w-2 h-2 rounded-full ${badgeCol} flex-shrink-0`} />
                             <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{road.name || 'Unnamed Road'}</span>
                           </div>
                           <div className="flex items-center gap-1 flex-shrink-0">
                             <button
                               onClick={() => handleFocusRoad(road)}
                               title="Focus on map"
                               className="p-1 rounded bg-white dark:bg-black/30 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 cursor-pointer"
                             >
                               <MapPin className="w-3 h-3" />
                             </button>
                             <button
                               onClick={() => handleSelectRoad(road)}
                               title="Edit path and split"
                               className="p-1 rounded bg-white dark:bg-black/30 hover:bg-slate-100 dark:hover:bg-white/10 text-orange-600 dark:text-orange-400 border border-slate-200 dark:border-white/10 cursor-pointer"
                             >
                               <Edit3 className="w-3 h-3" />
                             </button>
                             <button
                               onClick={() => handleDeleteRoad(road.id)}
                               title="Delete Road"
                               className="p-1 rounded bg-white dark:bg-black/30 hover:bg-red-500 hover:text-white dark:hover:bg-red-950 text-rose-500 border border-slate-200 dark:border-white/10 cursor-pointer"
                             >
                               <Trash2 className="w-3 h-3" />
                             </button>
                           </div>
                         </div>
                       );
                     })
                   )}
                 </div>
               </div>
             )}
           </>
         ) : (
           /* Edit Mode Dashboard Panel */
           <div className="flex flex-col gap-3">
             <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
               <h3 className="font-bold text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1.5 select-none">
                 <Edit3 className="w-4 h-4" /> Edit Road Segment
               </h3>
               <button 
                 onClick={() => {
                   setSelectedRoadId(null);
                   setSelectedNodeIndex(null);
                   setIsAppendingNode(false);
                 }}
                 className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 cursor-pointer"
               >
                 <X className="w-4 h-4" />
               </button>
             </div>

             <div className="flex flex-col gap-2.5">
               <div className="flex flex-col gap-1">
                 <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Road Name</label>
                 <input
                   type="text"
                   value={editName}
                   onChange={(e) => setEditName(e.target.value)}
                   className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-orange-500 text-slate-800 dark:text-white font-semibold"
                 />
               </div>

               <div className="flex flex-col gap-1">
                 <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Condition Quality</label>
                 <div className="flex gap-1.5 mt-0.5">
                    <button
                      type="button"
                      onClick={() => setEditQuality('bad')}
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${editQuality === 'bad' ? 'bg-red-500/20 border-red-500 text-red-600 dark:text-red-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'}`}
                    >
                      🔴 Bad
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQuality('average')}
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${editQuality === 'average' ? 'bg-orange-500/20 border-orange-500 text-orange-600 dark:text-orange-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'}`}
                    >
                      🟡 Fair
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQuality('good')}
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${editQuality === 'good' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'}`}
                    >
                      🟢 Good
                    </button>
                  </div>
               </div>

               <div className="border-t border-slate-100 dark:border-white/5 pt-2 flex flex-col">
                 <div className="flex items-center justify-between mb-1.5">
                   <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Road Vertices ({editCoordinates.length})</span>
                   <button
                     onClick={() => setIsAppendingNode(!isAppendingNode)}
                     className={`text-[9px] font-bold px-2 py-0.5 rounded transition-all cursor-pointer ${isAppendingNode ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                   >
                     {isAppendingNode ? '📍 Appending...' : '➕ Append Node'}
                   </button>
                 </div>
                 <p className="text-[10px] text-slate-400 mb-2">Drag points on the map to modify the route. Click any node to split or delete it.</p>

                 {selectedNodeIndex !== null ? (
                   <div className="bg-orange-500/5 dark:bg-[#F97316]/5 border border-orange-500/20 p-2 rounded-xl flex flex-col gap-2">
                     <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Selected Vertex #{selectedNodeIndex + 1}</span>
                     <div className="flex gap-2">
                       <button
                         onClick={() => handleSplitRoad(selectedNodeIndex)}
                         disabled={selectedNodeIndex === 0 || selectedNodeIndex === editCoordinates.length - 1}
                         className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 border transition-colors cursor-pointer ${selectedNodeIndex === 0 || selectedNodeIndex === editCoordinates.length - 1 ? 'border-slate-200 dark:border-white/5 text-slate-400 cursor-not-allowed bg-slate-50 dark:bg-transparent' : 'bg-orange-600 border-orange-600 hover:bg-orange-700 text-white'}`}
                         title="Split this road segment in two independent roads at this node"
                       >
                         <Scissors className="w-3 h-3" /> Split Road
                       </button>
                       <button
                         onClick={() => handleDeleteNode(selectedNodeIndex)}
                         className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-1 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                       >
                         <Trash2 className="w-3 h-3" /> Delete Node
                       </button>
                     </div>
                   </div>
                 ) : (
                   <div className="text-[10px] text-slate-400 text-center py-2.5 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                     Click any node marker on the map to show split and delete controls.
                   </div>
                 )}
               </div>

               <div className="flex gap-2 border-t border-slate-100 dark:border-white/5 pt-3 mt-1">
                 <button 
                   onClick={() => {
                     setSelectedRoadId(null);
                     setSelectedNodeIndex(null);
                     setIsAppendingNode(false);
                   }}
                   className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white font-semibold py-2 px-3 rounded-xl text-xs transition-colors cursor-pointer text-center"
                 >
                   Discard
                 </button>
                 <button 
                   onClick={handleSaveEdits}
                   className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                 >
                   <Save className="w-3.5 h-3.5" /> Save Edits
                 </button>
               </div>
             </div>
           </div>
         )}
      </div>

      {/* Fullscreen Expansion Trigger Button */}
      <div className="absolute top-4 right-4 z-[1000] flex gap-2">
         <button 
           onClick={() => setIsFullscreen(!isFullscreen)}
           className="bg-white dark:bg-black/90 p-2 rounded-lg border border-slate-200 dark:border-white/10 shadow-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors cursor-pointer hover:scale-105"
           title={isFullscreen ? "Minimize Map" : "Maximize Map"}
         >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
         </button>
      </div>

      {/* Leaflet Map Container */}
      <div className="flex-1 w-full h-full bg-slate-100 dark:bg-slate-900 z-0">
        <MapContainer 
          center={[36.7538, 3.0588]} // Algiers coordinates
          zoom={6} 
          zoomControl={false}
          style={{ height: '100%', width: '100%', zIndex: 0 }}
          className="admin-map-container"
        >
          {/* Zoom controls custom positioned away from left sidebar */}
          <ZoomControl position="bottomright" />
          
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          
          <MapClickEvents onMapClick={handleMapClick} />
          <MapRefBinder setMap={setMapInstance} />

          {/* Render reports/incidents */}
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
            
            // Skip the road currently being edited, we render it separately with draggable nodes
            if (road.id === selectedRoadId) return null;

            let color = '#10b981'; // green good
            if (road.quality === 'average' || road.quality === 'fair') color = '#f97316'; // orange
            else if (road.quality === 'bad') color = '#f43f5e'; // rose/red

            // Transform coordinates to L.LatLngExpression[]
            const positions = road.coordinates.map((pt: any) => [pt[0], pt[1]]);

            return (
              <Polyline 
                key={road.id} 
                positions={positions} 
                pathOptions={{ color: color, weight: 6, opacity: 0.8 }}
                eventHandlers={{
                  click: () => {
                    handleSelectRoad(road);
                  },
                  mouseover: (e) => {
                    e.target.setStyle({ weight: 9, opacity: 1.0 });
                  },
                  mouseout: (e) => {
                    e.target.setStyle({ weight: 6, opacity: 0.8 });
                  }
                }}
              />
            );
          })}

          {/* Render the selected road in Edit Mode with interactive nodes */}
          {selectedRoadId && editCoordinates.length > 0 && (
            <>
              {/* Highlight line with selection styles */}
              <Polyline 
                positions={editCoordinates} 
                pathOptions={{ color: '#2563EB', weight: 8, dashArray: '5, 10' }} 
              />
              {/* Interactive draggable nodes */}
              {editCoordinates.map((pt, idx) => {
                const isSelectedNode = selectedNodeIndex === idx;
                return (
                  <Marker 
                    key={`edit-node-${idx}-${pt[0]}-${pt[1]}`} 
                    position={[pt[0], pt[1]]}
                    draggable={true}
                    eventHandlers={{
                      dragend: (e: any) => {
                        const newLatLng = e.target.getLatLng();
                        handleMoveNode(idx, newLatLng.lat, newLatLng.lng);
                      },
                      click: () => {
                        setSelectedNodeIndex(idx);
                      }
                    }}
                    icon={L.divIcon({
                      className: 'edit-node-icon',
                      html: `
                        <div style="
                          background-color: ${isSelectedNode ? '#F97316' : '#2563EB'};
                          width: ${isSelectedNode ? '13px' : '10px'};
                          height: ${isSelectedNode ? '13px' : '10px'};
                          border-radius: 50%;
                          border: 2.5px solid white;
                          box-shadow: 0 2px 6px rgba(0,0,0,0.45);
                          transition: all 0.15s ease-out;
                        "></div>
                      `,
                      iconSize: isSelectedNode ? [13, 13] : [10, 10],
                      iconAnchor: isSelectedNode ? [6.5, 6.5] : [5, 5]
                    })}
                  />
                );
              })}
            </>
          )}

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
