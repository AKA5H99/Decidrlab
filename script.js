const STORAGE_KEY = "thinkclear-decisions";

document.addEventListener("DOMContentLoaded", () => {
  initIndexPage();
  initDecisionPage();
});

// -------- Dashboard (index.html) --------
function initIndexPage() {
  const listEl = document.getElementById("decisionList");
  if (!listEl) return;

  const newBtn = document.getElementById("newDecisionBtn");
  if (newBtn) newBtn.onclick = () => (window.location.href = "decision.html");

  renderDecisionList();
}

function renderDecisionList() {
  const listEl = document.getElementById("decisionList");
  const emptyState = document.getElementById("emptyState");
  if (!listEl) return;

  const decisions = getDecisions().sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  );

  listEl.innerHTML = "";

  if (!decisions.length) {
    if (emptyState) emptyState.style.display = "block";
    return;
  }
  if (emptyState) emptyState.style.display = "none";

  decisions.forEach((dec) => {
    const card = document.createElement("div");
    card.className = "decision-card";
    const summary = dec.reflection
      ? dec.reflection.slice(0, 140)
      : `${dec.options?.length || 0} option(s)`;

    card.innerHTML = `
      <div>
        <h3>${escapeHtml(dec.title || "Untitled decision")}</h3>
        <p class="muted">${escapeHtml(summary)}</p>
        <p class="muted small">Updated ${escapeHtml(formatDate(dec.updatedAt))}</p>
      </div>
      <div class="card-actions">
        <button class="ghost" data-open="${dec.id}">Open</button>
        <button class="ghost danger" data-delete="${dec.id}">Delete</button>
      </div>
    `;

    listEl.appendChild(card);
  });

  listEl.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = () => openDecision(btn.dataset.open);
  });
  listEl.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.onclick = () => {
      if (confirm("Delete this decision?")) {
        deleteDecision(btn.dataset.delete);
        renderDecisionList();
      }
    };
  });
}

function openDecision(id) {
  window.location.href = `decision.html?id=${encodeURIComponent(id)}`;
}

// -------- Decision editor (decision.html) --------
function initDecisionPage() {
  const decisionInput = document.getElementById("decision");
  if (!decisionInput) return;

  const params = new URLSearchParams(window.location.search);
  let currentId = params.get("id");

  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.onclick = () => (window.location.href = "index.html");

  const addOptionBtn = document.getElementById("addOptionBtn");
  if (addOptionBtn) addOptionBtn.onclick = () => addOption();

  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.onclick = () => {
    currentId = saveDecision(currentId);
  };

  const existing = currentId
    ? getDecisions().find((d) => d.id === currentId)
    : null;

  if (existing) {
    loadDecision(existing);
  } else {
    addOption();
  }

  setupAiHandler();
}

function loadDecision(data) {
  document.getElementById("decision").value = data.title || "";
  document.getElementById("reflection").value = data.reflection || "";

  const container = document.getElementById("optionsContainer");
  if (container) {
    container.innerHTML = "";
    (data.options || []).forEach((opt) => addOption(opt));
    if ((data.options || []).length === 0) addOption();
  }

  updateLastSaved(data.updatedAt);
}

function updateLastSaved(ts) {
  const el = document.getElementById("lastSaved");
  if (!el) return;

  if (!ts) {
    el.textContent = "Not saved yet";
    return;
  }

  el.textContent = `Last saved: ${formatDate(ts)}`;
}

