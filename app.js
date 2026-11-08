
const express = require("express");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

app.use(express.json());
app.use(express.static("public"));
app.use("/logo", express.static(path.join(__dirname, "logo")));
app.use("/vendor/jspdf", express.static(path.join(__dirname, "node_modules", "jspdf", "dist")));

// Listar animais
app.get("/api/animais", async (req, res) => {
    try {
        const resultado = await pool.query(
            "SELECT * FROM animais ORDER BY id DESC"
        );

        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao listar animais." });
    }
});

// Cadastrar animal
app.post("/api/animais", async (req, res) => {
    const { nome, especie, raca, data_nascimento, peso } = req.body;

    if (
        typeof nome !== "string" || !nome.trim() ||
        !["Cão", "Gato", "Outro"].includes(especie)
    ) {
        return res.status(400).json({
            erro: "Informe um nome e uma espécie válida."
        });
    }

    const pesoInformado = peso === "" || peso == null
        ? null
        : Number(peso);

    if (
        pesoInformado !== null &&
        (!Number.isFinite(pesoInformado) || pesoInformado <= 0)
    ) {
        return res.status(400).json({
            erro: "O peso deve ser maior que zero."
        });
    }

    try {
        const resultado = await pool.query(
            `INSERT INTO animais
             (nome, especie, raca, data_nascimento, peso)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                nome.trim(),
                especie,
                raca?.trim() || null,
                data_nascimento || null,
                pesoInformado
            ]
        );

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao cadastrar animal." });
    }
});

// Editar animal
app.put("/api/animais/:id", async (req, res) => {
    const { nome, especie, raca, data_nascimento, peso } = req.body;
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: "ID inválido." });
    }

    if (
        typeof nome !== "string" || !nome.trim() ||
        !["Cão", "Gato", "Outro"].includes(especie)
    ) {
        return res.status(400).json({
            erro: "Informe um nome e uma espécie válida."
        });
    }

    const pesoInformado = peso === "" || peso == null
        ? null
        : Number(peso);

    if (
        pesoInformado !== null &&
        (!Number.isFinite(pesoInformado) || pesoInformado <= 0)
    ) {
        return res.status(400).json({
            erro: "O peso deve ser maior que zero."
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE animais
             SET nome = $1, especie = $2, raca = $3,
                 data_nascimento = $4, peso = $5
             WHERE id = $6
             RETURNING *`,
            [
                nome.trim(),
                especie,
                raca?.trim() || null,
                data_nascimento || null,
                pesoInformado,
                id
            ]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                erro: "Animal não encontrado."
            });
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao editar animal." });
    }
});

// Excluir animal
app.delete("/api/animais/:id", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: "ID inválido." });
    }

    try {
        const resultado = await pool.query(
            "DELETE FROM animais WHERE id = $1",
            [id]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                erro: "Animal não encontrado."
            });
        }

        res.status(204).end();
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao excluir animal." });
    }
});

// Verificar a conexão e iniciar o servidor
async function iniciar() {
    try {
        await pool.query("SELECT 1");

        app.listen(PORT, () => {
            console.log(`Site disponível em http://localhost:${PORT}`);
        });
    } catch (erro) {
        console.error("Não foi possível conectar ao PostgreSQL:", erro.message);
        process.exit(1);
    }
}

iniciar();
