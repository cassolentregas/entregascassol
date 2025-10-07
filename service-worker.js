// service-worker.js (VERSÃO DE TESTE 2: Com Dexie)

// Adiciona a importação das bibliotecas
importScripts('https://unpkg.com/dexie@3/dist/dexie.js');
importScripts('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');


// Configura o banco de dados local
const db = new Dexie('entregas_offline');
db.version(1).stores({
  entregas: '++id, numero_pedido'
});


// --- LÓGICA BÁSICA DO SERVICE WORKER (igual a antes) ---

const CACHE_NAME = 'comprovante-entrega-cache-v1-debug-dexie'; // Nome do cache atualizado
const urlsToCache = [ '/', '/index.html', '/manifest.json' ];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW-DEBUG-2] Cache aberto. Cacheando arquivos...');
        return cache.addAll(urlsToCache);
      })
  );
  console.log('[SW-DEBUG-2] Service Worker com Dexie instalado.');
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
                 .map(name => caches.delete(name))
      );
    })
  );
  console.log('[SW-DEBUG-2] Service Worker com Dexie ativado.');
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

