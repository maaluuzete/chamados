// Servidor sem dependências: só Node 18+.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PIN = process.env.PROG_PIN || ""; // opcional: protege o "modo programador"
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const PUBLIC = path.join(__dirname, "public");

const STATUS_RESP = {
  1: ["Estamos lendo seu chamado com muita seriedade.", "Anotado. Já abrimos 14 abas sobre isso.", "Isso é bug ou feature? Investigando."],
  2: ["Rodando… se travar, a culpa é do Wi-Fi.", "Falta só uma vírgula.", "Quase lá. Tipo, quase quase."],
  3: ["Aqui no meu computador funciona perfeitamente.", "Já testei. Tenta desligar e ligar o robô.", "Provavelmente é a bateria."],
  4: ["Pronto! Não mexe mais em nada.", "Resolvido. Foi só um ponto e vírgula.", "Feito. Pode agradecer com um lanche."],
  5: ["O código está perfeito. Verifiquem o parafuso.", "Esse motor está solto, né?", "Sem problemas no código. Chamem a mecânica."]
};

let db = { n: 1, tickets: [] };
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (e) {
  db = {
    n: 1,
    tickets: [{ id: 1, nome: "Jefer", mesa: "Mesa da mecânica", prio: "Para ontem", pedido: "Faz um código pro motor rodar a 2300RPM", s: 0, resp: "" }]
  };
}
let saving = false;
function save() {
  if (saving) return;
  saving = true;
  setTimeout(() => {
    saving = false;
    fs.writeFile(DATA_FILE, JSON.stringify(db), () => {});
  }, 200);
}

const clip = (v, n) => String(v || "").trim().slice(0, n);
const pick = (s) => {
  const l = STATUS_RESP[s];
  return l ? l[Math.floor(Math.random() * l.length)] : "";
};
const isProg = (req) => !PIN || req.headers["x-pin"] === PIN;

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 10000) req.destroy();
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (e) { resolve({}); }
    });
  });
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ico": "image/x-icon" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  if (p === "/api/config") return send(res, 200, { pin: !!PIN });
  if (p === "/api/auth" && req.method === "POST") {
    const b = await body(req);
    return send(res, b.pin === PIN ? 200 : 401, { ok: b.pin === PIN });
  }
  if (p === "/api/tickets" && req.method === "GET") return send(res, 200, db.tickets);

  if (p === "/api/tickets" && req.method === "POST") {
    const b = await body(req);
    const nome = clip(b.nome, 40), pedido = clip(b.pedido, 280);
    if (!nome || !pedido) return send(res, 400, { erro: "Preencha nome e pedido." });
    if (db.tickets.length >= 500) return send(res, 429, { erro: "Fila cheia. A programação está sobrecarregada." });
    db.n += 1;
    const t = { id: db.n, nome, mesa: clip(b.mesa, 40), prio: clip(b.prio, 40), pedido, s: 0, resp: "" };
    db.tickets.push(t);
    save();
    return send(res, 201, t);
  }

  if (p === "/api/clear" && req.method === "POST") {
    if (!isProg(req)) return send(res, 401, { erro: "Só a programação pode." });
    db.tickets = db.tickets.filter((t) => t.s < 4);
    save();
    return send(res, 200, { ok: true });
  }

  const m = p.match(/^\/api\/tickets\/(\d+)$/);
  if (m) {
    if (!isProg(req)) return send(res, 401, { erro: "Só a programação pode." });
    const id = Number(m[1]);
    const t = db.tickets.find((x) => x.id === id);
    if (!t) return send(res, 404, { erro: "Chamado não encontrado." });
    if (req.method === "DELETE") {
      db.tickets = db.tickets.filter((x) => x.id !== id);
      save();
      return send(res, 200, { ok: true });
    }
    if (req.method === "PATCH") {
      const b = await body(req);
      const s = Number(b.s);
      if (!(s >= 0 && s <= 5)) return send(res, 400, { erro: "Status inválido." });
      t.s = s;
      t.resp = pick(s);
      save();
      return send(res, 200, t);
    }
  }

  // arquivos estáticos
  let file = p === "/" ? "/index.html" : p;
  const full = path.join(PUBLIC, path.normalize(file));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Não encontrado"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log("Central de chamados rodando na porta " + PORT));
