// Inisialisasi Supabase Client Resmi
const SUPABASE_URL = "https://zosmmbiknzbbrhohtleb.supabase.co";
const SUPABASE_KEY = "sb_publishable_fuDxW0QqDrxRT4cKY0b92A_xHeKs8uj";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let sessionId = null, myName = "", realtimeChannel = null;
let quizData = [], currentQ = 0, myScore = 0;

// --- FUNGSI NAVIGASI & UTILITAS ---
function show(id) {
    ["home", "teacher", "room", "student", "waiting", "gameScreen", "resultScreen"].forEach(x => {
        const el = document.getElementById(x);
        if (el) el.classList.add("hidden");
    });
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
}

function code() {
    return "LGT-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function showTeacher() { show("teacher"); }
function showStudent() { show("student"); }

// --- LOGIKA GURU ---
async function createSession() {
    const tName = document.getElementById("teacherName").value.trim();
    const title = document.getElementById("sessionTitle").value.trim();
    
    if (!tName || !title) return alert("Nama guru dan sesi harus diisi!");

    try {
        const { data, error } = await sb.from('sessions').insert({ 
            code: code(), 
            title: title, 
            status: 'waiting' 
        }).select();

        if (error) throw error;
        
        sessionId = data[0].id;
        document.getElementById("code").textContent = data[0].code;
        document.getElementById("roomTitle").textContent = title;
        document.getElementById("roomTeacher").textContent = tName;
        show("room");

        // REALTIME LOBI (Cek siswa yang masuk)
        realtimeChannel = sb.channel('lobby')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'students', filter: `session_id=eq.${sessionId}` }, payload => {
                let countEl = document.getElementById("studentCount");
                countEl.textContent = parseInt(countEl.textContent || 0) + 1;
                document.getElementById("studentList").innerHTML += `<div class="student"><span>✅ ${payload.new.name}</span></div>`;
            }).subscribe();
            
    } catch (err) {
        console.error("Error Create Session:", err);
        alert("Gagal membuat sesi! Cek F12 (Console) untuk detailnya.");
    }
}

async function startSession() {
    try {
        const { error } = await sb.from('sessions').update({ status: 'playing' }).eq('id', sessionId);
        if (error) throw error;
        alert("Sesi dimulai! Siswa otomatis masuk ke soal.");
    } catch (err) {
        console.error("Error Start Session:", err);
        alert("Gagal memulai permainan!");
    }
}

// --- LOGIKA SISWA ---
async function joinSession() {
    const c = document.getElementById("joinCode").value.toUpperCase().trim();
    myName = document.getElementById("studentName").value.trim();
    
    if (!c || !myName) return alert("Kode dan nama lengkap harus diisi!");

    try {
        const { data: s, error: findErr } = await sb.from('sessions').select('*').eq('code', c).single();
        
        if (findErr || !s) return alert("Kode sesi tidak ditemukan!");
        if (s.status !== 'waiting') return alert("Sesi sudah dimulai atau telah berakhir!");
        
        sessionId = s.id;
        const { error: insertErr } = await sb.from('students').insert({ session_id: sessionId, name: myName });
        if (insertErr) throw insertErr;
        
        document.getElementById("waitName").textContent = myName;
        show("waiting");

        // REALTIME TUNGGU GAME DIMULAI
        realtimeChannel = sb.channel('wait_game')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, payload => {
                if (payload.new.status === 'playing') loadGame();
            }).subscribe();
            
    } catch (err) {
        console.error("Error Join Session:", err);
        alert("Gagal bergabung!");
    }
}

// --- LOGIKA KUIS (GAMEPLAY) ---
async function loadGame() {
    try {
        const { data, error } = await sb.from('kosakata').select('*');
        if (error) throw error;
        
        if (!data || data.length === 0) {
            return alert("Bank soal kosong! Belum ada data di tabel 'kosakata' Supabase.");
        }

        // Acak urutan soal dari Supabase, ambil maksimal 10
        quizData = data.sort(() => 0.5 - Math.random()).slice(0, 10);
        currentQ = 0; 
        myScore = 0;
        
        show("gameScreen");
        renderQuestion();
    } catch (err) {
        console.error("Error Load Game:", err);
        alert("Gagal memuat soal kuis!");
    }
}

function renderQuestion() {
    if (currentQ >= quizData.length) return finishGame();
    
    let q = quizData[currentQ];
    document.getElementById("qCount").textContent = `${currentQ + 1}/${quizData.length}`;
    document.getElementById("soalTeks").textContent = q.ar;
    
    // Buat opsi jawaban (1 jawaban benar dari database, sisanya diambil dari daftar kata dummy)
    let opsiDummy = ["Meja", "Kursi", "Pintu", "Jendela", "Buku", "Pena", "Tas", "Papan Tulis"].filter(x => x !== q.arti);
    opsiDummy = opsiDummy.sort(() => 0.5 - Math.random()).slice(0, 3); // Ambil 3 pengecoh acak
    
    // Gabung dan acak agar posisi jawaban benar tidak ketebak
    let opsis = [q.arti, ...opsiDummy].sort(() => 0.5 - Math.random()); 
    
    document.getElementById("opsiJawaban").innerHTML = opsis.map(opsi => 
        `<button class="blue" onclick="checkAnswer('${opsi}', '${q.arti}')">${opsi}</button>`
    ).join("");
}

function checkAnswer(jawaban, benar) {
    if (jawaban === benar) {
        myScore += 10;
    }
    document.getElementById("score").textContent = myScore;
    currentQ++;
    renderQuestion();
}

async function finishGame() {
    show("resultScreen");
    document.getElementById("finalScore").textContent = myScore;
    
    try {
        // Simpan nilai ke tabel 'scores' di Supabase
        await sb.from('scores').insert({ 
            session_id: sessionId, 
            student_name: myName, 
            score: myScore 
        });
    } catch (err) {
        console.error("Error Save Score:", err);
    }
}
