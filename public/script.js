const storageKey = "compasso-pet-v1";
const petDeleteConfirmation = "Eu concordo em deletar este animal.";

function localDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function dateOffset(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return localDate(date);
}

function createId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initialState() {
    const pet = {
        id: createId(),
        name: "Luna",
        species: "Cão",
        breed: "Golden retriever",
        birthDate: dateOffset(-4 * 365 - 1),
        size: "Grande",
        sex: "Fêmea"
    };
    return {
        activePetId: pet.id,
        animals: [pet],
        records: [
            { id: createId(), petId: pet.id, type: "Peso e condição corporal", date: dateOffset(-140), weight: 18.1, bcs: "5", mcs: "Normal" },
            { id: createId(), petId: pet.id, type: "Peso e condição corporal", date: dateOffset(-100), weight: 18.2, bcs: "5", mcs: "Normal" },
            { id: createId(), petId: pet.id, type: "Peso e condição corporal", date: dateOffset(-60), weight: 18.2, bcs: "5", mcs: "Normal" },
            { id: createId(), petId: pet.id, type: "Peso e condição corporal", date: dateOffset(-20), weight: 18.4, bcs: "5", mcs: "Normal" },
            { id: createId(), petId: pet.id, type: "Alimentação", date: dateOffset(-1), description: "Ração para adulto · 240 g por dia" },
            { id: createId(), petId: pet.id, type: "Atividade física", date: localDate(), duration: 35, description: "Passeio no parque" },
            { id: createId(), petId: pet.id, type: "Consulta", date: dateOffset(-76), description: "Check-up anual · Dra. Marina" },
            { id: createId(), petId: pet.id, type: "Vacinação", date: dateOffset(-347), nextDate: dateOffset(18), description: "Antirrábica · reforço anual" }
        ]
    };
}

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved && Array.isArray(saved.animals) && Array.isArray(saved.records)) {
            saved.animals = saved.animals.map(pet => ({ ...pet, size: pet.size || "" }));
            if (!saved.animals.some(pet => pet.id === saved.activePetId)) saved.activePetId = saved.animals[0]?.id || null;
            return saved;
        }
    } catch (error) {
        console.warn("Não foi possível carregar os dados salvos.", error);
    }
    return initialState();
}

let state = loadState();
const today = localDate();
let calendarMonth = new Date();
calendarMonth.setDate(1);
let selectedCalendarDate = today;
const byId = selector => document.querySelector(selector);
const recordForm = byId("#form-registro");
const animalForm = byId("#form-animal");
const recordDialog = byId("#modal-registro");
const animalDialog = byId("#modal-animal");
const animalDeleteDialog = byId("#modal-excluir-animal");
const animalDeleteForm = byId("#form-excluir-animal");
const recordType = byId("#tipo-registro");
const historyFilter = byId("#filtro-historico");
let animalPhoto = "";
let animalPhotoPreviewUrl = "";

function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
}

function activePet() {
    return state.animals.find(pet => pet.id === state.activePetId) || state.animals[0];
}

function petRecords() {
    return state.records
        .filter(record => record.petId === state.activePetId)
        .sort((first, second) => second.date.localeCompare(first.date));
}

function formatDate(value, options = { day: "numeric", month: "short", year: "numeric" }) {
    if (!value) return "Data não informada";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", options).format(new Date(year, month - 1, day));
}

function formatAge(value) {
    if (!value) return "Idade não informada";
    const [year, month, day] = value.split("-").map(Number);
    const birth = new Date(year, month - 1, day);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (now.getDate() < birth.getDate()) months -= 1;
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    if (years < 1) return `${Math.max(months, 1)} ${months === 1 ? "mês" : "meses"}`;
    return `${years} ${years === 1 ? "ano" : "anos"}`;
}

function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function categoryClass(type) {
    const names = {
        "Peso e condição corporal": "weight",
        Alimentação: "food",
        "Atividade física": "activity",
        Vacinação: "vaccine",
        Consulta: "visit",
        Medicamento: "medicine",
        "Comportamento anormal": "behavior"
    };
    return `category-${names[type] || "other"}`;
}

