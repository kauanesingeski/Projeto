// Camada de dados: tudo que fala com o Supabase fica aqui.
// O restante do app trabalha com o formato antigo (name, species, petId...) e este
// arquivo converte para as colunas do banco (nome, especie, animal_id...).
(function () {
    const config = window.AUGENDA_CONFIG || {};
    if (!window.supabase?.createClient || !config.supabaseUrl || !config.supabaseKey) {
        window.db = null;
        return;
    }

    const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const BUCKET = "fotos";
    const VALIDADE_URL_FOTO = 60 * 60 * 24 * 7;
    const TAMANHO_PAGINA = 1000;
    const COLUNAS_ANIMAL = "id, nome, especie, porte, raca, data_nascimento, sexo, foto_path";
    const COLUNAS_REGISTRO = "id, animal_id, tipo, data, proxima_data, peso, bcs, mcs, duracao, descricao, percebido_em, tipo_observacao";
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let usuarioAtual = null;
    // Caminho da foto que está salvo no servidor, por animal (e "perfil")
    const caminhosFoto = new Map();
    // Última foto enviada (data URL) por item, para não reenviar a mesma imagem
    const fotosEnviadas = new Map();

    const vazioParaNulo = value => value === "" || value === undefined ? null : value;

    function verificar({ data, error }) {
        if (error) throw Object.assign(new Error(error.message || "Erro no Supabase."), { causa: error });
        return data;
    }

    function ehErroDeRede(error) {
        return !navigator.onLine || /failed to fetch|network|load failed|timeout|fetch/i.test(error?.message || "");
    }

    function uid() {
        if (!usuarioAtual) throw new Error("Sessão expirada. Entre novamente.");
        return usuarioAtual.id;
    }

    // ---------- Conversões ----------

    function animalParaBanco(pet) {
        return {
            id: pet.id,
            nome: pet.name,
            especie: pet.species,
            porte: vazioParaNulo(pet.size),
            raca: vazioParaNulo(pet.breed),
            data_nascimento: vazioParaNulo(pet.birthDate),
            sexo: vazioParaNulo(pet.sex)
        };
    }

    function animalDoBanco(row, urls) {
        return {
            id: row.id,
            name: row.nome,
            species: row.especie,
            size: row.porte || "",
            breed: row.raca || "",
            birthDate: row.data_nascimento || "",
            sex: row.sexo || "",
            photo: urls.get(row.foto_path) || ""
        };
    }

    function registroParaBanco(record) {
        return {
            id: record.id,
            animal_id: record.petId,
            tipo: record.type,
            data: record.date,
            proxima_data: vazioParaNulo(record.nextDate),
            peso: record.weight ?? null,
            bcs: record.bcs ? Number(record.bcs) : null,
            mcs: vazioParaNulo(record.mcs),
            duracao: record.duration ?? null,
            descricao: vazioParaNulo(record.description),
            percebido_em: vazioParaNulo(record.observedAt),
            tipo_observacao: vazioParaNulo(record.observationKind)
        };
    }

    function registroDoBanco(row) {
        return {
            id: row.id,
            petId: row.animal_id,
            type: row.tipo,
            date: row.data,
            nextDate: row.proxima_data || "",
            weight: row.peso == null ? null : Number(row.peso),
            bcs: row.bcs == null ? "" : String(row.bcs),
            mcs: row.mcs || "",
            duration: row.duracao,
            description: row.descricao || "",
            observedAt: row.percebido_em ? row.percebido_em.slice(0, 16) : "",
            observationKind: row.tipo_observacao || ""
        };
    }

    // ---------- Fila de gravação ----------
    // As gravações rodam uma de cada vez, na ordem em que o usuário agiu
    // (ex.: o pet é criado antes do primeiro registro dele). Falhas de rede são
    // repetidas algumas vezes antes de desistir.

    let fila = Promise.resolve();
    let pendentes = 0;

    function avisarStatus() {
        window.dispatchEvent(new CustomEvent("db:status", { detail: { pendentes } }));
    }

    async function comRetentativas(tarefa, tentativas = 4) {
        for (let tentativa = 1; ; tentativa += 1) {
            try {
                return await tarefa();
            } catch (error) {
                if (tentativa >= tentativas || !ehErroDeRede(error)) throw error;
                await new Promise(resolve => setTimeout(resolve, 700 * 2 ** (tentativa - 1)));
            }
        }
    }

    function executar(tarefa) {
        pendentes += 1;
        avisarStatus();
        const resultado = fila.then(() => comRetentativas(tarefa));
        fila = resultado.catch(() => {}).finally(() => {
            pendentes -= 1;
            avisarStatus();
        });
        return resultado;
    }

    // ---------- Fotos (Storage) ----------

    async function enviarFoto(chave, dataUrl) {
        const blob = await (await fetch(dataUrl)).blob();
        const caminho = `${uid()}/${chave}-${Date.now()}.jpg`;
        verificar(await client.storage.from(BUCKET).upload(caminho, blob, {
            contentType: "image/jpeg",
            cacheControl: "604800",
            upsert: false
        }));
        return caminho;
    }

    async function removerFoto(caminho) {
        if (!caminho) return;
        const { error } = await client.storage.from(BUCKET).remove([caminho]);
        if (error) console.warn("Não foi possível remover a foto antiga.", error);
    }

    // Decide o caminho final da foto: mantém, troca (envia a nova) ou remove.
    async function resolverFoto(chave, foto) {
        const anterior = caminhosFoto.get(chave) || null;
        let caminho = anterior;
        if (!foto) {
            caminho = null;
        } else if (foto.startsWith("data:") && fotosEnviadas.get(chave) !== foto) {
            caminho = await enviarFoto(chave, foto);
            fotosEnviadas.set(chave, foto);
        }
        return { caminho, anterior };
    }

    async function urlsAssinadas(caminhos) {
        const unicos = [...new Set(caminhos.filter(Boolean))];
        if (!unicos.length) return new Map();
        const { data, error } = await client.storage.from(BUCKET).createSignedUrls(unicos, VALIDADE_URL_FOTO);
        if (error) {
            console.warn("Não foi possível carregar as fotos.", error);
            return new Map();
        }
        return new Map(data.filter(item => item.signedUrl).map(item => [item.path, item.signedUrl]));
    }

    // ---------- Leitura ----------

    async function buscarTodos(criarConsulta) {
        const linhas = [];
        for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
            const pagina = verificar(await criarConsulta().range(inicio, inicio + TAMANHO_PAGINA - 1));
            linhas.push(...pagina);
            if (pagina.length < TAMANHO_PAGINA) return linhas;
        }
    }

    async function carregar() {
        const id = uid();
        const [perfilResposta, animais, registros] = await comRetentativas(() => Promise.all([
            client.from("perfis").select("nome, sobrenome, data_nascimento, foto_path").eq("id", id).maybeSingle(),
            buscarTodos(() => client.from("animais").select(COLUNAS_ANIMAL).order("criado_em").order("id")),
            buscarTodos(() => client.from("registros").select(COLUNAS_REGISTRO).order("data", { ascending: false }).order("id"))
        ]));
        const perfil = verificar(perfilResposta);

        caminhosFoto.clear();
        fotosEnviadas.clear();
        animais.forEach(row => caminhosFoto.set(`animal-${row.id}`, row.foto_path));
        caminhosFoto.set("perfil", perfil?.foto_path || null);
        const urls = await urlsAssinadas([perfil?.foto_path, ...animais.map(row => row.foto_path)]);

        return {
            profile: {
                name: perfil?.nome || "",
                surname: perfil?.sobrenome || "",
                birthDate: perfil?.data_nascimento || "",
                photo: urls.get(perfil?.foto_path) || ""
            },
            animals: animais.map(row => animalDoBanco(row, urls)),
            records: registros.map(registroDoBanco)
        };
    }

    // ---------- Gravação ----------

    async function salvarAnimal(pet) {
        const chave = `animal-${pet.id}`;
        const { caminho, anterior } = await resolverFoto(chave, pet.photo);
        verificar(await client.from("animais").upsert({ ...animalParaBanco(pet), foto_path: caminho }));
        caminhosFoto.set(chave, caminho);
        if (anterior && anterior !== caminho) await removerFoto(anterior);
    }

    async function excluirAnimal(id) {
        const chave = `animal-${id}`;
        verificar(await client.from("animais").delete().eq("id", id));
        await removerFoto(caminhosFoto.get(chave));
        caminhosFoto.delete(chave);
        fotosEnviadas.delete(chave);
    }

    async function salvarRegistro(record) {
        verificar(await client.from("registros").upsert(registroParaBanco(record)));
    }

    async function excluirRegistro(id) {
        verificar(await client.from("registros").delete().eq("id", id));
    }

    async function salvarPerfil(profile) {
        const { caminho, anterior } = await resolverFoto("perfil", profile.photo);
        verificar(await client.from("perfis").upsert({
            id: uid(),
            nome: profile.name,
            sobrenome: profile.surname,
            data_nascimento: vazioParaNulo(profile.birthDate),
            foto_path: caminho,
            atualizado_em: new Date().toISOString()
        }));
        caminhosFoto.set("perfil", caminho);
        if (anterior && anterior !== caminho) await removerFoto(anterior);
    }

    // Envia para a conta os dados que estavam só no localStorage deste navegador.
    async function importarDadosLocais(local) {
        const novosIds = new Map();
        const idValido = id => {
            if (UUID.test(id)) return id;
            if (!novosIds.has(id)) novosIds.set(id, crypto.randomUUID());
            return novosIds.get(id);
        };

        for (const pet of local.animals) {
            await salvarAnimal({ ...pet, id: idValido(pet.id) });
        }
        const petsImportados = new Set(local.animals.map(pet => idValido(pet.id)));
        const registros = local.records
            .map(record => ({ ...record, id: idValido(record.id), petId: idValido(record.petId) }))
            .filter(record => petsImportados.has(record.petId))
            .map(registroParaBanco);
        for (let inicio = 0; inicio < registros.length; inicio += 500) {
            verificar(await client.from("registros").upsert(registros.slice(inicio, inicio + 500)));
        }
        if (local.profile && (local.profile.name || local.profile.surname || local.profile.photo)) {
            await salvarPerfil(local.profile);
        }
    }

    // ---------- Autenticação ----------

    function traduzirErroAuth(error) {
        const mensagem = error?.message || "";
        if (/invalid login credentials/i.test(mensagem)) return "E-mail ou senha incorretos.";
        if (/email not confirmed/i.test(mensagem)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
        if (/already registered|already exists/i.test(mensagem)) return "Este e-mail já tem cadastro. Use a opção Entrar.";
        if (/password should be at least|weak password/i.test(mensagem)) return "A senha precisa ter pelo menos 6 caracteres.";
        if (/rate limit|too many/i.test(mensagem)) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
        if (ehErroDeRede(error)) return "Sem conexão com o servidor. Verifique sua internet.";
        return mensagem || "Não foi possível concluir. Tente novamente.";
    }

    async function entrar(email, senha) {
        const { error } = await client.auth.signInWithPassword({ email, password: senha });
        if (error) throw new Error(traduzirErroAuth(error));
    }

    async function cadastrar(email, senha) {
        const { data, error } = await client.auth.signUp({
            email,
            password: senha,
            options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw new Error(traduzirErroAuth(error));
        return { precisaConfirmar: !data.session };
    }

    async function recuperarSenha(email) {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw new Error(traduzirErroAuth(error));
    }

    async function atualizarSenha(senha) {
        const { error } = await client.auth.updateUser({ password: senha });
        if (error) throw new Error(traduzirErroAuth(error));
    }

    async function sair() {
        await client.auth.signOut();
    }

    function aoMudarSessao(callback) {
        client.auth.onAuthStateChange((evento, sessao) => {
            usuarioAtual = sessao?.user || null;
            // Não chamar o Supabase dentro deste callback (pode travar); adiar para o próximo ciclo.
            setTimeout(() => callback(evento, sessao), 0);
        });
    }

    window.db = {
        executar,
        carregar,
        salvarAnimal,
        excluirAnimal,
        salvarRegistro,
        excluirRegistro,
        salvarPerfil,
        importarDadosLocais,
        entrar,
        cadastrar,
        recuperarSenha,
        atualizarSenha,
        sair,
        aoMudarSessao,
        ehErroDeRede
    };
})();
