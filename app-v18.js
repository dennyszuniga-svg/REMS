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

const LEGACY_FACE_IDS_BY_DNI = Object.freeze({
  "41542645": ["giancarlo-bertarelli", "bertarelli-arias-giancarlo"],
  "73239256": ["claudia-mongrut", "mongrut-cueva-claudia-lucia"],
  "10629469": ["ricardo-montalvo", "montalvo-machaca-ricardo"],
  "47205998": ["samir-ruiz", "ruiz-flores-elmy-samir"],
});

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
  schedulePersonId: null,
  scheduleDraft: {},
  remoteRecords: [],
  refreshing: false,
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

function parseMonthlySchedule(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function parseFaceDescriptor(value) {
  if (!value) return null;
  try {
    const descriptor = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(descriptor) && descriptor.length === 128 && descriptor.every(Number.isFinite) ? descriptor : null;
  } catch { return null; }
}

function scheduleFor(person, date = new Date()) {
  const day = localDateKey(date);
  const month = day.slice(0, 7);
  const monthly = person.monthlySchedule?.[month]?.[day];
  if (monthly?.start && monthly?.end) return { ...monthly, source: "monthly" };
  const fallback = personSchedule(person.legacyId || person.id, date);
  if (fallback.weekdays === "Por definir") return null;
  const weekday = new Date(`${day}T12:00:00`).getDay();
  const hours = weekday === 6 ? fallback.saturday : fallback.weekdays;
  if (weekday === 0 || !hours || hours === "Por definir") return null;
  const [start, end] = hours.split("–");
  return { start, end, source: "legacy" };
}

function renderScheduleSummary() {
  const hasMonthlySchedule = PEOPLE.some((person) => Object.keys(person.monthlySchedule || {}).length);
  const week = selectedScheduleWeek();
  $("markerSchedule").textContent = hasMonthlySchedule ? "Según programación mensual" : `${week.status === "próximo" ? "Próxima" : "Semana"}: ${week.label}`;
  $("scheduleWeek").textContent = hasMonthlySchedule ? "Mensual" : week.label;
  $("scheduleStatus").textContent = hasMonthlySchedule ? "editable por administrador" : `${week.status} · turnos según persona`;
}

async function databaseRowsRequest(tableId, path = "", method = "GET", data) {
  const config = window.REMS_APPWRITE;
  if (!config) throw new Error("No se encontró la conexión con la base de datos.");
  const response = await fetch(`${config.endpoint}/tablesdb/${encodeURIComponent(config.databaseId)}/tables/${encodeURIComponent(tableId)}/rows${path}`, {
    method,
    credentials: "include",
    cache: method === "GET" ? "no-store" : "default",
    headers: { "Content-Type": "application/json", "X-Appwrite-Project": config.projectId },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "No se pudo actualizar el personal.");
  return payload;
}

function personalRequest(path = "", method = "GET", data) {
  return databaseRowsRequest(window.REMS_APPWRITE?.personalTableId, path, method, data);
}

async function loadPeople() {
  const config = window.REMS_APPWRITE;
  if (!config) {
    setBackendStatus("Modo local: no se pudo cargar la conexión con Appwrite.");
    return;
  }

  try {
    const response = await personalRequest();
    if (!response.rows?.length) throw new Error("La tabla Personal todavía no tiene registros.");

    PEOPLE = response.rows.map((row) => ({
      id: row.$id,
      legacyId: personId(row.nombre, row.$id),
      appwriteId: row.$id,
      name: row.nombre,
      dni: row.dni || "por definir",
      monthlySchedule: parseMonthlySchedule(row.horario_mensual),
      faceDescriptor: parseFaceDescriptor(row.rostro_descriptor),
    }));
    const saved = faces();
    let migratedFaces = false;
    PEOPLE.forEach((person) => {
      const knownKeys = [person.legacyId, ...(LEGACY_FACE_IDS_BY_DNI[String(person.dni)] || [])];
      const oldDescriptor = knownKeys.map((key) => saved[key]).find(Boolean);
      if (person.legacyId !== person.id && oldDescriptor && !saved[person.id]) {
        saved[person.id] = oldDescriptor;
        migratedFaces = true;
      }
      if (person.faceDescriptor && !saved[person.id]) {
        saved[person.id] = person.faceDescriptor;
        migratedFaces = true;
      }
    });
    if (migratedFaces) saveJson(STORAGE.faces, saved);
    state.peopleSource = "appwrite";
    setBackendStatus(`Appwrite conectado · ${PEOPLE.length} personas cargadas.`);
    renderScheduleSummary();
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
function attendanceRecords() { return [...state.remoteRecords, ...records().filter((item) => !item.remoteId)]; }
function remoteRecord(row) {
  return { id: row.$id, remoteId: row.$id, personId: row.persona_id, personName: row.persona_nombre, type: row.tipo, date: row.fecha, timestamp: row.momento, site: row.sede, scheduledShift: row.turno || "Sin turno programado", faceDistance: Number(row.distancia || 0) };
}
async function loadRecords() {
  const tableId = window.REMS_APPWRITE?.markingsTableId;
  if (!tableId) return;
  try { const response = await databaseRowsRequest(tableId, `?_=${Date.now()}`); state.remoteRecords = (response.rows || []).map(remoteRecord); }
  catch (error) { console.warn("No se pudieron cargar las marcaciones sincronizadas.", error); }
}
async function syncRecord(item) {
  const tableId = window.REMS_APPWRITE?.markingsTableId;
  if (!tableId) throw new Error("No se configuró la tabla de marcaciones.");
  const response = await databaseRowsRequest(tableId, "", "POST", { rowId: "unique()", data: { persona_id: item.personId, persona_nombre: item.personName, tipo: item.type, fecha: item.date, momento: item.timestamp, sede: item.site, turno: item.scheduledShift, distancia: String(item.faceDistance) } });
  const local = records(); const index = local.findIndex((record) => record.id === item.id);
  if (index >= 0) { local[index] = { ...local[index], remoteId: response.$id }; saveJson(STORAGE.records, local); }
  state.remoteRecords = [remoteRecord(response), ...state.remoteRecords.filter((record) => record.remoteId !== response.$id)];
}
async function syncPendingRecords() {
  for (const item of records().filter((item) => !item.remoteId)) {
    try { await syncRecord(item); } catch (error) { console.warn("Una marcación pendiente sigue sin sincronizar.", error); }
  }
}
async function syncFaceDescriptor(person, descriptor) {
  if (!person?.appwriteId) throw new Error("No se pudo identificar al personal para sincronizar su rostro.");
  await personalRequest(`/${encodeURIComponent(person.appwriteId)}`, "PATCH", { data: { rostro_descriptor: JSON.stringify(descriptor) } });
}
async function syncPendingFaces() {
  if (state.role !== "admin") return;
  const saved = faces();
  for (const person of PEOPLE) {
    if (saved[person.id] && !person.faceDescriptor) {
      try { await syncFaceDescriptor(person, saved[person.id]); } catch (error) { console.warn("Un rostro pendiente sigue sin sincronizar.", error); }
    }
  }
}
function todayKey() {
  return localDateKey();
}
function formatTime(value) {
  return new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function formatDateTime(value) {
  return new Date(value).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function minutesFromTime(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? (hours * 60) + minutes : null;
}
function minutesToHours(value) {
  const minutes = Math.max(0, Math.round(value || 0));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
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
  await syncPendingFaces();
  if (role === "admin") await loadPeople();
  await loadRecords();
  await syncPendingRecords();
  await loadRecords();
  show(role === "marker" ? "markerView" : "adminView");
  if (role === "admin") renderAdmin();
}

async function createOrReplaceSession(account, email, password) {
  try {
    await account.createEmailPasswordSession(email, password);
  } catch (error) {
    const hasActiveSession = error?.type === "user_session_already_active" || /session is active/i.test(error?.message || "");
    if (!hasActiveSession) throw error;
    await account.deleteSession("current");
    await account.createEmailPasswordSession(email, password);
  }
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
    let current = null;
    try { current = await account.get(); } catch { /* No hay una sesión recuperable. */ }

    const activeRole = roleForAccount(current);
    if (current && activeRole && current.email === email) {
      $("password").value = "";
      setLoginStatus("");
      await enterRole(activeRole, current);
      return;
    }

    if (current) await account.deleteSession("current");
    await createOrReplaceSession(account, email, password);
    current = await account.get();
    const role = roleForAccount(current);
    if (!role) {
      await account.deleteSession("current");
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
  try { await getAccountApi().deleteSession("current"); } catch { /* La sesión ya pudo haber expirado. */ }
  state.role = null;
  state.account = null;
  state.peopleReady = Promise.resolve();
  $("username").value = "";
  $("password").value = "";
  setLoginStatus("");
  show("loginView");
}

async function refreshSharedData() {
  if (!state.role || state.refreshing) return;
  state.refreshing = true;
  try {
    await Promise.all([loadPeople(), loadRecords()]);
    if (state.role === "admin") await syncPendingFaces();
    if (state.role === "admin") renderAdmin();
  } finally { state.refreshing = false; }
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
      const enrolledDescriptor = average(state.enrollmentSamples);
      saved[state.selectedPerson.id] = enrolledDescriptor;
      saveJson(STORAGE.faces, saved);
      try {
        await syncFaceDescriptor(state.selectedPerson, enrolledDescriptor);
      } catch (error) {
        $("faceStatus").textContent = "El rostro quedó registrado en esta computadora, pero falta sincronizarlo. Revisa la conexión e inténtalo otra vez.";
        return;
      }
      closeFace();
      await loadPeople();
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
    await registerMark(candidates[0].person, candidates[0].score);
    closeFace();
  } catch (error) {
    $("faceStatus").textContent = error?.message || "No se pudo procesar el rostro.";
  } finally {
    $("captureButton").disabled = false;
  }
}

async function registerMark(person, score) {
  const all = attendanceRecords();
  const today = todayKey();
  const scheduledShift = scheduleFor(person);
  const personToday = all.filter((item) => item.personId === person.id && item.date === today).sort((first, second) => new Date(first.timestamp) - new Date(second.timestamp));
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
    site: "PANORAMA",
    locationStatus: "pendiente",
    scheduledShift: scheduledShift ? `${scheduledShift.start}–${scheduledShift.end}` : "Sin turno programado",
  };
  const local = records();
  local.push(item);
  saveJson(STORAGE.records, local);
  const result = $("markerResult");
  try {
    await syncRecord(item);
    result.className = "result success";
    result.textContent = `${person.name}: ${type} registrada y sincronizada a las ${formatTime(item.timestamp)}.`;
  } catch (error) {
    result.className = "result error";
    result.textContent = `${person.name}: ${type} registrada en este equipo, pendiente de sincronización. Revisa la conexión.`;
  }
}

function personById(id) { return PEOPLE.find((person) => person.id === id); }

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function renderAdmin() {
  const savedFaces = faces();
  const list = $("peopleList");
  list.replaceChildren(...PEOPLE.map((person, index) => {
    const schedule = scheduleFor(person);
    const row = document.createElement("div");
    row.className = "person-row";
    const hours = schedule ? `Hoy: ${schedule.start}–${schedule.end}` : "Hoy: sin turno programado";
    const origin = schedule?.source === "monthly" ? "Programación mensual" : schedule ? "Cronograma vigente" : "Pendiente de programar";
    row.innerHTML = `<div class="person-avatar">${index + 1}</div><div class="person-data"><strong>${escapeHtml(person.name)}</strong><span>DNI: ${escapeHtml(person.dni)} · ${hours}</span><span>${origin} · PANORAMA</span></div><span class="badge ${savedFaces[person.id] ? "ready" : ""}">${savedFaces[person.id] ? "Rostro registrado" : "Sin registrar"}</span><div class="person-actions"><button class="secondary" type="button" data-action="face" data-person-id="${person.id}">${savedFaces[person.id] ? "Actualizar rostro" : "Registrar rostro"}</button><button class="secondary" type="button" data-action="schedule" data-person-id="${person.id}">Horario mensual</button><button class="secondary" type="button" data-action="edit" data-person-id="${person.id}">Editar</button><button class="danger-button" type="button" data-action="delete" data-person-id="${person.id}">Eliminar</button></div>`;
    return row;
  }));

  const todayRecords = attendanceRecords().filter((item) => item.date === todayKey()).reverse();
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

function openPersonModal(person = null) {
  $("personModalTitle").textContent = person ? "Editar personal" : "Agregar personal";
  $("personRowId").value = person?.appwriteId || "";
  $("personName").value = person?.name || "";
  $("personDni").value = person?.dni === "por definir" ? "" : person?.dni || "";
  $("personFormStatus").textContent = "";
  $("personModal").hidden = false;
  $("personName").focus();
}
function closePersonModal() { $("personModal").hidden = true; }

async function savePerson(event) {
  event.preventDefault();
  const name = $("personName").value.trim(); const dni = $("personDni").value.trim() || "por definir"; const rowId = $("personRowId").value;
  if (!name) return;
  const button = $("savePersonButton"); button.disabled = true;
  try {
    if (rowId) await personalRequest(`/${encodeURIComponent(rowId)}`, "PATCH", { data: { nombre: name, dni } });
    else await personalRequest("", "POST", { rowId: "unique()", data: { nombre: name, dni, horario_mensual: "" } });
    await loadPeople(); closePersonModal();
  } catch (error) { $("personFormStatus").textContent = error.message || "No se pudo guardar el personal."; }
  finally { button.disabled = false; }
}

async function deletePerson(person) {
  if (!person?.appwriteId || !window.confirm(`¿Eliminar a ${person.name}? Sus marcaciones ya registradas no se borrarán.`)) return;
  try {
    await personalRequest(`/${encodeURIComponent(person.appwriteId)}`, "DELETE");
    const saved = faces(); delete saved[person.id]; saveJson(STORAGE.faces, saved);
    await loadPeople();
  } catch (error) { window.alert(error.message || "No se pudo eliminar el personal."); }
}

function monthLabel(month) { return new Date(`${month}-01T12:00:00`).toLocaleDateString("es-PE", { month: "long", year: "numeric" }); }
function closeScheduleModal() { $("scheduleModal").hidden = true; }
function openScheduleModal(person) {
  state.schedulePersonId = person.id; state.scheduleDraft = JSON.parse(JSON.stringify(person.monthlySchedule || {}));
  $("schedulePersonName").textContent = person.name; $("scheduleMonth").value = localDateKey().slice(0, 7); $("scheduleFormStatus").textContent = "";
  $("scheduleModal").hidden = false; renderMonthlyScheduleDays();
}
function renderMonthlyScheduleDays() {
  const month = $("scheduleMonth").value; if (!month) return;
  const [year, monthNumber] = month.split("-").map(Number); const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]; const values = state.scheduleDraft[month] || {};
  $("scheduleMonthLabel").textContent = monthLabel(month);
  $("monthlyScheduleDays").innerHTML = Array.from({ length: daysInMonth }, (_, offset) => {
    const day = String(offset + 1).padStart(2, "0"); const date = `${month}-${day}`; const entry = values[date]; const weekday = new Date(`${date}T12:00:00`).getDay();
    return `<div class="schedule-day ${entry ? "active" : ""}" data-date="${date}"><label><input type="checkbox" data-field="active" ${entry ? "checked" : ""}> <strong>${dayNames[weekday]} ${day}</strong></label><input type="time" data-field="start" value="${entry?.start || "08:00"}" ${entry ? "" : "disabled"} aria-label="Hora de entrada ${date}"><span>–</span><input type="time" data-field="end" value="${entry?.end || "17:00"}" ${entry ? "" : "disabled"} aria-label="Hora de salida ${date}"></div>`;
  }).join("");
}
function updateScheduleDay(target) {
  const row = target.closest(".schedule-day"); if (!row) return;
  const month = $("scheduleMonth").value; const date = row.dataset.date; state.scheduleDraft[month] ||= {};
  if (target.dataset.field === "active") {
    if (target.checked) state.scheduleDraft[month][date] = { start: row.querySelector('[data-field="start"]').value, end: row.querySelector('[data-field="end"]').value };
    else delete state.scheduleDraft[month][date];
    renderMonthlyScheduleDays(); return;
  }
  if (state.scheduleDraft[month][date]) state.scheduleDraft[month][date][target.dataset.field] = target.value;
}
function applyMonthlyHours() {
  const month = $("scheduleMonth").value; const start = $("bulkStart").value; const end = $("bulkEnd").value;
  if (!month || !start || !end) return;
  const weekdays = [...document.querySelectorAll('input[name="bulkDay"]:checked')].map((input) => Number(input.value));
  const [year, monthNumber] = month.split("-").map(Number); const daysInMonth = new Date(year, monthNumber, 0).getDate(); state.scheduleDraft[month] ||= {};
  for (let number = 1; number <= daysInMonth; number += 1) { const date = `${month}-${String(number).padStart(2, "0")}`; if (weekdays.includes(new Date(`${date}T12:00:00`).getDay())) state.scheduleDraft[month][date] = { start, end }; }
  renderMonthlyScheduleDays();
}
async function saveMonthlySchedule() {
  const person = personById(state.schedulePersonId); if (!person?.appwriteId) return;
  const button = $("saveScheduleButton"); button.disabled = true;
  const selectedMonth = $("scheduleMonth").value;
  const monthsToKeep = [selectedMonth, ...Object.keys(state.scheduleDraft).filter((month) => month !== selectedMonth).sort().reverse()].slice(0, 2);
  const scheduleToSave = Object.fromEntries(monthsToKeep.map((month) => [month, state.scheduleDraft[month] || {}]));
  try { await personalRequest(`/${encodeURIComponent(person.appwriteId)}`, "PATCH", { data: { horario_mensual: JSON.stringify(scheduleToSave) } }); await loadPeople(); closeScheduleModal(); }
  catch (error) { $("scheduleFormStatus").textContent = error.message || "No se pudo guardar el horario."; }
  finally { button.disabled = false; }
}

async function exportRecords() {
  if (!window.ExcelJS) { window.alert("No se pudo preparar el archivo Excel. Revisa la conexión e inténtalo otra vez."); return; }
  const month = $("exportMonth").value || todayKey().slice(0, 7);
  const people = [...PEOPLE].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const recordsForMonth = attendanceRecords().filter((item) => item.date?.startsWith(month));
  const daily = [];

  people.forEach((person) => {
    const byDay = new Map();
    recordsForMonth.filter((item) => item.personId === person.id).forEach((item) => {
      const entries = byDay.get(item.date) || [];
      entries.push(item); byDay.set(item.date, entries);
    });
    [...byDay.entries()].sort(([first], [second]) => first.localeCompare(second)).forEach(([date, marks]) => {
      const ordered = marks.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const entrance = ordered.find((item) => item.type === "entrada");
      const exit = [...ordered].reverse().find((item) => item.type === "salida");
      const scheduled = scheduleFor(person, new Date(`${date}T12:00:00`));
      const inferredShift = scheduled ? `${scheduled.start}–${scheduled.end}` : "";
      const shift = entrance?.scheduledShift || exit?.scheduledShift || inferredShift;
      const [scheduledStart, scheduledEnd] = String(shift || "").split("–");
      const entryMinutes = entrance ? (new Date(entrance.timestamp).getHours() * 60) + new Date(entrance.timestamp).getMinutes() : null;
      const exitMinutes = exit ? (new Date(exit.timestamp).getHours() * 60) + new Date(exit.timestamp).getMinutes() : null;
      const late = entrance && minutesFromTime(scheduledStart) !== null ? Math.max(0, entryMinutes - minutesFromTime(scheduledStart)) : 0;
      const worked = entrance && exit ? Math.max(0, (new Date(exit.timestamp) - new Date(entrance.timestamp)) / 60000) : 0;
      const extra = exit && minutesFromTime(scheduledEnd) !== null ? Math.max(0, exitMinutes - minutesFromTime(scheduledEnd)) : 0;
      daily.push({ person, date, entrance, exit, shift: shift || "Sin turno programado", scheduledStart: scheduledStart || "", scheduledEnd: scheduledEnd || "", worked, late, extra, status: entrance && exit ? "LABORABLE" : entrance ? "PENDIENTE DE SALIDA" : "SIN ENTRADA" });
    });
  });

  const detailRows = daily.map((row) => [row.date, row.person.dni || "por definir", row.person.name, row.person.site || "Personal REMS", "PANORAMA", row.shift, row.scheduledStart, row.scheduledEnd, row.entrance ? formatDateTime(row.entrance.timestamp) : "", row.exit ? formatDateTime(row.exit.timestamp) : "Pendiente", minutesToHours(row.worked), row.late, 0, row.status, minutesToHours(row.extra), minutesToHours(row.extra)]);
  const summaryRows = people.map((person) => {
    const rows = daily.filter((row) => row.person.id === person.id);
    return [person.dni || "por definir", person.name, "Personal REMS", "PANORAMA", month, rows.filter((row) => row.status === "LABORABLE").length, rows.filter((row) => row.status !== "LABORABLE").length, minutesToHours(rows.reduce((sum, row) => sum + row.worked, 0)), rows.reduce((sum, row) => sum + row.late, 0), 0, minutesToHours(rows.reduce((sum, row) => sum + row.extra, 0)), minutesToHours(rows.reduce((sum, row) => sum + row.extra, 0))];
  });
  const lateRows = daily.filter((row) => row.late > 0).map((row) => [row.person.dni || "por definir", row.person.name, "Personal REMS", "PANORAMA", row.date, row.late, 0, "Tardanza registrada sin descuento automático."]);
  const addSheet = (workbook, name, title, subtitle, headers, rows, widths) => {
    const worksheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 3 }] });
    worksheet.mergeCells(1, 1, 1, headers.length); worksheet.mergeCells(2, 1, 2, headers.length);
    worksheet.getCell("A1").value = title; worksheet.getCell("A2").value = subtitle;
    worksheet.getRow(1).height = 27; worksheet.getRow(2).height = 20;
    worksheet.getCell("A1").font = { name: "Arial", size: 15, bold: true, color: { argb: "FFFFFFFF" } }; worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111114" } }; worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
    worksheet.getCell("A2").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF4B250F" } }; worksheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE5DD" } }; worksheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left" };
    worksheet.addRow(headers); worksheet.getRow(3).height = 30;
    worksheet.getRow(3).eachCell((cell) => { cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFB5126" } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = { bottom: { style: "thin", color: { argb: "FFFFFFFF" } } }; });
    rows.forEach((row, index) => { const output = worksheet.addRow(row); output.height = 19; output.eachCell((cell) => { cell.font = { name: "Arial", size: 10, color: { argb: "FF222227" } }; cell.alignment = { vertical: "middle" }; if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F8" } }; cell.border = { bottom: { style: "hair", color: { argb: "FFD9D9DD" } } }; }); });
    worksheet.columns.forEach((column, index) => { column.width = widths[index]; });
    worksheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, rows.length + 3), column: headers.length } };
    return worksheet;
  };
  const workbook = new ExcelJS.Workbook(); workbook.creator = "REMS"; workbook.created = new Date(); workbook.properties.title = `Asistencia PANORAMA ${month}`;
  addSheet(workbook, "Resumen mensual", "CONTROL MENSUAL DE ASISTENCIA REMS", `PANORAMA | ${month} | Sin descuento automático por tardanza`, ["DNI", "APELLIDOS Y NOMBRES", "CARGO", "CENTRO DE TRABAJO", "MES", "DÍAS LABORABLES", "DÍAS PENDIENTES", "HORAS TRABAJADAS", "TARDANZA (MIN)", "DESCUENTO", "HORAS EXTRA CALCULADAS", "EXTRAS PENDIENTES"], summaryRows, [14, 34, 18, 20, 11, 16, 16, 20, 16, 12, 24, 20]);
  addSheet(workbook, "Detalle diario", "DETALLE DIARIO DE ASISTENCIA REMS", `PANORAMA | ${month} | Horas extra pendientes de confirmación`, ["FECHA", "DNI", "APELLIDOS Y NOMBRES", "CARGO", "SEDE", "TURNO", "ENTRADA PROGRAMADA", "SALIDA PROGRAMADA", "INGRESO REAL", "SALIDA REAL", "HORAS TRABAJADAS", "TARDANZA (MIN)", "DESCUENTO", "ESTADO DE JORNADA", "HORAS EXTRA CALCULADAS", "EXTRAS PENDIENTES"], detailRows, [13, 14, 32, 18, 18, 18, 20, 20, 21, 21, 20, 16, 12, 22, 24, 20]);
  addSheet(workbook, "Tardanzas", "CONTROL DE TARDANZAS REMS", `PANORAMA | ${month} | Registro informativo, sin descuento`, ["DNI", "APELLIDOS Y NOMBRES", "CARGO", "CENTRO DE TRABAJO", "FECHA", "TARDANZA (MIN)", "DESCUENTO", "OBSERVACIONES"], lateRows, [14, 34, 18, 20, 13, 18, 12, 50]);
  const buffer = await workbook.xlsx.writeBuffer(); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); link.download = `asistencia-panorama-${month}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

$("loginForm").addEventListener("submit", loginWithCredentials);
$("logoutButton").addEventListener("click", logout);
$("startMarkButton").addEventListener("click", () => openFace("mark"));
$("closeFaceButton").addEventListener("click", closeFace);
$("captureButton").addEventListener("click", capture);
$("exportButton").addEventListener("click", exportRecords);
$("openNewPersonButton").addEventListener("click", () => openPersonModal());
$("closePersonButton").addEventListener("click", closePersonModal);
$("personForm").addEventListener("submit", savePerson);
$("closeScheduleButton").addEventListener("click", closeScheduleModal);
$("scheduleMonth").addEventListener("change", renderMonthlyScheduleDays);
$("monthlyScheduleDays").addEventListener("change", (event) => updateScheduleDay(event.target));
$("applyMonthlyHours").addEventListener("click", applyMonthlyHours);
$("saveScheduleButton").addEventListener("click", saveMonthlySchedule);
$("peopleList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const person = personById(button.dataset.personId);
  if (!person) return;
  if (button.dataset.action === "face") openFace("enroll", person);
  if (button.dataset.action === "schedule") openScheduleModal(person);
  if (button.dataset.action === "edit") openPersonModal(person);
  if (button.dataset.action === "delete") deletePerson(person);
});
window.addEventListener("pagehide", closeFace);
window.addEventListener("focus", refreshSharedData);
window.setInterval(() => { $("markerClock").textContent = new Date().toLocaleTimeString("es-PE"); }, 1000);
window.setInterval(refreshSharedData, 20000);
$("markerClock").textContent = new Date().toLocaleTimeString("es-PE");
$("exportMonth").value = todayKey().slice(0, 7);
renderScheduleSummary();
state.peopleReady = Promise.resolve();
restoreSession();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" }).then((registration) => registration.update()).catch(() => {});
