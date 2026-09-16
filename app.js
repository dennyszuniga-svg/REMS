const STORAGE = {
  faces: "rems-demo-faces-v1",
  records: "rems-demo-records-v1",
};

const PEOPLE = [
  { id: "giancarlo-bertarelli", name: "Giancarlo Bertarelli", dni: "por definir" },
  { id: "claudia-mongrut", name: "Claudia Mongrut", dni: "por definir" },
  { id: "ricardo-montalvo", name: "Ricardo Montalvo", dni: "por definir" },
  { id: "samir-ruiz", name: "Samir Ruiz", dni: "por definir" },
].map((person) => ({
  ...person,
  schedule: "08:00–15:45",
}));

const $ = (id) => document.getElementById(id);
const state = {
  role: null,
  camera: null,
  faceMode: "mark",
  selectedPerson: null,
  enrollmentSamples: [],
  modelsReady: false,
};

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function faces() { return loadJson(STORAGE.faces, {}); }
function records() { return loadJson(STORAGE.records, []); }
function todayKey() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}
function formatTime(value) {
  return new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function show(view) {
  ["loginView", "markerView", "adminView"].forEach((id) => { $(id).hidden = id !== view; });
  $("logoutButton").hidden = view === "loginView";
}
function login(role) {
  state.role = role;
  show(role === "marker" ? "markerView" : "adminView");
  if (role === "admin") renderAdmin();
}
function logout() {
  closeFace();
  state.role = null;
  show("loginView");
}

async function loadModels() {
  if (state.modelsReady) return;
  if (!window.faceapi) throw new Error("No se pudo iniciar el reconocimiento facial.");
  $("faceStatus").textContent = "Preparando el reconocimiento facial…";
  const base = "assets/face-models";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(base),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(base),
    faceapi.nets.faceRecognitionNet.loadFromUri(base),
  ]);
  state.modelsReady = true;
}

async function openFace(mode, person = null) {
  state.faceMode = mode;
  state.selectedPerson = person;
  state.enrollmentSamples = [];
  $("faceModal").hidden = false;
  $("faceTitle").textContent = mode === "enroll" ? `Registrar ${person.name}` : "Marcación facial";
  $("captureButton").textContent = mode === "enroll" ? "Capturar muestra 1 de 3" : "Reconocer y marcar";
  $("faceStatus").textContent = "Preparando cámara…";
  try {
    await loadModels();
    state.camera = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    });
    $("faceVideo").srcObject = state.camera;
    await $("faceVideo").play();
    $("faceStatus").textContent = "Mira de frente y mantén una sola persona dentro del marco.";
  } catch (error) {
    $("faceStatus").textContent = error?.message || "No se pudo abrir la cámara. Revisa el permiso.";
  }
}

function closeFace() {
  state.camera?.getTracks().forEach((track) => track.stop());
  state.camera = null;
  $("faceVideo").srcObject = null;
  $("faceModal").hidden = true;
  $("captureButton").disabled = false;
}

