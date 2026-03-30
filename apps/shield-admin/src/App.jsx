import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { createClient } from '@supabase/supabase-js';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- 🔑 SUPABASE CONFIGURATION ---
const SUPABASE_URL = "https://jfcogclthfiuomluerhd.supabase.co"; // <-- PASTE YOURS
const SUPABASE_ANON_KEY = "sb_publishable_lm1Rtdff0nrPq8C1QsezLA_1eIUgT8U";           // <-- PASTE YOURS
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const busIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
});

function FollowBus({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, map.getZoom(), { animate: true, duration: 1.5 }); }, [center]);
  return null;
}

export default function App() {
  const [buses, setBuses] = useState({});
  const [fleetList, setFleetList] = useState([]); 
  const [schoolCode, setSchoolCode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputCode, setInputCode] = useState('');
  
  // Forms State
  const [newBusId, setNewBusId] = useState('');
  const [newStudentId, setNewStudentId] = useState('');
  const [assignBusId, setAssignBusId] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (inputCode.trim().length > 0) {
      setSchoolCode(inputCode.trim().toUpperCase());
      setIsAuthenticated(true);
    }
  };

  // --- 1. REGISTER A NEW BUS ---
  const handleRegisterBus = async (e) => {
    e.preventDefault();
    if (!newBusId.trim()) return;
    const formattedBusId = newBusId.trim().toUpperCase();

    const { error } = await supabase
      .from('registered_fleet')
      .insert({ bus_id: formattedBusId, school_code: schoolCode });

    if (error) alert("Error: This Bus ID might already exist!");
    else {
      alert(`✅ ${formattedBusId} registered successfully!`);
      setNewBusId('');
      fetchOfficialFleet(); 
    }
  };

  // --- 2. REGISTER A STUDENT TO A BUS ---
  const handleRegisterStudent = async (e) => {
    e.preventDefault();
    if (!newStudentId.trim() || !assignBusId) {
      return alert("Please enter a Student ID and select a bus!");
    }
    
    const formattedStudent = newStudentId.trim().toUpperCase();

    const { error } = await supabase
      .from('students')
      .insert({ 
        student_id: formattedStudent, 
        school_code: schoolCode, 
        assigned_bus_id: assignBusId 
      });

    if (error) alert("Error: This Student ID might already be registered!");
    else {
      alert(`✅ Student ${formattedStudent} assigned to ${assignBusId}!`);
      setNewStudentId('');
    }
  };

  const fetchOfficialFleet = async () => {
    const { data } = await supabase.from('registered_fleet').select('*').eq('school_code', schoolCode);
    if (data) setFleetList(data);
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    fetchOfficialFleet();

    const loadInitialData = async () => {
      const { data } = await supabase.from('bus_locations').select('*').eq('school_code', schoolCode);
      if (data) {
        const initialMap = {};
        data.forEach(b => initialMap[b.bus_id] = b);
        setBuses(initialMap);
      }
    };
    loadInitialData();

    const subscription = supabase
      .channel('fleet-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_locations', filter: `school_code=eq.${schoolCode}` }, 
      (payload) => {
        setBuses(prev => ({ ...prev, [payload.new.bus_id]: payload.new }));
      }).subscribe();

    return () => supabase.removeChannel(subscription);
  }, [isAuthenticated, schoolCode]);

  const activeBuses = Object.values(buses);
  const activeBusPos = activeBuses.length > 0 ? [activeBuses[0].latitude, activeBuses[0].longitude] : [30.6942, 76.8606];

  // ==========================================
  // UI: LOGIN SCREEN
  // ==========================================
  if (!isAuthenticated) {
    return (
      <div style={styles.loginWrapper}>
        <form onSubmit={handleLogin} style={styles.loginBox}>
          <h2 style={{ margin: '0 0 10px 0', color: '#1a237e' }}>🛡️ ShieldTrack Admin</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>Enter Institute Code to Access your Fleet.</p>
          <input 
            type="text" 
            placeholder="e.g., LPU_PUNJAB" 
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            style={styles.inputField}
          />
          <button type="submit" style={styles.loginButton}>Enter Dashboard</button>
        </form>
      </div>
    );
  }

  // ==========================================
  // UI: MAIN DASHBOARD
  // ==========================================
  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.header}>
          <h1 style={styles.title}>ShieldTrack</h1>
          <p style={styles.subtitle}>Institute: {schoolCode}</p>
        </div>

        {/* --- 1. BUS REGISTRATION FORM --- */}
        <div style={styles.registrationBox}>
          <h3 style={styles.formTitle}>➕ Register New Vehicle</h3>
          <form onSubmit={handleRegisterBus} style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" placeholder="e.g. BUS-01" value={newBusId}
              onChange={(e) => setNewBusId(e.target.value)} style={styles.smallInput}
            />
            <button type="submit" style={styles.addBtn}>Add</button>
          </form>
        </div>

        {/* --- 2. STUDENT REGISTRATION FORM --- */}
        <div style={{ ...styles.registrationBox, backgroundColor: '#f3e5f5', borderBottom: '1px solid #e1bee7' }}>
          <h3 style={styles.formTitle}>👨‍🎓 Assign Student to Bus</h3>
          <form onSubmit={handleRegisterStudent} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input 
              type="text" placeholder="Student ID (e.g. STU-001)" value={newStudentId}
              onChange={(e) => setNewStudentId(e.target.value)} style={styles.smallInput}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <select 
                value={assignBusId} onChange={(e) => setAssignBusId(e.target.value)} 
                style={{ ...styles.smallInput, flex: 1, backgroundColor: '#fff' }}
              >
                <option value="">Select a Bus...</option>
                {fleetList.map(bus => (
                  <option key={bus.bus_id} value={bus.bus_id}>{bus.bus_id}</option>
                ))}
              </select>
              <button type="submit" style={{ ...styles.addBtn, background: '#9c27b0', color: '#fff' }}>Assign</button>
            </div>
          </form>
        </div>

        <div style={styles.statsContainer}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>Official Registered Fleet: {fleetList.length} Buses</p>
          <p style={{ margin: 0, color: '#00C853', fontWeight: 'bold' }}>Currently Online: {activeBuses.length}</p>
        </div>

        <div style={styles.busList}>
          {activeBuses.map(bus => (
            <div key={bus.bus_id} style={{ ...styles.busCard, borderLeftColor: bus.status === 'EMERGENCY' ? '#ff5252' : '#00e676' }}>
              <div style={styles.cardTop}>
                <span style={styles.busId}>{bus.bus_id}</span>
                <span style={{ ...styles.statusBadge, backgroundColor: bus.status === 'EMERGENCY' ? '#ffebee' : '#e8f5e9', color: bus.status === 'EMERGENCY' ? '#c62828' : '#2e7d32' }}>{bus.status}</span>
              </div>
              <p style={styles.cardDetail}>💨 Speed: <b>{bus.speed} km/h</b></p>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.mapView}>
        <MapContainer center={activeBusPos} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {activeBuses.map(bus => (
            <Marker key={bus.bus_id} position={[bus.latitude, bus.longitude]} icon={busIcon}>
              <Popup><b>{bus.bus_id}</b><br/>Speed: {bus.speed} km/h</Popup>
            </Marker>
          ))}
          <FollowBus center={activeBusPos} />
        </MapContainer>
      </div>
    </div>
  );
}

