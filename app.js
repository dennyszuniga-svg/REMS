const STORAGE = {
  faces: "rems-demo-faces-v1",
  records: "rems-demo-records-v1",
};

const FALLBACK_PEOPLE = [
  { id: "giancarlo-bertarelli", name: "Giancarlo Bertarelli", dni: "por definir" },
  { id: "claudia-mongrut", name: "Claudia Mongrut", dni: "por definir" },
  { id: "ricardo-montalvo", name: "Ricardo Montalvo", dni: "por definir" },
  { id: "samir-ruiz", name: "Samir Ruiz", dni: "por definir" },
];

const SCHEDULE_WEEKS = [
  { label: "21 al 26 sep.", start: "2026-09-21", end: "2026-09-26", pattern: "A" },
  { label: "28 sep. al 3 oct.", start: "2026-09-28", end: "2026-10-03", pattern: "B" },
  { label: "5 al 10 oct.", start: "2026-10-05", end: "2026-10-10", pattern: "A" },
  { label: "12 al 17 oct.", start: "2026-10-12", end: "2026-10-17", pattern: "B" },
  { label: "19 al 24 oct.", start: "2026-10-19", end: "2026-10-24", pattern: "A" },
  { label: "26 al 31 oct.", start: "2026-10-26", end: "2026-10-31", pattern: "B" },
  { label: "2 al 7 nov.", start: "2026-11-02", end: "2026-11-07", pattern: "A" },
  { label: "9 al 14 nov.", start: "2026-11-09", end: "2026-11-14", pattern: "B" },
  { label: "16 al 21 nov.", start: "2026-11-16", end: "2026-11-21", pattern: "A" },
  { label: "23 al 28 nov.", start: "2026-11-23", end: "2026-11-28", pattern: "B" },
  { label: "30 nov. al 5 dic.", start: "2026-11-30", end: "2026-12-05", pattern: "A" },
  { label: "7 al 12 dic.", start: "2026-12-07", end: "2026-12-12", pattern: "B" },
  { label: "14 al 19 dic.", start: "2026-12-14", end: "2026-12-19", pattern: "A" },
  { label: "21 al 26 dic.", start: "2026-12-21", end: "2026-12-26", pattern: "B" },
  { label: "28 dic. al 2 ene.", start: "2026-12-28", end: "2027-01-02", pattern: "A" },
];

const SHIFT_PATTERNS = {
  A: {
    "giancarlo-bertarelli": { weekdays: "07:00–17:00", saturday: "07:00–10:00" },
    "claudia-mongrut": { weekdays: "09:00–19:00", saturday: "10:00–13:00" },
    "ricardo-montalvo": { weekdays: "07:00–17:00", saturday: "07:00–10:00" },
    "samir-ruiz": { weekdays: "09:00–19:00", saturday: "10:00–13:00" },
  },
  B: {
    "giancarlo-bertarelli": { weekdays: "09:00–19:00", saturday: "10:00–13:00" },
    "claudia-mongrut": { weekdays: "07:00–17:00", saturday: "07:00–10:00" },
    "ricardo-montalvo": { weekdays: "09:00–19:00", saturday: "10:00–13:00" },
    "samir-ruiz": { weekdays: "07:00–17:00", saturday: "07:00–10:00" },
  },
};

let PEOPLE = [...FALLBACK_PEOPLE];
let accountApi = null;

const $ = (id) => document.getElementById(id);
const state = {
  role: null,
  camera: null,
  faceMode: "mark",
  selectedPerson: null,
  enrollmentSamples: [],
  modelsReady: false,
  peopleReady: null,
  peopleSource: "local",
  account: null,
};

function getAccountApi() {
  if (accountApi) return accountApi;
  const config = window.REMS_APPWRITE;
  if (!window.Appwrite || !config) throw new Error("No se pudo iniciar el acceso seguro.");
  const client = new Appwrite.Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId);
  accountApi = new Appwrite.Account(client);
  return accountApi;
}

function roleForAccount(account) {
  const labels = account?.labels || [];
  if (labels.includes("admin")) return "admin";
  if (labels.includes("marker")) return "marker";
  const users = window.REMS_APPWRITE?.authUsers || {};
  if (account?.email === users.administrador) return "admin";
  if (account?.email === users.marcador) return "marker";
  return null;
}

function setLoginStatus(message = "", success = false) {
  $("loginStatus").textContent = message;
  $("loginStatus").classList.toggle("success", success);
}

function personId(name, remoteId) {
  const slug = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || remoteId;
}

function setBackendStatus(message) {
  if ($("backendStatus")) $("backendStatus").textContent = message;
  if ($("peopleCount")) $("peopleCount").textContent = String(PEOPLE.length);
}

function localDateKey(date = new Date()) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function selectedScheduleWeek(date = new Date()) {
  const key = localDateKey(date);
  const active = SCHEDULE_WEEKS.find((week) => key >= week.start && key <= week.end);
  if (active) return { ...active, status: "vigente" };
  const upcoming = SCHEDULE_WEEKS.find((week) => key < week.start);
  if (upcoming) return { ...upcoming, status: "próximo" };
  return { ...SCHEDULE_WEEKS.at(-1), status: "último registrado" };
}

function personSchedule(personId, date = new Date()) {
  const week = selectedScheduleWeek(date);
  const shift = SHIFT_PATTERNS[week.pattern]?.[personId];
  return {
    ...week,
    weekdays: shift?.weekdays || "Por definir",
    saturday: shift?.saturday || "Por definir",
  };
}

