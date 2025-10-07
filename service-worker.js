// service-worker.js (VERSÃO DE TESTE SIMPLIFICADA)

const CACHE_NAME = 'comprovante-entrega-cache-v1-debug';
const urlsToCache = [ '/', '/index.html', '/manifest.json' ];

// 1. Instalação: Salva a "casca" do aplicativo no cache
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW-DEBUG] Cache aberto. Cacheando arquivos...');
        return cache.addAll(urlsToCache);
      })
  );
  console.log('[SW-DEBUG] Service Worker instalado.');
});

// 2. Ativação: Limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
                 .map(name => caches.delete(name))
      );
    })
  );
  console.log('[SW-DEBUG] Service Worker ativado.');
});

// 3. Fetch: Responde com o cache quando o app está offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