async function descriptor() {
  const detections = await faceapi
    .detectAllFaces($("faceVideo"), new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: .45 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  if (!detections.length) throw new Error("No se detectó un rostro. Acércate y mejora la iluminación.");
  if (detections.length > 1) throw new Error("Debe aparecer una sola persona en la cámara.");
  return Array.from(detections[0].descriptor);
}

function average(samples) {
  const result = new Array(128).fill(0);
  samples.forEach((sample) => sample.forEach((value, index) => { result[index] += value / samples.length; }));
  const norm = Math.sqrt(result.reduce((sum, value) => sum + value * value, 0)) || 1;
  return result.map((value) => Number((value / norm).toFixed(8)));
}
function distance(first, second) {
  return Math.sqrt(first.reduce((sum, value, index) => sum + ((value - second[index]) ** 2), 0));
}

async function capture() {
  $("captureButton").disabled = true;
  try {
    const sample = await descriptor();
    if (state.faceMode === "enroll") {
      state.enrollmentSamples.push(sample);
      if (state.enrollmentSamples.length < 3) {
        $("faceStatus").textContent = `Muestra ${state.enrollmentSamples.length} correcta. Mueve ligeramente el rostro y continúa.`;
        $("captureButton").textContent = `Capturar muestra ${state.enrollmentSamples.length + 1} de 3`;
        return;
      }
      const saved = faces();
      saved[state.selectedPerson.id] = average(state.enrollmentSamples);
      saveJson(STORAGE.faces, saved);
      closeFace();
      renderAdmin();
      return;
    }

    const saved = faces();
    const candidates = PEOPLE
      .filter((person) => saved[person.id])
      .map((person) => ({ person, score: distance(sample, saved[person.id]) }))
      .sort((a, b) => a.score - b.score);
    if (!candidates.length) throw new Error("Aún no existen rostros registrados.");
    if (candidates[0].score > .6) throw new Error("Rostro no reconocido. Solicita al administrador volver a registrarlo.");
    if (candidates[1] && candidates[1].score - candidates[0].score < .03) throw new Error("No fue posible identificar el rostro con seguridad.");
    registerMark(candidates[0].person, candidates[0].score);
    closeFace();
  } catch (error) {
    $("faceStatus").textContent = error?.message || "No se pudo procesar el rostro.";
  } finally {
    $("captureButton").disabled = false;
  }
}

function registerMark(person, score) {
  const all = records();
  const today = todayKey();
  const personToday = all.filter((item) => item.personId === person.id && item.date === today);
  const last = personToday.at(-1);
  const type = !last || last.type === "salida" ? "entrada" : "salida";
  const item = {
    id: crypto.randomUUID(),
    personId: person.id,
    personName: person.name,
    type,
    date: today,
    timestamp: new Date().toISOString(),
    faceDistance: Number(score.toFixed(5)),
    site: "SEDE 1 REMS",
    locationStatus: "pendiente",
  };
  all.push(item);
  saveJson(STORAGE.records, all);
  const result = $("markerResult");
  result.className = "result success";
  result.textContent = `${person.name}: ${type} registrada a las ${formatTime(item.timestamp)}.`;
}

function renderAdmin() {
  const savedFaces = faces();
  const list = $("peopleList");
  list.replaceChildren(...PEOPLE.map((person, index) => {
    const row = document.createElement("div");
    row.className = "person-row";
    row.innerHTML = `<div class="person-avatar">${index + 1}</div><div class="person-data"><strong>${person.name}</strong><span>DNI: ${person.dni} · ${person.schedule} · SEDE 1 REMS</span></div><span class="badge ${savedFaces[person.id] ? "ready" : ""}">${savedFaces[person.id] ? "Rostro registrado" : "Sin registrar"}</span>`;
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = savedFaces[person.id] ? "Actualizar" : "Registrar";
    button.addEventListener("click", () => openFace("enroll", person));
    row.append(button);
    return row;
  }));

  const todayRecords = records().filter((item) => item.date === todayKey()).reverse();
  $("todayMarks").textContent = String(todayRecords.length);
  const recordsList = $("recordsList");
  if (!todayRecords.length) {
    recordsList.innerHTML = '<div class="empty">Todavía no hay marcaciones registradas hoy.</div>';
    return;
  }
  recordsList.replaceChildren(...todayRecords.map((item) => {
    const row = document.createElement("div");
    row.className = "record-row";
    row.innerHTML = `<div class="record-data"><strong>${item.personName}</strong><span>${item.type === "entrada" ? "Entrada" : "Salida"} · ${formatTime(item.timestamp)}</span></div><span class="badge ready">Facial</span>`;
    return row;
  }));
}

function exportRecords() {
  const rows = [["Persona", "Tipo", "Fecha", "Hora", "Sede", "Distancia facial"]];
  records().forEach((item) => rows.push([item.personName, item.type, item.date, formatTime(item.timestamp), item.site, item.faceDistance]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = `asistencia-rems-${todayKey()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

$("markerLogin").addEventListener("click", () => login("marker"));
$("adminLogin").addEventListener("click", () => login("admin"));
$("logoutButton").addEventListener("click", logout);
$("startMarkButton").addEventListener("click", () => openFace("mark"));
$("closeFaceButton").addEventListener("click", closeFace);
$("captureButton").addEventListener("click", capture);
$("exportButton").addEventListener("click", exportRecords);
window.addEventListener("pagehide", closeFace);
window.setInterval(() => { $("markerClock").textContent = new Date().toLocaleTimeString("es-PE"); }, 1000);
$("markerClock").textContent = new Date().toLocaleTimeString("es-PE");
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js").catch(() => {});