function renderScheduleSummary() {
  const week = selectedScheduleWeek();
  $("markerSchedule").textContent = `${week.status === "próximo" ? "Próxima" : "Semana"}: ${week.label}`;
  $("scheduleWeek").textContent = week.label;
  $("scheduleStatus").textContent = `${week.status} · turnos según persona`;
}

async function loadPeople() {
  const config = window.REMS_APPWRITE;
  if (!config) {
    setBackendStatus("Modo local: no se pudo cargar la conexión con Appwrite.");
    return;
  }

  try {
    const url = `${config.endpoint}/tablesdb/${encodeURIComponent(config.databaseId)}/tables/${encodeURIComponent(config.personalTableId)}/rows`;
    const request = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": config.projectId,
      },
    });
    const response = await request.json();
    if (!request.ok) {
      const error = new Error(response.message || "No se pudo consultar Appwrite.");
      Object.assign(error, response);
      throw error;
    }
    if (!response.rows?.length) throw new Error("La tabla Personal todavía no tiene registros.");

    PEOPLE = response.rows.map((row) => ({
      id: personId(row.nombre, row.$id),
      appwriteId: row.$id,
      name: row.nombre,
      dni: row.dni || "por definir",
    }));
    state.peopleSource = "appwrite";
    setBackendStatus(`Appwrite conectado · ${PEOPLE.length} personas cargadas.`);
  } catch (error) {
    console.warn("No se pudo cargar Personal desde Appwrite; se usará el respaldo local.", error);
    const detail = error?.code === 401 || error?.type === "user_unauthorized"
      ? "falta autorizar la lectura de la tabla Personal"
      : "conexión no disponible";
    setBackendStatus(`Modo local activo · ${detail}.`);
  }

  if (state.role === "admin") renderAdmin();
}

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function faces() { return loadJson(STORAGE.faces, {}); }
function records() { return loadJson(STORAGE.records, []); }
function todayKey() {
  return localDateKey();
}
function formatTime(value) {
  return new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function show(view) {
  ["loginView", "markerView", "adminView"].forEach((id) => { $(id).hidden = id !== view; });
  $("logoutButton").hidden = view === "loginView";
}
async function enterRole(role, account) {
  state.role = role;
  state.account = account;
  state.peopleReady = loadPeople();
  await state.peopleReady;
  show(role === "marker" ? "markerView" : "adminView");
  if (role === "admin") renderAdmin();
}

async function loginWithCredentials(event) {
  event.preventDefault();
  const username = $("username").value.trim().toLowerCase();
  const password = $("password").value;
  const users = window.REMS_APPWRITE?.authUsers || {};
  const email = users[username] || (Object.values(users).includes(username) ? username : null);
  if (!email) {
    setLoginStatus("Usuario no autorizado. Usa administrador o marcador.");
    return;
  }

  $("loginButton").disabled = true;
  setLoginStatus("Verificando acceso…", true);
  try {
    const account = getAccountApi();
    await account.createEmailPasswordSession(email, password);
    const current = await account.get();
    const role = roleForAccount(current);
    if (!role) {
      await account.deleteSession({ sessionId: "current" });
      throw new Error("Esta cuenta no tiene un perfil autorizado.");
    }
    $("password").value = "";
    setLoginStatus("");
    await enterRole(role, current);
  } catch (error) {
    const message = error?.type === "user_invalid_credentials"
      ? "Usuario o contraseña incorrectos."
      : error?.message || "No se pudo iniciar sesión.";
    setLoginStatus(message);
  } finally {
    $("loginButton").disabled = false;
  }
}

async function restoreSession() {
  try {
    const current = await getAccountApi().get();
    const role = roleForAccount(current);
    if (!role) return;
    await enterRole(role, current);
  } catch (error) {
    if (error?.code && error.code !== 401) setLoginStatus("No se pudo verificar la sesión guardada.");
  }
}

async function logout() {
  closeFace();
  try { await getAccountApi().deleteSession({ sessionId: "current" }); } catch { /* La sesión ya pudo haber expirado. */ }
  state.role = null;
  state.account = null;
  state.peopleReady = Promise.resolve();
  $("username").value = "";
  $("password").value = "";
  setLoginStatus("");
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
  await state.peopleReady;
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
    const schedule = personSchedule(person.id);
    const row = document.createElement("div");
    row.className = "person-row";
    row.innerHTML = `<div class="person-avatar">${index + 1}</div><div class="person-data"><strong>${person.name}</strong><span>DNI: ${person.dni} · L–V ${schedule.weekdays} · Sáb. ${schedule.saturday}</span><span>${schedule.status === "próximo" ? "Próxima semana" : "Semana"}: ${schedule.label} · SEDE 1 REMS</span></div><span class="badge ${savedFaces[person.id] ? "ready" : ""}">${savedFaces[person.id] ? "Rostro registrado" : "Sin registrar"}</span>`;
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

$("loginForm").addEventListener("submit", loginWithCredentials);
$("logoutButton").addEventListener("click", logout);
$("startMarkButton").addEventListener("click", () => openFace("mark"));
$("closeFaceButton").addEventListener("click", closeFace);
$("captureButton").addEventListener("click", capture);
$("exportButton").addEventListener("click", exportRecords);
window.addEventListener("pagehide", closeFace);
window.setInterval(() => { $("markerClock").textContent = new Date().toLocaleTimeString("es-PE"); }, 1000);
$("markerClock").textContent = new Date().toLocaleTimeString("es-PE");
renderScheduleSummary();
state.peopleReady = Promise.resolve();
restoreSession();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js").catch(() => {});
