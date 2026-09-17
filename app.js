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
  schedulePersonId: null,
  scheduleDraft: {},
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

async function personalRequest(path = "", method = "GET", data) {
  const config = window.REMS_APPWRITE;
  if (!config) throw new Error("No se encontró la conexión con la base de datos.");
  const response = await fetch(`${config.endpoint}/tablesdb/${encodeURIComponent(config.databaseId)}/tables/${encodeURIComponent(config.personalTableId)}/rows${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Appwrite-Project": config.projectId },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "No se pudo actualizar el personal.");
  return payload;
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
    }));
    const saved = faces();
    let migratedFaces = false;
    PEOPLE.forEach((person) => {
      if (person.legacyId !== person.id && saved[person.legacyId] && !saved[person.id]) {
        saved[person.id] = saved[person.legacyId];
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
  const scheduledShift = scheduleFor(person);
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
    scheduledShift: scheduledShift ? `${scheduledShift.start}–${scheduledShift.end}` : "Sin turno programado",
  };
  all.push(item);
  saveJson(STORAGE.records, all);
  const result = $("markerResult");
  result.className = "result success";
  result.textContent = `${person.name}: ${type} registrada a las ${formatTime(item.timestamp)}.`;
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
    row.innerHTML = `<div class="person-avatar">${index + 1}</div><div class="person-data"><strong>${escapeHtml(person.name)}</strong><span>DNI: ${escapeHtml(person.dni)} · ${hours}</span><span>${origin} · SEDE 1 REMS</span></div><span class="badge ${savedFaces[person.id] ? "ready" : ""}">${savedFaces[person.id] ? "Rostro registrado" : "Sin registrar"}</span><div class="person-actions"><button class="secondary" type="button" data-action="face" data-person-id="${person.id}">${savedFaces[person.id] ? "Actualizar rostro" : "Registrar rostro"}</button><button class="secondary" type="button" data-action="schedule" data-person-id="${person.id}">Horario mensual</button><button class="secondary" type="button" data-action="edit" data-person-id="${person.id}">Editar</button><button class="danger-button" type="button" data-action="delete" data-person-id="${person.id}">Eliminar</button></div>`;
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
window.setInterval(() => { $("markerClock").textContent = new Date().toLocaleTimeString("es-PE"); }, 1000);
$("markerClock").textContent = new Date().toLocaleTimeString("es-PE");
renderScheduleSummary();
state.peopleReady = Promise.resolve();
restoreSession();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js").catch(() => {});
