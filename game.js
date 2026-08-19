const SUPABASE_URL = "https://zosmmbiknzbbrhohtleb.supabase.co";
const SUPABASE_KEY = "sb_publishable_U-kKIVLW5NZyv6zuWOc3jQ_ruPkoT9g";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let sessionId = null, myName = "", realtimeChannel = null, selectedMode = "classic";
let quizData = [], currentQ = 0, myScore = 0, timerInterval = null;

function show(id) {
    ["home", "teacher", "room", "student", "waiting", "gameScreen", "resultScreen", "recapScreen"].forEach(x => {
        const el = document.getElementById(x);
        if (el) el.classList.add("hidden");
    });
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
}

function code() { return "LGT-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function showTeacher() { show("teacher"); }
function showStudent() { show("student"); }

// GURU BUAT SESI
async function createSession() {
    const tName = document.getElementById("teacherName").value.trim();
    const title = document.getElementById("sessionTitle").value.trim();
    selectedMode = document.getElementById("gameMode").value;
    
    if (!tName || !title) return alert("Nama guru dan materi harus diisi!");

    try {
        const { data, error } = await sb.from('sessions').insert({ 
            code: code(), title, mode: selectedMode, status: 'waiting' 
        }).select();

        if (error) throw error;
        
        sessionId = data[0].id;
        document.getElementById("code").textContent = data[0].code;
        document.getElementById("roomTitle").textContent = title;
        document.getElementById("roomTeacher").textContent = tName;
        document.getElementById("roomModeName").textContent = document.getElementById("gameMode").options[document.getElementById("gameMode").selectedIndex].text;
        show("room");

        loadLobbyStudents();

        // Realtime Lobi Siswa Masuk
        realtimeChannel = sb.channel('lobby_channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'students', filter: `session_id=eq.${sessionId}` }, () => {
                loadLobbyStudents();
            }).subscribe();
            
    } catch (err) {
        console.error("Error Create Session:", err);
        alert("Gagal membuat sesi!");
    }
}

async function loadLobbyStudents() {
    const { data } = await sb.from('students').select('*').eq('session_id', sessionId);
    if (!data) return;
    document.getElementById("studentCount").textContent = data.length;
    document.getElementById("studentList").innerHTML = data.map(s => `
        <div class="flex justify-between items-center bg-slate-50 px-4 py-3 rounded-xl border border-slate-100">
            <span class="font-bold text-slate-700">👤 ${s.name}</span>
            <button onclick="kickStudent('${s.id}')" class="text-xs font-bold bg-rose-100 text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-200">Keluarkan (✕)</button>
        </div>
    `).join("") || '<p class="text-xs text-slate-400 text-center py-2">Belum ada siswa bergabung</p>';
}

// FITUR KICK SISWA
async function kickStudent(studentId) {
    if(!confirm("Keluarkan siswa ini dari sesi?")) return;
    await sb.from('students').delete().eq('id', studentId);
    loadLobbyStudents();
}

async function startSession() {
    try {
        await sb.from('sessions').update({ status: 'playing' }).eq('id', sessionId);
        alert("Sesi dimulai!");
    } catch (err) {
        alert("Gagal memulai sesi!");
    }
}

// AKHIRI SESI & LIHAT REKAP NILAI
async function endSession() {
    try {
        await sb.from('sessions').update({ status: 'finished' }).eq('id', sessionId);
        show('recapScreen');
        loadLeaderboard();
    } catch(err) {
        alert("Gagal mengakhiri sesi");
    }
}

async function loadLeaderboard() {
    const { data } = await sb.from('scores').select('*').eq('session_id', sessionId).order('score', { ascending: false });
    document.getElementById("leaderboardList").innerHTML = (data && data.length > 0) ? data.map((item, index) => `
        <div class="flex justify-between items-center bg-slate-50 px-4 py-3 rounded-xl border border-slate-100">
            <span class="font-bold text-slate-700">#${index + 1} ${item.student_name}</span>
            <span class="font-extrabold text-indigo-900 bg-indigo-50 px-3 py-1 rounded-lg">${item.score} Poin</span>
        </div>
    `).join("") : '<p class="text-center text-slate-400">Belum ada rekap nilai.</p>';
}

