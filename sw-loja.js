/* ============================================================
   APP DA LOJA (catálogo) — guarda-volumes (V9, 24/10/2026)
   Publicado na RAIZ do site (/sw-loja.js), ao lado do index.html da loja.

   Faz uma coisa só: guarda a PÁGINA da loja, para o app abrir mesmo sem
   internet (com a última vitrine que o próprio celular já guardou).
   - rede primeiro, sempre: loja publicada de novo aparece na hora;
   - internet travada: depois de 6 s abre a página guardada;
   - NÃO mexe em mais nada: o painel (/gestao1001/) tem o próprio sw.js, e a
     vitrine (banco) e as fotos vão sempre direto à rede. Pedido que não é a
     página da loja passa reto, como se este arquivo não existisse.
   Para desligar o app nos celulares: publicar um sw-loja.js que só faça
   self.registration.unregister().
   ============================================================ */
const GUARDA = 'loja-1';
const ESPERA_REDE = 6000;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('loja-') && k !== GUARDA) await caches.delete(k);
    await self.clients.claim();
  })());
});

function ehPaginaDaLoja(req) {
  if (req.method !== 'GET' || req.mode !== 'navigate') return false;
  const u = new URL(req.url);
  return u.origin === self.location.origin && (u.pathname === '/' || u.pathname === '/index.html');
}

self.addEventListener('fetch', e => {
  if (!ehPaginaDaLoja(e.request)) return;   // painel, banco, fotos: segue normal
  e.respondWith((async () => {
    const guarda = await caches.open(GUARDA);
    const daRede = fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r && r.ok) guarda.put('/', r.clone());
      return r;
    });
    daRede.catch(() => {});                             // falha tratada abaixo; sem aviso solto
    const guardada = await guarda.match('/');
    if (!guardada) return daRede;                       // primeira vez: só a rede
    const prazo = new Promise(ok => setTimeout(() => ok(null), ESPERA_REDE));
    try {
      const r = await Promise.race([daRede, prazo]);
      return r || guardada;                             // rede lenta demais: a guardada
    } catch (err) {
      return guardada;                                  // sem internet: a guardada
    }
  })());
});