const styles = {
  loginWrapper: { display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5' },
  loginBox: { background: 'white', padding: '40px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '350px' },
  
  // FIXED: Added backgroundColor: '#fff' so the black text is visible!
  inputField: { padding: '12px', width: '100%', marginBottom: '20px', border: '2px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', color: '#333', backgroundColor: '#fff' },
  
  loginButton: { padding: '14px 20px', background: '#1a237e', color: 'white', border: 'none', width: '100%', cursor: 'pointer', borderRadius: '8px', fontWeight: 'bold' },
  container: { display: 'flex', height: '100vh', width: '100vw', margin: 0, backgroundColor: '#f5f7fa' },
  sidebar: { width: '380px', backgroundColor: '#fff', color: '#333', boxShadow: '4px 0 15px rgba(0,0,0,0.05)', zIndex: 10, display: 'flex', flexDirection: 'column' },
  header: { padding: '30px 25px', backgroundColor: '#1a237e', color: 'white' },
  title: { margin: 0, fontSize: '28px', fontWeight: '800' },
  subtitle: { margin: 0, opacity: 0.9, fontSize: '14px', marginTop: '5px' },
  registrationBox: { padding: '20px', backgroundColor: '#e8eaf6', borderBottom: '1px solid #c5cae9', color: '#333' },
  formTitle: { margin: '0 0 10px 0', fontSize: '15px', color: '#1a237e' },
  
  // FIXED: Added backgroundColor: '#fff' here too!
  smallInput: { flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ccc', color: '#333', backgroundColor: '#fff' },
  
  addBtn: { padding: '8px 15px', background: '#00e676', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  statsContainer: { padding: '15px 20px', borderBottom: '1px solid #eee', fontSize: '14px', color: '#333' },
  busList: { padding: '20px', flex: 1, overflowY: 'auto' },
  busCard: { backgroundColor: '#fff', padding: '15px', borderRadius: '12px', marginBottom: '15px', borderLeftWidth: '6px', borderLeftStyle: 'solid', border: '1px solid #f0f0f0' },
  cardTop: { display: 'flex', justifyContent: 'space-between', marginBottom: '10px' },
  busId: { fontSize: '18px', fontWeight: '900', color: '#000' },
  statusBadge: { padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' },
  cardDetail: { margin: '4px 0', fontSize: '14px', color: '#555' },
  mapView: { flex: 1 },
};