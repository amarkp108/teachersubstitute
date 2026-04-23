import { useState, useCallback } from "react";
import * as XLSX from "xlsx";

// Ye dono ab Excel se automatically build honge — hardcoded nahi hain
function buildLectureMetaFromData(rows) {
  const lectureMap = {}; // { "Lect 1": "08:40 - 09:20", ... }
  rows.forEach((r) => {
    const name = r["Lecture Name"];
    const timing = (r["Lecture Timing"] || "").trim();
    if (name && !lectureMap[name]) lectureMap[name] = timing;
  });
  // Sort by lecture number extracted from name
  const order = Object.keys(lectureMap).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, "")) || 0;
    const numB = parseInt(b.replace(/\D/g, "")) || 0;
    return numA - numB;
  });
  return { lectureOrder: order, lectureTimings: lectureMap };
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export default function App() {
  const [timetableData, setTimetableData] = useState([]);
  const [allTeachers, setAllTeachers] = useState([]);
  const [absentTeachers, setAbsentTeachers] = useState([]);
  const [substituteMap, setSubstituteMap] = useState(null);
  const [lectureOrder, setLectureOrder] = useState([]);
  const [lectureTimings, setLectureTimings] = useState({});
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [step, setStep] = useState(1); // 1=upload, 2=select absent, 3=result

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    try {
      const rows = await parseExcel(file);
      setTimetableData(rows);
      const teachers = [
        ...new Set(rows.map((r) => r["EmployeeName"]).filter(Boolean)),
      ].sort();
      setAllTeachers(teachers);
      setAbsentTeachers([]);
      setSubstituteMap(null);
      const { lectureOrder: lo, lectureTimings: lt } =
        buildLectureMetaFromData(rows);
      setLectureOrder(lo);
      setLectureTimings(lt);
      setStep(2);
    } catch (err) {
      alert("File padhne mein error: " + err.message);
    }
    setLoading(false);
  }, []);

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      const fakeEvent = { target: { files: [file] } };
      handleFileUpload(fakeEvent);
    },
    [handleFileUpload],
  );

  const toggleAbsent = (teacher) => {
    setAbsentTeachers((prev) =>
      prev.includes(teacher)
        ? prev.filter((t) => t !== teacher)
        : [...prev, teacher],
    );
  };

  const findSubstitutes = () => {
    if (absentTeachers.length === 0) return;

    // Build busy map: teacher -> Set of lectures they are teaching
    const busyMap = {};
    timetableData.forEach((row) => {
      const t = row["EmployeeName"];
      const lect = row["Lecture Name"];
      if (t && lect) {
        if (!busyMap[t]) busyMap[t] = new Set();
        busyMap[t].add(lect);
      }
    });

    const result = {};

    absentTeachers.forEach((absentTeacher) => {
      // Get their scheduled lectures
      const absentLectures = timetableData.filter(
        (r) => r["EmployeeName"] === absentTeacher,
      );

      result[absentTeacher] = absentLectures.map((row) => {
        const lectName = row["Lecture Name"];
        const classInfo = `${row["Class"]} ${row["Section"] || ""} - ${row["Subject Name"]}`;

        // Find available teachers for this lecture
        const availableTeachers = allTeachers.filter((t) => {
          if (t === absentTeacher) return false;
          if (absentTeachers.includes(t)) return false; // also absent
          const busy = busyMap[t] || new Set();
          return !busy.has(lectName);
        });

        return {
          lecture: lectName,
          timing: lectureTimings[lectName] || row["Lecture Timing"],
          class: classInfo,
          section: row["Section"],
          subject: row["Subject Name"],
          availableTeachers,
        };
      });
    });

    setSubstituteMap(result);
    setStep(3);
  };

  const filteredTeachers = allTeachers.filter(
    (t) =>
      t.toLowerCase().includes(searchInput.toLowerCase()) &&
      !absentTeachers.includes(t),
  );

  const resetAll = () => {
    setTimetableData([]);
    setAllTeachers([]);
    setAbsentTeachers([]);
    setSubstituteMap(null);
    setLectureOrder([]);
    setLectureTimings({});
    setFileName("");
    setSearchInput("");
    setStep(1);
  };

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>📋</span>
            <div>
              <div style={styles.logoTitle}>Substitute Finder</div>
              <div style={styles.logoSub}>Teacher Absence Manager</div>
            </div>
          </div>
          {step > 1 && (
            <button onClick={resetAll} style={styles.resetBtn}>
              New Upload
            </button>
          )}
        </div>
      </header>

      <main style={styles.main}>
        {/* Step Indicator */}
        <div style={styles.steps}>
          {["Excel Upload", "Select Absent", "Substitutes Dekho"].map(
            (s, i) => (
              <div key={i} style={styles.stepItem}>
                <div
                  style={{
                    ...styles.stepCircle,
                    ...(step > i
                      ? styles.stepDone
                      : step === i + 1
                        ? styles.stepActive
                        : {}),
                  }}
                >
                  {step > i + 1 ? "✓" : i + 1}
                </div>
                <span
                  style={{
                    ...styles.stepLabel,
                    ...(step === i + 1 ? styles.stepLabelActive : {}),
                  }}
                >
                  {s}
                </span>
                {i < 2 && (
                  <div
                    style={{
                      ...styles.stepLine,
                      ...(step > i + 1 ? styles.stepLineDone : {}),
                    }}
                  />
                )}
              </div>
            ),
          )}
        </div>

        {/* STEP 1: Upload */}
        {step === 1 && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>📂 Timetable Excel Upload</h2>
            <p style={styles.cardSub}>Upload Excel File Here</p>
            <div
              style={styles.dropZone}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById("fileInput").click()}
            >
              {loading ? (
                <div style={styles.loadingBox}>
                  <div style={styles.spinner} />
                  <p style={{ color: "#6366f1", marginTop: 12 }}>
                    File padh raha hun...
                  </p>
                </div>
              ) : (
                <>
                  <div style={styles.uploadIcon}>📊</div>
                  <p style={styles.uploadText}>Drop Here</p>
                  <p style={styles.uploadHint}>.xlsx format supported</p>
                  <button style={styles.uploadBtn}>Choose File</button>
                </>
              )}
            </div>
            <input
              id="fileInput"
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
          </div>
        )}

        {/* STEP 2: Select Absent Teachers */}
        {step === 2 && (
          <div style={styles.card}>
            <div style={styles.fileTag}>
              ✅ {fileName} — {timetableData.length} records,{" "}
              {allTeachers.length} teachers
            </div>
            <h2 style={styles.cardTitle}> Select Absent Teacher</h2>

            {/* Search */}
            <div style={styles.searchBox}>
              <span style={styles.searchIcon}>🔍</span>
              <input
                style={styles.searchInput}
                placeholder="Teacher ka naam search karo..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
              />
            </div>

            {/* Dropdown */}
            {dropdownOpen && filteredTeachers.length > 0 && (
              <div style={styles.dropdown}>
                {filteredTeachers.slice(0, 10).map((t) => (
                  <div
                    key={t}
                    style={styles.dropItem}
                    onClick={() => {
                      toggleAbsent(t);
                      setSearchInput("");
                      setDropdownOpen(false);
                    }}
                  >
                    <span>👤 {t}</span>
                    <span style={styles.addTag}>+ Add</span>
                  </div>
                ))}
              </div>
            )}

            {/* Selected Absent */}
            {absentTeachers.length > 0 && (
              <div style={styles.absentBox}>
                <div style={styles.absentLabel}>❌ Absent Teachers:</div>
                <div style={styles.tagRow}>
                  {absentTeachers.map((t) => (
                    <div key={t} style={styles.tag}>
                      {t}
                      <span
                        style={styles.tagRemove}
                        onClick={() => toggleAbsent(t)}
                      >
                        ✕
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              style={{
                ...styles.findBtn,
                ...(absentTeachers.length === 0 ? styles.findBtnDisabled : {}),
              }}
              onClick={findSubstitutes}
              disabled={absentTeachers.length === 0}
            >
              🔎 Substitutes Dhundo
            </button>
          </div>
        )}

        {/* STEP 3: Results */}
        {step === 3 && substituteMap && (
          <div>
            <div style={styles.resultHeader}>
              <h2 style={styles.cardTitle}>✅ Substitute Teachers</h2>
              <button style={styles.backBtn} onClick={() => setStep(2)}>
                ← Back
              </button>
            </div>

            {absentTeachers.map((absent) => (
              <div key={absent} style={styles.absentCard}>
                <div style={styles.absentName}>
                  <span style={styles.absentBadge}>ABSENT</span>
                  {absent}
                </div>

                {substituteMap[absent]?.length === 0 ? (
                  <p style={{ color: "#9ca3af", padding: "16px" }}>
                    Is teacher ka koi lecture nahi hai aaj.
                  </p>
                ) : (
                  <div style={styles.lectureGrid}>
                    {lectureOrder.map((lectName) => {
                      const lectData = substituteMap[absent]?.find(
                        (l) => l.lecture === lectName,
                      );
                      if (!lectData) return null;
                      return (
                        <div key={lectName} style={styles.lectureCard}>
                          <div style={styles.lectureTop}>
                            <div style={styles.lectureName}>
                              {lectData.lecture}
                            </div>
                            <div style={styles.lectureTiming}>
                              ⏰ {lectData.timing}
                            </div>
                          </div>
                          <div style={styles.lectureClass}>
                            📚 {lectData.class}
                          </div>

                          <div style={styles.subLabel}>
                            Free Teachers ({lectData.availableTeachers.length}):
                          </div>
                          {lectData.availableTeachers.length === 0 ? (
                            <div style={styles.noSub}>
                              ⚠️ Koi free teacher nahi is period mein
                            </div>
                          ) : (
                            <div style={styles.subList}>
                              {lectData.availableTeachers.map((t, i) => (
                                <div
                                  key={t}
                                  style={{
                                    ...styles.subTeacher,
                                    animationDelay: `${i * 50}ms`,
                                  }}
                                >
                                  <span style={styles.subAvatar}>{t[0]}</span>
                                  <span>{t}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f0f1a; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .lect-card { animation: fadeIn 0.3s ease forwards; }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)",
    fontFamily: "'Nunito', sans-serif",
    color: "#e2e8f0",
  },
  header: {
    background: "rgba(255,255,255,0.03)",
    borderBottom: "1px solid rgba(99,102,241,0.2)",
    padding: "16px 24px",
    backdropFilter: "blur(10px)",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { display: "flex", alignItems: "center", gap: 12 },
  logoIcon: { fontSize: 32 },
  logoTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#a5b4fc",
    letterSpacing: "-0.5px",
  },
  logoSub: {
    fontSize: 11,
    color: "#64748b",
    fontFamily: "'Space Mono', monospace",
  },
  resetBtn: {
    background: "rgba(99,102,241,0.15)",
    border: "1px solid rgba(99,102,241,0.4)",
    color: "#a5b4fc",
    padding: "8px 16px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  main: { maxWidth: 900, margin: "0 auto", padding: "32px 20px" },

  // Steps
  steps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
    gap: 0,
  },
  stepItem: { display: "flex", alignItems: "center", gap: 8 },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    background: "rgba(255,255,255,0.05)",
    color: "#64748b",
    border: "2px solid rgba(255,255,255,0.1)",
  },
  stepActive: {
    background: "rgba(99,102,241,0.2)",
    color: "#a5b4fc",
    border: "2px solid #6366f1",
  },
  stepDone: {
    background: "#6366f1",
    color: "#fff",
    border: "2px solid #6366f1",
  },
  stepLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  stepLabelActive: { color: "#a5b4fc" },
  stepLine: {
    width: 40,
    height: 2,
    background: "rgba(255,255,255,0.08)",
    margin: "0 4px",
  },
  stepLineDone: { background: "#6366f1" },

  // Card
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 32,
    backdropFilter: "blur(10px)",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: "#e2e8f0",
    marginBottom: 6,
  },
  cardSub: { fontSize: 14, color: "#64748b", marginBottom: 24 },
  fileTag: {
    display: "inline-block",
    background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.3)",
    color: "#4ade80",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 12,
    marginBottom: 20,
    fontWeight: 600,
  },

  // Drop Zone
  dropZone: {
    border: "2px dashed rgba(99,102,241,0.4)",
    borderRadius: 16,
    padding: "48px 24px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    background: "rgba(99,102,241,0.03)",
  },
  uploadIcon: { fontSize: 56, marginBottom: 16 },
  uploadText: {
    fontSize: 18,
    fontWeight: 700,
    color: "#a5b4fc",
    marginBottom: 6,
  },
  uploadHint: { fontSize: 13, color: "#64748b", marginBottom: 20 },
  uploadBtn: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    border: "none",
    padding: "12px 28px",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  },
  loadingBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "3px solid rgba(99,102,241,0.2)",
    borderTop: "3px solid #6366f1",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },

  // Search
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "10px 16px",
    marginBottom: 4,
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    background: "none",
    border: "none",
    outline: "none",
    color: "#e2e8f0",
    fontSize: 15,
    flex: 1,
    fontFamily: "'Nunito', sans-serif",
  },
  dropdown: {
    background: "#1e1e3f",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  dropItem: {
    padding: "12px 16px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 14,
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    transition: "background 0.15s",
  },
  addTag: { fontSize: 11, color: "#6366f1", fontWeight: 700 },

  // Absent tags
  absentBox: {
    background: "rgba(239,68,68,0.07)",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 20,
  },
  absentLabel: {
    fontSize: 12,
    color: "#f87171",
    fontWeight: 700,
    marginBottom: 10,
  },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  tag: {
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#fca5a5",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  tagRemove: {
    cursor: "pointer",
    color: "#ef4444",
    fontWeight: 700,
    fontSize: 14,
  },

  // Find Button
  findBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 800,
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    letterSpacing: "0.5px",
  },
  findBtnDisabled: { opacity: 0.4, cursor: "not-allowed" },

  // Results
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  backBtn: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#94a3b8",
    padding: "8px 16px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  absentCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: 16,
    marginBottom: 24,
    overflow: "hidden",
  },
  absentName: {
    background: "rgba(239,68,68,0.1)",
    borderBottom: "1px solid rgba(239,68,68,0.15)",
    padding: "16px 20px",
    fontSize: 18,
    fontWeight: 800,
    color: "#fca5a5",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  absentBadge: {
    background: "#ef4444",
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
    padding: "3px 8px",
    borderRadius: 4,
    letterSpacing: "1px",
  },
  lectureGrid: {
    padding: 20,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
  },
  lectureCard: {
    background: "rgba(99,102,241,0.06)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 12,
    padding: 16,
    animation: "fadeIn 0.3s ease forwards",
  },
  lectureTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  lectureName: { fontSize: 15, fontWeight: 800, color: "#a5b4fc" },
  lectureTiming: {
    fontSize: 11,
    color: "#64748b",
    fontFamily: "'Space Mono', monospace",
  },
  lectureClass: { fontSize: 13, color: "#94a3b8", marginBottom: 12 },
  subLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: 700,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  noSub: {
    fontSize: 12,
    color: "#f87171",
    background: "rgba(239,68,68,0.1)",
    borderRadius: 6,
    padding: "8px 10px",
  },
  subList: { display: "flex", flexDirection: "column", gap: 6 },
  subTeacher: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#86efac",
    animation: "fadeIn 0.3s ease forwards",
  },
  subAvatar: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "rgba(34,197,94,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 800,
    color: "#4ade80",
    flexShrink: 0,
  },
};