// UNDUH PDF REKAP NILAI
async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("LUGHATI Classroom - Rekap Nilai Siswa", 14, 20);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Sesi ID: ${sessionId}`, 14, 28);
    doc.text(`Dicetak oleh sistem SMP QLP Rabbani`, 14, 34);

    const { data } = await sb.from('scores').select('*').eq('session_id', sessionId).order('score', { ascending: false });
    let y = 45;
    doc.setFont("helvetica", "bold");
    doc.text("No", 14, y);
    doc.text("Nama Siswa", 30, y);
    doc.text("Skor", 150, y);
    doc.line(14, y+2, 195, y+2);

    y += 8;
    doc.setFont("helvetica", "normal");
    if(data) {
        data.forEach((row, i) => {
            doc.text(`${i+1}`, 14, y);
            doc.text(`${row.student_name}`, 30, y);
            doc.text(`${row.score}`, 150, y);
            y += 8;
        });
    }
    doc.save("Rekap-Nilai-Lughati.pdf");
}

// SISWA GABUNG SESI
async function joinSession() {
    const c = document.getElementById("joinCode").value.toUpperCase().trim();
    myName = document.getElementById("studentName").value.trim();
    
    if (!c || !myName) return alert("Kode dan nama lengkap harus diisi!");

    const { data: s } = await sb.from('sessions').select('*').eq('code', c).single();
    if (!s || s.status !== 'waiting') return alert("Sesi tidak ditemukan atau sudah dimulai!");
    
    sessionId = s.id;
    selectedMode = s.mode || "classic";
    
    await sb.from('students').insert({ session_id: sessionId, name: myName });
    document.getElementById("waitName").textContent = myName;
    show("waiting");

    // Realtime tunggu game dimulai atau dikick
    realtimeChannel = sb.channel('student_wait')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, payload => {
            if (payload.new.status === 'playing') loadGame();
            if (payload.new.status === 'finished') { alert("Sesi diakhiri guru."); show('home'); }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'students' }, () => {
            alert("Anda telah dikeluarkan oleh guru dari sesi ini.");
            show('home');
        }).subscribe();
}

// 3 MODE GAME & 1 MODE BATTLE
async function loadGame() {
    const { data } = await sb.from('kosakata').select('*');
    if (!data || data.length === 0) return alert("Bank soal kosong di database!");
    
    quizData = data.sort(() => 0.5 - Math.random()).slice(0, 10);
    currentQ = 0; myScore = 0;
    show("gameScreen");
    renderQuestion();
}

function renderQuestion() {
    if (currentQ >= quizData.length) return finishGame();
    
    let q = quizData[currentQ];
    document.getElementById("qCount").textContent = `${currentQ + 1}/${quizData.length}`;
    document.getElementById("soalTeks").textContent = q.ar;
    
    const ansContainer = document.getElementById("opsiJawaban");
    const timerBox = document.getElementById("timerBox");
    
    if(selectedMode === "speed") {
        timerBox.classList.remove("hidden");
        startTimer(10, () => { currentQ++; renderQuestion(); });
    } else {
        timerBox.classList.add("hidden");
    }

    if (selectedMode === "truefalse") {
        let isTrue = Math.random() < 0.5;
        let displayedAnswer = isTrue ? q.arti : ["Meja", "Kursi", "Pintu", "Pena"][Math.floor(Math.random()*4)];
        ansContainer.innerHTML = `
            <button onclick="checkTF(${isTrue}, true)" class="w-full py-4 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg">✔ Benar (${displayedAnswer})</button>
            <button onclick="checkTF(${isTrue}, false)" class="w-full py-4 rounded-2xl font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg">✖ Salah</button>
        `;
    } else {
        // Classic, Speed & Battle Mode (Multiple Choice)
        let opsiDummy = ["Meja", "Kursi", "Pintu", "Jendela", "Buku", "Pena", "Tas", "Papan Tulis"].filter(x => x !== q.arti);
        let opsis = [q.arti, ...opsiDummy.sort(() => 0.5 - Math.random()).slice(0, 3)].sort(() => 0.5 - Math.random());
        
        ansContainer.innerHTML = opsis.map(opsi => `
            <button onclick="checkAnswer('${opsi}', '${q.arti}')" class="w-full py-4 px-6 rounded-2xl font-bold text-slate-700 bg-slate-50 hover:bg-indigo-50 border border-slate-200 transition-all text-left shadow-sm">${opsi}</button>
        `).join("");
    }
}

function startTimer(seconds, callback) {
    let timeLeft = seconds;
    document.getElementById("timeLeft").textContent = timeLeft;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById("timeLeft").textContent = timeLeft;
        if(timeLeft <= 0) { clearInterval(timerInterval); callback(); }
    }, 1000);
}

function checkAnswer(jawaban, benar) {
    clearInterval(timerInterval);
    if (jawaban === benar) myScore += (selectedMode === "battle" ? 20 : 10);
    document.getElementById("score").textContent = myScore;
    currentQ++;
    renderQuestion();
}

function checkTF(isTrue, userChoice) {
    if (userChoice === isTrue) myScore += 10;
    document.getElementById("score").textContent = myScore;
    currentQ++;
    renderQuestion();
}

async function finishGame() {
    clearInterval(timerInterval);
    show("resultScreen");
    document.getElementById("finalScore").textContent = myScore;
    await sb.from('scores').insert({ session_id: sessionId, student_name: myName, score: myScore });
}

function leaveWaiting() { window.location.reload(); }
