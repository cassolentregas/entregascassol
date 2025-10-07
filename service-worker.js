// service-worker.js

const CACHE_NAME = 'comprovante-entrega-cache-v1';
const urlsToCache = [
  '/', // A página principal
  '/index.html', // O mesmo que a raiz
  '/manifest.json'
];

// Evento de instalação: abre o cache e adiciona os arquivos da "casca"
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento de fetch: responde com o cache se estiver offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o recurso estiver no cache, retorna ele. Senão, busca na rede.
        return response || fetch(event.request);
      })
  );
});
