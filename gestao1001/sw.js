/* ============================================================
   PAINEL INSTALADO — o "guarda-volumes" do app
   Roda por trás do painel aberto pelo ícone do celular e faz UMA coisa:
   guardar a última versão do painel, para ele abrir mesmo sem internet.

   Regras (não mudar sem pensar — é este arquivo que decide o que abre):
   - Com internet, abre SEMPRE a versão publicada. A pergunta ao servidor é
     "mudou?": se não mudou, ele responde "igual" sem mandar o arquivo de novo,
     então isso não gasta dado do celular.
   - Rede travada (mais de ESPERA_REDE) ou sem internet: abre a guardada, e a
     nova continua baixando por trás para a próxima vez.
   - NUNCA guarda dado da loja nem chamada da nuvem: os dados moram no
     navegador e no Supabase, e essas chamadas passam direto, sem tocar aqui.
   - Mudou ícone ou manifest? Troque o número de GUARDA: o app novo apaga a
     guarda velha ao assumir.
   - Se um dia precisar DESLIGAR o app: publique um sw.js que só faça
     self.registration.unregister(). O celular confere este arquivo a cada
     abertura, então a correção chega sozinha.
   ============================================================ */
const GUARDA = 'painel-1';
const ESPERA_REDE = 6000;
const ESCOPO = self.registration.scope;               // .../gestao1001/
const PAGINA = ESCOPO;                                 // a chave da página guardada
const PECAS = ['manifest.webmanifest', 'icone-192.png', 'icone-512.png',
               'icone-mascara-512.png', 'icone-apple-180.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  // um item que falhe não pode impedir o resto (nem o app de instalar)
  e.waitUntil(caches.open(GUARDA).then(g => Promise.all(
    [PAGINA].concat(PECAS).map(u =>
      fetch(u, { cache: 'no-cache' })
        .then(r => { if (r.ok && !r.redirected) return g.put(u, r); })
        .catch(() => {}))
  )));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.indexOf('painel-') === 0 && k !== GUARDA)
      .map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function ehOPainel(u) {
  const base = new URL(ESCOPO).pathname;
  return u.pathname === base || u.pathname === base + 'index.html';
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (r.mode === 'navigate') {
    if (u.origin === self.location.origin && ehOPainel(u)) e.respondWith(abrirPainel(e));
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(guardadoPrimeiro(r));
    return;
  }
  if (u.origin === self.location.origin && PECAS.some(p => u.pathname.endsWith('/' + p))) {
    e.respondWith(guardadoPrimeiro(r));
  }
  // todo o resto (nuvem, fotos, WhatsApp, loja) passa direto
});

// resposta que veio de redirecionamento não pode ser entregue a uma abertura de página
function limpa(res) {
  if (!res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function abrirPainel(e) {
  const daRede = fetch(e.request.url.split('#')[0], { cache: 'no-cache', credentials: 'same-origin' })
    .then(res => {
      if (!res.ok || res.redirected) return res;
      const copia = res.clone();
      return caches.open(GUARDA).then(g => g.put(PAGINA, copia)).then(() => res, () => res);
    });
  e.waitUntil(daRede.catch(() => {}));
  return caches.match(PAGINA, { cacheName: GUARDA }).then(guardada => {
    if (!guardada) return daRede.then(limpa);          // primeira vez: só a rede
    let prazo;
    const tempo = new Promise(ok => { prazo = setTimeout(() => ok(guardada), ESPERA_REDE); });
    const rede = daRede.then(res => (res.ok ? limpa(res) : guardada), () => guardada);
    return Promise.race([rede, tempo]).then(res => { clearTimeout(prazo); return res; });
  });
}

function guardadoPrimeiro(r) {
  return caches.open(GUARDA).then(g => g.match(r).then(achou => achou || fetch(r).then(res => {
    if (res.ok || res.type === 'opaque') g.put(r, res.clone()).catch(() => {});
    return res;
  })));
}

// tocar na notificação (aviso de cobrança) traz o painel para a frente
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow(ESCOPO);
  }));
});
