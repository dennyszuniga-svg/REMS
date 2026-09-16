const CACHE = "rems-asistencia-v3";
const FILES = [
  "./",
  "./index.html",
  "./styles.css?v=2",
  "./app.js?v=2",
  "./manifest.webmanifest",
  "./assets/rems-logo.png",
  "./assets/face-api.min.js",
  "./assets/face-models/tiny_face_detector_model-weights_manifest.json",
  "./assets/face-models/tiny_face_detector_model-shard1",
  "./assets/face-models/face_landmark_68_tiny_model-weights_manifest.json",
  "./assets/face-models/face_landmark_68_tiny_model-shard1",
  "./assets/face-models/face_recognition_model-weights_manifest.json",
  "./assets/face-models/face_recognition_model-shard1",
  "./assets/face-models/face_recognition_model-shard2"
];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES))));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
