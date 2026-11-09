const express = require("express");
const compression = require("compression");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// A chave publishable foi feita para ir ao navegador; a proteção dos dados é o RLS do Supabase.
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
    console.error("Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo .env.");
}

app.disable("x-powered-by");
app.use(compression());

// Configuração pública lida pelo navegador antes de criar o cliente do Supabase
app.get("/config.js", (req, res) => {
    res.type("application/javascript");
    res.set("Cache-Control", "no-cache");
    res.send(`window.AUGENDA_CONFIG = ${JSON.stringify({ supabaseUrl, supabaseKey })};`);
});

// Bibliotecas de terceiros: versão fixa no package-lock, podem ficar em cache por mais tempo
const vendorCache = { maxAge: "7d" };
app.use("/vendor/jspdf", express.static(path.join(__dirname, "node_modules", "jspdf", "dist"), vendorCache));
app.use("/vendor/supabase", express.static(path.join(__dirname, "node_modules", "@supabase", "supabase-js", "dist", "umd"), vendorCache));

// Arquivos do site: o navegador revalida HTML/JS/CSS a cada visita (respostas 304 são baratas)
app.use(express.static(path.join(__dirname, "public"), {
    setHeaders(res, filePath) {
        res.set("Cache-Control", /\.(png|jpe?g|webp|svg|ico)$/i.test(filePath)
            ? "public, max-age=86400"
            : "no-cache");
    }
}));

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Site disponível em http://localhost:${PORT}`);
    });
}

module.exports = app;