// -------- AI helper --------
function setupAiHandler() {
  const aiBtn = document.getElementById("aiBtn");
  if (!aiBtn) return;

  aiBtn.onclick = async () => {
    const decision = document.getElementById("decision").value;
    const reflection = document.getElementById("reflection").value;
    const options = document.querySelectorAll(".option");

    let optionsText = "";

    options.forEach((opt, index) => {
      const title = opt.querySelector(".option-title").value;
      const pros = [...opt.querySelectorAll(".pros input")].map((i) => i.value);
      const cons = [...opt.querySelectorAll(".cons input")].map((i) => i.value);

      optionsText += `
Option ${index + 1}: ${title}
Pros:
${pros.join("\n")}
Cons:
${cons.join("\n")}
`;
    });

    const prompt = `
User Decision: ${decision}

Options:
${optionsText}

User Reflection:
${reflection}

Analyze and suggest best option with reasoning, risks and long term thinking.
`;

    const resultDiv = document.getElementById("result");
    resultDiv.innerText = "Thinking...";

    try {
      const res = await fetch("http://localhost:3000/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      resultDiv.innerText = data.reply;
    } catch (err) {
      resultDiv.innerText = "AI Error";
    }
  };
}

// -------- Options UI --------
function createPointLi(type, value = "") {
  const li = document.createElement("li");
  li.innerHTML = `
    <input placeholder="${type}..." value="${value}">
    <button type="button" onclick="this.parentElement.remove()">X</button>
  `;
  return li;
}

function addOption(prefill = {}) {
  const container = document.getElementById("optionsContainer");
  if (!container) return;

  const optionDiv = document.createElement("div");
  optionDiv.className = "option";

  optionDiv.innerHTML = `
    <input placeholder="Option name (e.g. Leave Job)" class="option-title">

    <h4>Pros</h4>
    <ul class="list pros"></ul>
    <button type="button" class="ghost" onclick="addPoint(this, 'pros')">+ Add Pro</button>

    <h4>Cons</h4>
    <ul class="list cons"></ul>
    <button type="button" class="ghost" onclick="addPoint(this, 'cons')">+ Add Con</button>

    <br>
    <button type="button" class="delete-btn" onclick="this.parentElement.remove()">Delete Option</button>
  `;

  container.appendChild(optionDiv);

  optionDiv.querySelector(".option-title").value = prefill.title || "";

  const prosList = optionDiv.querySelector(".pros");
  (prefill.pros || []).forEach((text) =>
    prosList.appendChild(createPointLi("pros", text))
  );

  const consList = optionDiv.querySelector(".cons");
  (prefill.cons || []).forEach((text) =>
    consList.appendChild(createPointLi("cons", text))
  );
}

function addPoint(button, type) {
  const option = button.parentElement;
  const list = option.querySelector("." + type);
  list.appendChild(createPointLi(type));
}

// -------- Persistence --------
function saveDecision(existingId) {
  const decisionValue = document.getElementById("decision").value.trim();
  const reflectionValue = document.getElementById("reflection").value.trim();

  const options = [...document.querySelectorAll(".option")]
    .map((opt) => ({
      title: opt.querySelector(".option-title").value.trim(),
      pros: [...opt.querySelectorAll(".pros input")]
        .map((i) => i.value.trim())
        .filter(Boolean),
      cons: [...opt.querySelectorAll(".cons input")]
        .map((i) => i.value.trim())
        .filter(Boolean),
    }))
    .filter((opt) => opt.title || opt.pros.length || opt.cons.length);

  if (!options.length) {
    options.push({ title: "", pros: [], cons: [] });
  }

  const payload = {
    id: existingId || "d-" + Date.now().toString(36),
    title: decisionValue || "Untitled decision",
    reflection: reflectionValue,
    options,
    updatedAt: new Date().toISOString(),
  };

  upsertDecision(payload);
  updateLastSaved(payload.updatedAt);

  const status = document.getElementById("saveStatus");
  if (status) {
    status.textContent = "Saved";
    setTimeout(() => (status.textContent = ""), 2000);
  }

  return payload.id;
}

function getDecisions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function upsertDecision(item) {
  const list = getDecisions();
  const idx = list.findIndex((d) => d.id === item.id);
  if (idx >= 0) {
    list[idx] = item;
  } else {
    list.push(item);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function deleteDecision(id) {
  const list = getDecisions().filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// -------- Utilities --------
function formatDate(iso) {
  if (!iso) return "just now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>\"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
