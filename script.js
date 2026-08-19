/* =========================================================
   CPPEM · Resumo Bizurado PMPE
   CTA → checkout, sem formulário intermediário.

   As regras de tracking estão em C:\Projetos\pmpe\TRACKING.md —
   as seções citadas nos comentários se referem a esse arquivo.
   ========================================================= */

/* ---------- Checkout ---------- */
const CHECKOUT_BASE =
  "https://checkout.cppem.com.br/pay/oferta-03";

/* Usados só quando o visitante chega sem parâmetro nenhum
   (link direto, bio, QR code). Se ele vier de um anúncio, os
   parâmetros reais da URL sempre têm prioridade. */
const UTM_FALLBACK = {
  utm_source:   "site",
  utm_medium:   "organico",
  utm_campaign: "apostila_pmpe",
  utm_content:  "cppem",
  utm_term:     "lp_apostila"
};

/* Parâmetros de origem que devem atravessar a página até o checkout. */
const PASSTHROUGH = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "gclid", "ttclid", "sck", "src", "xcod", "ref"
];

/* =========================================================
   Tracking — quem dispara a conversão

   Sem formulário, não existe mais nome/e-mail/telefone para
   mandar num send_event: ele iria com os campos vazios e
   estragaria o match do Meta. Então o site NÃO emite evento
   de conversão. Quem emite é a regra de CLIQUE do painel,
   vinculada ao id do botão do hero.

   §8.7 — send_event não aciona tag do GTM, e as tags Meta são
   tags do GTM. A regra de clique é a única via que chega nelas.
   Remover o id do botão zera a conversão.

   ⚠ O id só pode existir UMA vez na página (§8.2). Os outros
   três CTAs não carregam id e, portanto, não contam conversão.
   Para que todos contem, o painel precisa trocar a regra de id
   por regra de CLASSE, e aí a classe entra nos quatro.
   ========================================================= */
const CLICK_RULE_ID = "IPEyzyfmJhKQEYIXAlZH";

/* §7.6 — sair da página rápido demais corta o evento antes de ele
   partir. Tempo suficiente para a tag disparar, curto o bastante
   para não parecer travamento no botão de compra. */
const REDIRECT_DELAY_MS = 600;

/* =========================================================
   Utilitários
   ========================================================= */
const Store = {
  get(k)    { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); }    catch (e) {} }
};

function track(event, data) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(Object.assign({ event: event }, data || {}));
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : "";
}

/* Identificador estável do visitante. O checkout usa o mesmo valor em
   `sck` e `external_id`, o que permite casar a venda com o clique do
   anúncio mesmo quando o Meta perde o cookie. */
function visitorId() {
  const KEY = "cppem_visitor_id";
  let id = Store.get(KEY);

  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : "v-" + Date.now().toString(36) + "-" + performance.now().toString(36).replace(".", "");
    Store.set(KEY, id);
  }

  return id;
}

/* =========================================================
   Origem do tráfego

   Gravada na primeira visita e reusada depois. Sem isso, quem
   volta pelo histórico chega ao checkout sem UTM e a venda fica
   órfã — atribuída a "direto" em vez do anúncio que a gerou.
   ========================================================= */
const Origem = {
  KEY: "cppem_origem_apostila",

  capturar() {
    const url = new URLSearchParams(window.location.search);
    const atual = {};

    PASSTHROUGH.forEach((k) => {
      const v = url.get(k);
      if (v) atual[k] = v;
    });

    // chegou com parâmetro: esta visita é a origem, sobrescreve
    if (Object.keys(atual).length) {
      Store.set(this.KEY, JSON.stringify(atual));
      return atual;
    }

    // sem parâmetro: recupera o que já foi gravado
    try {
      const salvo = JSON.parse(Store.get(this.KEY) || "{}");
      if (Object.keys(salvo).length) return salvo;
    } catch (e) {}

    return Object.assign({}, UTM_FALLBACK);
  }
};

/* =========================================================
   Monta a URL do checkout
   ========================================================= */
function checkoutURL() {
  const url = new URL(CHECKOUT_BASE);
  const origem = Origem.capturar();
  const id = visitorId();

  Object.keys(origem).forEach((k) => url.searchParams.set(k, origem[k]));

  // sck / external_id: identificam esta pessoa no relatório de vendas
  if (!url.searchParams.get("sck")) url.searchParams.set("sck", id);
  url.searchParams.set("external_id", id);

  // cookies do Meta — melhoram o match da conversão do lado do servidor
  const fbp = getCookie("_fbp");
  const fbc = getCookie("_fbc");
  if (fbp) url.searchParams.set("fbp", fbp);
  if (fbc) url.searchParams.set("fbc", fbc);

  return url.toString();
}

/* =========================================================
   Clique nos CTAs → checkout
   ========================================================= */
const LABEL_ESPERA = "ABRINDO CHECKOUT...";

/* Guarda contra duplo clique: o segundo clique não pode disparar a
   regra do painel de novo nem abrir duas navegações. */
let indoParaCheckout = false;

function irParaCheckout(btn) {
  if (indoParaCheckout) return;
  indoParaCheckout = true;

  // Montada antes de qualquer espera: se algo falhar no meio, a
  // pessoa ainda chega no checkout.
  const destino = checkoutURL();

  track("iniciar_checkout", {
    valor: 59.9,
    moeda: "BRL",
    produto: "resumo_bizurado_pmpe",
    cta: (btn && btn.dataset.cta) || "desconhecido"
  });

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = LABEL_ESPERA;
  }

  setTimeout(() => { window.location.href = destino; }, REDIRECT_DELAY_MS);

  // Rede lenta ou navegação bloqueada não podem deixar o botão morto.
  setTimeout(() => {
    if (btn && btn.disabled) {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label || LABEL_ESPERA;
    }
    indoParaCheckout = false;
  }, REDIRECT_DELAY_MS + 6000);
}

document.querySelectorAll("[data-checkout]").forEach((btn) => {
  // guarda o rótulo original para poder restaurar se o redirect falhar
  btn.dataset.label = btn.innerHTML;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    irParaCheckout(btn);
  });
});

/* Diagnóstico rápido no console (§10.5): tem que devolver 1. */
window.checkoutURL = checkoutURL;
window.CLICK_RULE_ID = CLICK_RULE_ID;

/* Grava a origem já na chegada, antes que o visitante navegue e perca a query. */
Origem.capturar();