function recordDescription(record) {
    if (record.type === "Comportamento anormal") {
        const kinds = {
            behavior: "Apenas comportamento diferente",
            bruise: "Hematomas",
            both: "Comportamento diferente e hematomas"
        };
        const details = [kinds[record.observationKind], record.observedAt
            ? `Percebido em ${new Intl.DateTimeFormat("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit"
            }).format(new Date(record.observedAt))}`
            : "", record.description].filter(Boolean);
        return details.join(" · ");
    }
    if (record.type === "Peso e condição corporal") {
        const values = [];
        if (record.weight) values.push(`${Number(record.weight).toLocaleString("pt-BR")} kg`);
        if (record.bcs) values.push(`BCS ${record.bcs}/9`);
        if (record.mcs) values.push(`MCS ${record.mcs}`);
        return values.join(" · ") || record.description || "Avaliação corporal";
    }
    if (record.type === "Atividade física" && record.duration) {
        return `${record.duration} min${record.description ? ` · ${record.description}` : ""}`;
    }
    return record.description || "Sem detalhes adicionais";
}

function renderRecord(record) {
    const symbols = {
        "Peso e condição corporal": "↗",
        Alimentação: "◒",
        "Atividade física": "⌁",
        Vacinação: "✳",
        Consulta: "+",
        Medicamento: "＋"
    };
    const item = node("article", "record-item");
    const icon = node("span", `record-icon ${categoryClass(record.type)}`, symbols[record.type] || "•");
    icon.setAttribute("aria-hidden", "true");
    item.append(icon);
    const summary = node("div", "record-summary");
    summary.append(node("strong", "record-type", record.type), node("span", "record-description", recordDescription(record)));
    item.append(summary);
    const date = node("time", "record-date", formatDate(record.date));
    date.dateTime = record.date;
    item.append(date);
    const actions = node("div", "record-actions");
    const editButton = node("button", "icon-button record-action", "✎");
    editButton.type = "button";
    editButton.setAttribute("aria-label", `Editar cadastro: ${record.type}`);
    editButton.title = "Editar cadastro";
    editButton.addEventListener("click", () => openRecordDialog(record.type, record));
    const deleteButton = node("button", "icon-button record-action danger-button", "×");
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Excluir cadastro: ${record.type}`);
    deleteButton.title = "Excluir cadastro";
    deleteButton.addEventListener("click", () => deleteRecord(record.id));
    actions.append(editButton, deleteButton);
    item.append(actions);
    return item;
}

function renderRecordList(container, records, emptyText) {
    container.replaceChildren();
    if (!records.length) {
        container.append(node("p", "empty-state", emptyText));
        return;
    }
    records.forEach(record => container.append(renderRecord(record)));
}

function renderPetSelector() {
    const selector = byId("#seletor-pet");
    selector.replaceChildren();
    selector.disabled = !state.animals.length;
    state.animals.forEach(pet => {
        const option = node("option", "", pet.name);
        option.value = pet.id;
        option.selected = pet.id === state.activePetId;
        selector.append(option);
    });
}

function renderPetDetails() {
    const pet = activePet();
    const details = byId("#detalhes-perfil");
    const hasPet = Boolean(pet);
    byId("#seletor-pet").hidden = !hasPet;
    byId("#btn-editar-pet").hidden = !hasPet;
    byId("#btn-excluir-pet").hidden = !hasPet;
    byId("#btn-editar-perfil").disabled = !hasPet;
    byId("#btn-excluir-perfil").disabled = !hasPet;
    byId("#btn-adicionar").disabled = !hasPet;
    byId("#btn-lembrete").disabled = !hasPet;
    byId("#btn-exportar").disabled = !hasPet;
    document.querySelector(".status-pill").hidden = !hasPet;

    if (!pet) {
        byId("#pet-nome").textContent = "Nenhum pet cadastrado";
        byId("#pet-descricao").textContent = "Adicione um pet para começar o acompanhamento.";
        byId("#pet-iniciais span").textContent = "—";
        byId("#breadcrumb-pet").textContent = "Nenhum pet";
        byId("#perfil-iniciais span").textContent = "—";
        byId("#perfil-nome").textContent = "Nenhum pet cadastrado";
        byId("#perfil-resumo").textContent = "";
        updatePetPhoto(null);
        document.querySelectorAll("[data-pet-nome]").forEach(element => element.textContent = "seu pet");
        details.replaceChildren();
        return;
    }

    const description = [pet.species, pet.breed, pet.birthDate ? formatAge(pet.birthDate) : ""]
        .filter(Boolean).join(" · ");
    const initial = pet.name.trim().charAt(0).toLocaleUpperCase("pt-BR");
    byId("#pet-nome").textContent = pet.name;
    byId("#pet-descricao").textContent = description;
    byId("#pet-iniciais span").textContent = initial;
    byId("#breadcrumb-pet").textContent = pet.name;
    byId("#perfil-iniciais span").textContent = initial;
    byId("#perfil-nome").textContent = pet.name;
    byId("#perfil-resumo").textContent = [pet.species, pet.breed].filter(Boolean).join(" · ");
    updatePetPhoto(pet);
    document.querySelectorAll("[data-pet-nome]").forEach(element => element.textContent = pet.name);

    details.replaceChildren();
    [["Espécie", pet.species || "Não informada"], ["Raça", pet.breed || "Não informada"],
        ["Nascimento", pet.birthDate ? formatDate(pet.birthDate, { day: "numeric", month: "long", year: "numeric" }) : "Não informado"],
        ["Idade", formatAge(pet.birthDate)], ["Porte", pet.size || "Não informado"],
        ["Sexo", pet.sex || "Não informado"]]
        .forEach(([label, value]) => details.append(node("dt", "", label), node("dd", "", value)));
}

function updatePetPhoto(pet) {
    [["#pet-foto", "#pet-iniciais"], ["#perfil-foto", "#perfil-iniciais"]]
        .forEach(([imageSelector, portraitSelector]) => {
            const image = byId(imageSelector);
            const portrait = byId(portraitSelector);
            const initials = portrait.querySelector("span");
            if (pet?.photo) {
                image.src = pet.photo;
                image.alt = `Foto de ${pet.name}`;
                image.hidden = false;
                initials.hidden = true;
            } else {
                image.removeAttribute("src");
                image.alt = "";
                image.hidden = true;
                initials.hidden = false;
            }
        });
}

function renderWeightChart(records) {
    const chart = byId("#grafico-peso");
    chart.replaceChildren();
    const weights = records.filter(record => record.weight)
        .sort((first, second) => first.date.localeCompare(second.date)).slice(-5);
    if (!weights.length) {
        chart.append(node("p", "empty-state", "Registre o peso para acompanhar a evolução."));
        return;
    }

    const values = weights.map(record => Number(record.weight));
    const minimum = Math.min(...values);
    const range = Math.max(...values) - minimum || Math.max(...values) * 0.08 || 1;
    const bars = node("div", "chart-bars");
    weights.forEach(record => {
        const column = node("div", "chart-column");
        column.append(node("span", "bar-value", Number(record.weight).toLocaleString("pt-BR", { maximumFractionDigits: 1 })));
        const track = node("div", "chart-bar-track");
        const bar = node("div", "chart-bar");
        bar.style.height = `${35 + ((Number(record.weight) - minimum) / range) * 55}%`;
        bar.setAttribute("aria-label", `${record.weight} kg em ${formatDate(record.date)}`);
        track.append(bar);
        column.append(track, node("span", "bar-date", formatDate(record.date, { day: "2-digit", month: "short" })));
        bars.append(column);
    });
    chart.append(bars);
}

function renderMetrics(records) {
    const latestWeight = records.find(record => record.weight);
    const previousWeight = records.filter(record => record.weight)[1];
    const condition = records.find(record => record.bcs || record.mcs);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const activityMinutes = records.reduce((total, record) => {
        if (record.type !== "Atividade física" || !record.duration) return total;
        const [year, month, day] = record.date.split("-").map(Number);
        return new Date(year, month - 1, day) >= weekStart ? total + Number(record.duration) : total;
    }, 0);

    byId("#resumo-peso").textContent = latestWeight
        ? Number(latestWeight.weight).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "--";
    byId("#variacao-peso").textContent = latestWeight
        ? previousWeight
            ? `${Number(latestWeight.weight) >= Number(previousWeight.weight) ? "+" : "−"}${Math.abs(Number(latestWeight.weight) - Number(previousWeight.weight)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg desde a pesagem anterior`
            : `Último registro em ${formatDate(latestWeight.date)}`
        : "Registre uma pesagem";
    byId("#resumo-bcs").textContent = condition?.bcs || "--";
    byId("#resumo-mcs").textContent = condition?.mcs
        ? `MCS ${condition.mcs} · ${formatDate(condition.date)}` : "MCS ainda não registrado";
    byId("#resumo-atividade").textContent = activityMinutes.toLocaleString("pt-BR");
}

function renderNextCare(records) {
    const target = byId("#proximo-cuidado");
    target.replaceChildren();
    const upcoming = records.filter(record => record.nextDate && record.nextDate >= today)
        .sort((first, second) => first.nextDate.localeCompare(second.nextDate))[0];
    if (!upcoming) {
        target.append(node("p", "empty-state", "Nenhum cuidado agendado por enquanto."));
        return;
    }
    const card = node("div", "due-card");
    card.append(node("span", "due-date", formatDate(upcoming.nextDate, { day: "numeric", month: "long" })));
    card.append(node("strong", "due-title", upcoming.description || upcoming.type));
    card.append(node("span", "due-kind", upcoming.type));
    target.append(card);
}

function calendarEntries(records) {
    return records.flatMap(record => {
        const activityTitle = record.type === "Peso e condição corporal" && record.weight
            ? `Pesagem · ${Number(record.weight).toLocaleString("pt-BR")} kg`
            : record.type === "Comportamento anormal"
                ? recordDescription(record)
                : record.description || record.type;
        const entries = [{ date: record.date, kind: "activity", title: activityTitle, record }];
        if (record.nextDate) {
            entries.push({ date: record.nextDate, kind: "reminder", title: record.description || record.type, record });
        }
        return entries;
    });
}

function renderDayAgenda(entries) {
    byId("#data-selecionada").textContent = formatDate(selectedCalendarDate, {
        weekday: "long", day: "numeric", month: "long"
    });
    const list = byId("#eventos-do-dia");
    list.replaceChildren();
    const selectedEntries = entries.filter(entry => entry.date === selectedCalendarDate);
    if (!selectedEntries.length) {
        list.append(node("p", "empty-state", "Nenhuma atividade ou lembrete neste dia."));
        return;
    }

    selectedEntries.forEach(entry => {
        const item = node("article", `agenda-entry agenda-entry-${entry.kind}`);
        item.append(node("span", "agenda-entry-kind", entry.kind === "reminder" ? "Lembrete" : "Atividade"));
        item.append(node("strong", "agenda-entry-title", entry.title));
        if (entry.kind === "activity") {
            item.append(node("span", "agenda-entry-detail", entry.record.type));
        }
        const actions = node("div", "agenda-actions");
        const editButton = node("button", "button button-outline", "Editar");
        editButton.type = "button";
        editButton.addEventListener("click", () => openRecordDialog(entry.record.type, entry.record));
        const deleteButton = node("button", "button button-outline danger-button", "Excluir");
        deleteButton.type = "button";
        deleteButton.addEventListener("click", () => entry.kind === "reminder"
            ? deleteReminder(entry.record.id)
            : deleteRecord(entry.record.id));
        actions.append(editButton, deleteButton);
        item.append(actions);
        list.append(item);
    });
}

function renderCalendar(records) {
    const entries = calendarEntries(records);
    const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
        .format(calendarMonth);
    byId("#mes-calendario").textContent = monthLabel.charAt(0).toLocaleUpperCase("pt-BR") + monthLabel.slice(1);

    const grid = byId("#grade-calendario");
    grid.replaceChildren();
    const firstOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const offset = (firstOfMonth.getDay() + 6) % 7;
    const firstCell = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1 - offset);
    const eventsByDate = new Map();
    entries.forEach(entry => {
        if (!eventsByDate.has(entry.date)) eventsByDate.set(entry.date, []);
        eventsByDate.get(entry.date).push(entry);
    });

    for (let index = 0; index < 42; index += 1) {
        const date = new Date(firstCell);
        date.setDate(firstCell.getDate() + index);
        const dateKey = localDate(date);
        const dayEntries = eventsByDate.get(dateKey) || [];
        const dayButton = node("button", "calendar-day");
        dayButton.type = "button";
        dayButton.classList.toggle("is-outside-month", date.getMonth() !== calendarMonth.getMonth());
        dayButton.classList.toggle("is-today", dateKey === today);
        dayButton.classList.toggle("is-selected", dateKey === selectedCalendarDate);
        dayButton.setAttribute("aria-pressed", String(dateKey === selectedCalendarDate));
        dayButton.setAttribute("aria-label", `${formatDate(dateKey, {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
        })}, ${dayEntries.length} ${dayEntries.length === 1 ? "evento" : "eventos"}`);
        dayButton.append(node("span", "calendar-day-number", String(date.getDate())));

        const eventStack = node("span", "calendar-day-events");
        dayEntries.slice(0, 2).forEach(entry => {
            const event = node("span", `calendar-event calendar-event-${entry.kind}`, entry.title);
            event.title = `${entry.kind === "reminder" ? "Lembrete" : "Atividade"}: ${entry.title}`;
            eventStack.append(event);
        });
        if (dayEntries.length > 2) {
            eventStack.append(node("span", "calendar-more", `+${dayEntries.length - 2} mais`));
        }
        dayButton.append(eventStack);
        dayButton.addEventListener("click", () => {
            selectedCalendarDate = dateKey;
            if (date.getMonth() !== calendarMonth.getMonth()) {
                calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
            }
            renderCalendar(records);
        });
        grid.append(dayButton);
    }

    renderDayAgenda(entries);
}

function render() {
    const records = petRecords();
    renderPetSelector();
    renderPetDetails();
    renderMetrics(records);
    renderWeightChart(records);
    renderNextCare(records);
    renderCalendar(records);
    renderRecordList(byId("#lista-recente"), records.slice(0, 4), "Nenhum cuidado registrado ainda.");
    const filter = historyFilter.value;
    const filtered = filter === "todos" ? records : records.filter(record => record.type === filter);
    renderRecordList(byId("#lista-historico"), filtered, "Nenhum registro encontrado nessa categoria.");
}

function showView(name) {
    document.querySelectorAll(".view-panel").forEach(panel => {
        const selected = panel.id === `view-${name}`;
        panel.hidden = !selected;
        panel.classList.toggle("active", selected);
    });
    document.querySelectorAll(".nav-link").forEach(button => {
        button.classList.toggle("active", button.dataset.view === name);
    });
}

function updateRecordFields() {
    const type = recordType.value;
    const isWeight = type === "Peso e condição corporal";
    const isActivity = type === "Atividade física";
    const isBehavior = type === "Comportamento anormal";
    byId("#campos-peso").hidden = !isWeight;
    byId("#campos-atividade").hidden = !isActivity;
    byId("#campos-comportamento").hidden = !isBehavior;
    byId("#campos-detalhe").hidden = isBehavior;
    byId("#data-lembrete").closest("div").hidden = isBehavior || !["Vacinação", "Consulta", "Medicamento"].includes(type);
    byId("#quando-percebido").required = isBehavior;
    byId("#tipo-observacao").required = isBehavior;
    byId("#detalhes-comportamento").required = isBehavior;

    const labels = {
        Alimentação: ["Alimento e quantidade", "Ex.: Ração para adulto · 240 g por dia"],
        "Atividade física": ["Atividade", "Ex.: Passeio no parque"],
        Vacinação: ["Vacina ou dose", "Ex.: Antirrábica · reforço anual"],
        Consulta: ["Profissional ou motivo", "Ex.: Check-up · Dra. Marina"],
        Medicamento: ["Medicamento e dose", "Ex.: Antipulgas · 1 comprimido"],
        "Peso e condição corporal": ["Observação", "Ex.: Avaliação feita na clínica"],
        "Comportamento anormal": ["Detalhes", ""]
    };
    const [label, placeholder] = labels[type];
    byId("#rotulo-descricao").textContent = label;
    byId("#descricao-registro").placeholder = placeholder;
}

function openRecordDialog(type = "Peso e condição corporal", record) {
    recordForm.reset();
    recordForm.elements.id.value = record?.id || "";
    recordForm.elements.date.value = today;
    byId("#titulo-modal-registro").textContent = record ? "Editar cadastro" : "Novo registro";
    byId("#salvar-registro").textContent = record ? "Salvar alterações" : "Salvar registro →";
    recordType.value = record?.type || type;
    if (record) {
        recordForm.elements.date.value = record.date || today;
        recordForm.elements.nextDate.value = record.nextDate || "";
        recordForm.elements.weight.value = record.weight ?? "";
        recordForm.elements.bcs.value = record.bcs || "";
        recordForm.elements.mcs.value = record.mcs || "";
        recordForm.elements.duration.value = record.duration ?? "";
        recordForm.elements.description.value = record.description || "";
        recordForm.elements.observedAt.value = record.observedAt || "";
        recordForm.elements.observationKind.value = record.observationKind || "";
        recordForm.elements.behaviorDetails.value = record.type === "Comportamento anormal"
            ? record.description || "" : "";
    }
    byId("#mensagem-registro").textContent = "";
    updateRecordFields();
    recordDialog.showModal();
}

function openAnimalDialog(pet) {
    animalForm.reset();
    animalPhoto = pet?.photo || "";
    setAnimalPhotoPreview(animalPhoto);
    byId("#remover-foto-wrap").hidden = !animalPhoto;
    byId("#mensagem-foto-animal").textContent = "";
    animalForm.elements.id.value = pet?.id || "";
    byId("#titulo-modal-animal").textContent = pet ? "Editar pet" : "Adicionar pet";
    if (pet) {
        animalForm.elements.name.value = pet.name;
        animalForm.elements.species.value = pet.species || "Cão";
        animalForm.elements.size.value = pet.size || "";
        animalForm.elements.breed.value = pet.breed || "";
        animalForm.elements.birthDate.value = pet.birthDate || "";
        animalForm.elements.sex.value = pet.sex || "";
    }
    animalDialog.showModal();
}

function setAnimalPhotoPreview(source, isTemporary = false) {
    if (animalPhotoPreviewUrl) {
        URL.revokeObjectURL(animalPhotoPreviewUrl);
    }
    animalPhotoPreviewUrl = isTemporary ? source : "";
    const preview = byId("#previa-foto-animal");
    preview.hidden = !source;
    if (source) preview.src = source;
    else preview.removeAttribute("src");
    byId("#sem-foto-animal").hidden = Boolean(source);
}

async function encodePetPhoto(file) {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
        throw new Error("Escolha um arquivo de imagem raster, como JPG, PNG ou WebP.");
    }
    if (file.size > 10 * 1024 * 1024) {
        throw new Error("A imagem deve ter no máximo 10 MB.");
    }

    const objectUrl = URL.createObjectURL(file);
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error("Não foi possível abrir esta imagem."));
            image.src = objectUrl;
        });

        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível processar esta imagem.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const photo = canvas.toDataURL("image/jpeg", 0.78);
        if (photo.length > 350_000) {
            throw new Error("A imagem ficou muito grande para salvar. Escolha uma imagem menor.");
        }
        return photo;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function openAnimalDeleteDialog(pet = activePet()) {
    if (!pet) return;
    animalDeleteForm.reset();
    animalDeleteForm.elements.id.value = pet.id;
    byId("#confirmar-exclusao-animal").disabled = true;
    byId("#mensagem-excluir-animal").textContent = "";
    animalDeleteDialog.showModal();
    byId("#confirmacao-exclusao-animal").focus();
}

function deleteRecord(id) {
    if (!window.confirm("Tem certeza que deseja deletar este cadastro?")) return;
    state.records = state.records.filter(record => record.id !== id);
    saveState();
    render();
}

function deleteReminder(id) {
    if (!window.confirm("Tem certeza que deseja deletar este cadastro?")) return;
    state.records = state.records.map(record => record.id === id
        ? { ...record, nextDate: "" }
        : record);
    saveState();
    render();
}

function saveRecord(event) {
    event.preventDefault();
    const data = new FormData(recordForm);
    const type = String(data.get("type"));
    const weight = String(data.get("weight") || "");
    const bcs = String(data.get("bcs") || "");
    const mcs = String(data.get("mcs") || "");
    const isBehavior = type === "Comportamento anormal";
    const description = String(isBehavior
        ? data.get("behaviorDetails") || ""
        : data.get("description") || "").trim();
    const observedAt = String(data.get("observedAt") || "");
    const observationKind = String(data.get("observationKind") || "");
    const feedback = byId("#mensagem-registro");

    if (type === "Peso e condição corporal" && !weight && !bcs && !mcs) {
        feedback.textContent = "Informe pelo menos peso, BCS ou MCS.";
        return;
    }
    if (type !== "Peso e condição corporal" && !description) {
        feedback.textContent = "Adicione os detalhes deste cuidado.";
        return;
    }
    if (isBehavior && (!observedAt || !observationKind)) {
        feedback.textContent = "Informe quando percebeu e o tipo de observação.";
        return;
    }

    const date = String(data.get("date"));
    const nextDate = String(data.get("nextDate") || "");
    if (nextDate && nextDate < date) {
        feedback.textContent = "O lembrete precisa ser posterior à data do registro.";
        return;
    }

    const id = String(data.get("id") || "");
    const existing = id ? state.records.find(record => record.id === id) : null;
    const updatedRecord = {
        id: existing?.id || createId(),
        petId: existing?.petId || state.activePetId,
        type,
        date,
        nextDate,
        weight: weight ? Number(weight) : null,
        bcs,
        mcs,
        duration: data.get("duration") ? Number(data.get("duration")) : null,
        description,
        observedAt: isBehavior ? observedAt : "",
        observationKind: isBehavior ? observationKind : ""
    };
    if (existing) {
        state.records = state.records.map(record => record.id === id ? updatedRecord : record);
    } else {
        state.records.push(updatedRecord);
    }
    saveState();
    render();
    recordDialog.close();
}

async function saveAnimal(event) {
    event.preventDefault();
    const data = new FormData(animalForm);
    const id = String(data.get("id") || "");
    const photoFile = data.get("photoFile");
    let photo = data.get("removePhoto") === "on" ? "" : animalPhoto;
    byId("#mensagem-foto-animal").textContent = "";
    if (photoFile instanceof File && photoFile.size > 0) {
        try {
            photo = await encodePetPhoto(photoFile);
        } catch (error) {
            byId("#mensagem-foto-animal").textContent = error.message;
            return;
        }
    }
    const pet = {
        id: id || createId(),
        name: String(data.get("name")).trim(),
        species: String(data.get("species")),
        size: String(data.get("size") || ""),
        breed: String(data.get("breed") || "").trim(),
        birthDate: String(data.get("birthDate") || ""),
        sex: String(data.get("sex") || ""),
        photo
    };
    if (id) {
        state.animals = state.animals.map(existing => existing.id === id ? pet : existing);
    } else {
        state.animals.push(pet);
    }
    state.activePetId = pet.id;
    saveState();
    render();
    animalDialog.close();
    setAnimalPhotoPreview("");
    animalPhoto = "";
}

function deleteAnimal(event) {
    event.preventDefault();
    const petId = String(animalDeleteForm.elements.id.value);
    const confirmation = String(animalDeleteForm.elements.confirmation.value);
    if (confirmation !== petDeleteConfirmation) {
        byId("#mensagem-excluir-animal").textContent = "Digite exatamente a frase solicitada para confirmar.";
        return;
    }

    state.animals = state.animals.filter(pet => pet.id !== petId);
    state.records = state.records.filter(record => record.petId !== petId);
    if (state.activePetId === petId) state.activePetId = state.animals[0]?.id || null;
    saveState();
    render();
    animalDeleteDialog.close();
}

function csvValue(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportPdf(pet, records) {
    const PdfDocument = window.jspdf?.jsPDF;
    if (!PdfDocument) {
        alert("Não foi possível preparar o PDF. Atualize a página e tente novamente.");
        return;
    }

    const pdf = new PdfDocument({ unit: "mm", format: "a4" });
    const pageWidth = 210;
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    const navy = [39, 49, 66];
    const slate = [85, 98, 112];
    const cream = [247, 239, 216];
    const sage = [200, 200, 169];
    const clay = [228, 166, 145];
    const exportDate = formatDate(today, { day: "numeric", month: "long", year: "numeric" });

    pdf.setProperties({ title: `Cuidados de ${pet.name}`, subject: "Histórico de saúde do animal" });
    pdf.setFillColor(...navy);
    pdf.rect(0, 0, pageWidth, 37, "F");
    pdf.setFillColor(...clay);
    pdf.rect(0, 37, pageWidth, 1.5, "F");
    pdf.setTextColor(...cream);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(19);
    pdf.text("Compasso Pet", margin, 15);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("Relatório de saúde e cuidados", margin, 23);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.text(`Exportado em ${exportDate}`, margin, 31);

    pdf.setFillColor(...cream);
    pdf.roundedRect(margin, 47, contentWidth, 26, 2, 2, "F");
    pdf.setTextColor(...navy);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text(pet.name, margin + 5, 57);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...slate);
    pdf.setFontSize(9);
    const profile = [pet.species, pet.breed, pet.size ? `Porte ${pet.size.toLocaleLowerCase("pt-BR")}` : "", pet.sex]
        .filter(Boolean).join("  |  ");
    pdf.text(pdf.splitTextToSize(profile || "Perfil sem detalhes adicionais", contentWidth - 10), margin + 5, 65);

    let cursorY = 84;
    pdf.setTextColor(...navy);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Histórico de cuidados", margin, cursorY);
    cursorY += 8;

    if (!records.length) {
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(...slate);
        pdf.setFontSize(10);
        pdf.text("Nenhum registro de cuidado cadastrado.", margin, cursorY + 3);
    }

    records.forEach(record => {
        const details = [recordDescription(record)];
        if (record.nextDate) {
            details.push(`Próximo lembrete: ${formatDate(record.nextDate, { day: "numeric", month: "long", year: "numeric" })}`);
        }
        const detailLines = pdf.splitTextToSize(details.join("  |  "), contentWidth - 10);
        const blockHeight = 15 + detailLines.length * 5;
        if (cursorY + blockHeight > 278) {
            pdf.addPage();
            cursorY = 20;
        }

        pdf.setDrawColor(...sage);
        pdf.setFillColor(255, 253, 248);
        pdf.roundedRect(margin, cursorY, contentWidth, blockHeight, 1.5, 1.5, "FD");
        pdf.setTextColor(...navy);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text(record.type, margin + 5, cursorY + 6);
        pdf.setTextColor(...slate);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(formatDate(record.date, { day: "numeric", month: "short", year: "numeric" }), pageWidth - margin - 5, cursorY + 6, { align: "right" });
        pdf.setFontSize(9);
        pdf.text(detailLines, margin + 5, cursorY + 12);
        cursorY += blockHeight + 3;
    });

    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setDrawColor(...sage);
        pdf.line(margin, 286, pageWidth - margin, 286);
        pdf.setTextColor(...slate);
        pdf.setFontSize(8);
        pdf.text("Compasso Pet  |  Registro para acompanhamento profissional", margin, 291);
        pdf.text(`${page} / ${pageCount}`, pageWidth - margin, 291, { align: "right" });
    }

    const fileName = pet.name.toLocaleLowerCase("pt-BR").normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
    pdf.save(`${fileName}-cuidados.pdf`);
}

function exportData() {
    const pet = activePet();
    if (!pet) {
        alert("Adicione um pet antes de exportar os dados.");
        return;
    }
    const records = petRecords();
    const format = byId("#formato-exportacao").value;

    if (format === "pdf") {
        exportPdf(pet, records);
        return;
    }

    const headings = ["Animal", "Espécie", "Raça", "Tipo de cuidado", "Data", "Peso (kg)", "BCS", "MCS", "Duração (min)", "Detalhes", "Quando percebido", "Tipo de observação", "Próximo lembrete"];
    const rows = records.map(record => [pet.name, pet.species, pet.breed, record.type, record.date, record.weight, record.bcs, record.mcs, record.duration, record.description, record.observedAt, record.observationKind, record.nextDate]);
    const contents = `\uFEFF${[headings, ...rows].map(row => row.map(csvValue).join(",")).join("\r\n")}`;

    const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const fileName = pet.name.toLocaleLowerCase("pt-BR").normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
    link.download = `${fileName}-cuidados.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.view));
});
document.querySelectorAll("[data-view-link]").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.viewLink));
});
document.querySelectorAll("[data-fechar]").forEach(button => {
    button.addEventListener("click", () => document.getElementById(button.dataset.fechar).close());
});
byId("#btn-adicionar").addEventListener("click", () => openRecordDialog());
byId("#btn-lembrete").addEventListener("click", () => openRecordDialog("Vacinação"));
byId("#btn-adicionar-pet").addEventListener("click", () => openAnimalDialog());
byId("#btn-editar-pet").addEventListener("click", () => openAnimalDialog(activePet()));
byId("#btn-editar-perfil").addEventListener("click", () => openAnimalDialog(activePet()));
byId("#btn-excluir-pet").addEventListener("click", () => openAnimalDeleteDialog());
byId("#btn-excluir-perfil").addEventListener("click", () => openAnimalDeleteDialog());
byId("#btn-exportar").addEventListener("click", exportData);
byId("#mes-anterior").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    selectedCalendarDate = localDate(calendarMonth);
    renderCalendar(petRecords());
});
byId("#proximo-mes").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    selectedCalendarDate = localDate(calendarMonth);
    renderCalendar(petRecords());
});
byId("#ir-hoje").addEventListener("click", () => {
    calendarMonth = new Date();
    calendarMonth.setDate(1);
    selectedCalendarDate = today;
    renderCalendar(petRecords());
});
recordType.addEventListener("change", updateRecordFields);
recordForm.addEventListener("submit", saveRecord);
animalForm.addEventListener("submit", saveAnimal);
byId("#foto-animal").addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    byId("#remover-foto-wrap").querySelector("input").checked = false;
    setAnimalPhotoPreview(URL.createObjectURL(file), true);
    byId("#remover-foto-wrap").hidden = !animalPhoto;
    byId("#mensagem-foto-animal").textContent = "";
});
byId("#remover-foto-wrap").querySelector("input").addEventListener("change", event => {
    setAnimalPhotoPreview(event.target.checked ? "" : animalPhoto);
});
animalDialog.addEventListener("close", () => setAnimalPhotoPreview(animalPhoto));
animalDeleteForm.addEventListener("submit", deleteAnimal);
byId("#confirmacao-exclusao-animal").addEventListener("input", event => {
    const confirmed = event.target.value === petDeleteConfirmation;
    byId("#confirmar-exclusao-animal").disabled = !confirmed;
    byId("#mensagem-excluir-animal").textContent = confirmed
        ? "" : "Digite exatamente a frase solicitada para confirmar.";
});
byId("#seletor-pet").addEventListener("change", event => {
    state.activePetId = event.target.value;
    saveState();
    render();
});
historyFilter.addEventListener("change", render);

byId("#data-hoje").textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
}).format(new Date()).toLocaleUpperCase("pt-BR");

render();
saveState();