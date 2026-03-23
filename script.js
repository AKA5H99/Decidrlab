const STORAGE_KEY = "thinkclear-decisions";
let currentDecisionId = null;
let autoSaveTimer = null;
const AUTO_SAVE_DELAY = 800;
let pendingDeleteId = null;

document.addEventListener("DOMContentLoaded", () => {
  initIndexPage();
  initDecisionPage();
});

// -------- Dashboard (index.html) --------
function initIndexPage() {
  const listEl = document.getElementById("decisionList");
  if (!listEl) return;

  const newBtn = document.getElementById("newDecisionBtn");
  if (newBtn) newBtn.onclick = openNewDecisionModal;

  setupNewDecisionModal();
  setupDeleteDecisionModal();

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
    btn.onclick = () => openDeleteDecisionModal(btn.dataset.delete);
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
  currentDecisionId = params.get("id");

  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.onclick = () => (window.location.href = "index.html");

  const addOptionBtn = document.getElementById("addOptionBtn");
  if (addOptionBtn) addOptionBtn.onclick = () => addOption();

  const refreshSummaryBtn = document.getElementById("refreshSummaryBtn");
  if (refreshSummaryBtn) refreshSummaryBtn.onclick = updateSummary;

  const existing = currentDecisionId
    ? getDecisions().find((d) => d.id === currentDecisionId)
    : null;

  if (existing) {
    loadDecision(existing);
  } else {
    addOption();
  }

  setupAiHandler();
  decisionInput.addEventListener("input", () => {
    updateSummary();
    queueAutoSave();
  });
  document.getElementById("reflection").addEventListener("input", () => {
    updateSummary();
    queueAutoSave();
  });
  updateSummary();
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
    <button type="button" onclick="removeListItem(this)">X</button>
  `;
  const input = li.querySelector("input");
  input.addEventListener("input", () => {
    updateSummary();
    queueAutoSave();
  });
  return li;
}

function addOption(prefill = {}) {
  const container = document.getElementById("optionsContainer");
  if (!container) return;

  const optionDiv = document.createElement("div");
  optionDiv.className = "option";

  optionDiv.innerHTML = `
    <input placeholder="Option title" class="option-title">

    <div class="option-split">
      <div class="option-col">
        <div class="col-header">
          <span class="col-title pros-title">Pros</span>
        </div>
        <div class="points pros-box">
          <ul class="list pros" data-placeholder="Add Pros"></ul>
          <button type="button" class="pill-btn" onclick="addPoint(this, 'pros')">+ Add Pros</button>
        </div>
      </div>

      <div class="col-divider">
        <span>&bull;</span>
      </div>

      <div class="option-col">
        <div class="col-header">
          <span class="col-title cons-title">Cons</span>
        </div>
        <div class="points cons-box">
          <ul class="list cons" data-placeholder="Add Cons"></ul>
          <button type="button" class="pill-btn danger" onclick="addPoint(this, 'cons')">+ Add Cons</button>
        </div>
      </div>
    </div>

    <div class="option-actions">
      <button type="button" class="delete-btn ghost danger" onclick="removeOption(this)">Delete Option</button>
    </div>
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

  wireOptionListeners(optionDiv);
  updateSummary();
  queueAutoSave();
}

function addPoint(button, type) {
  const option = button.parentElement;
  const list = option.querySelector("." + type);
  list.appendChild(createPointLi(type));
  updateSummary();
  queueAutoSave();
}

// -------- Persistence --------
function saveDecision(existingId = currentDecisionId) {
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

  currentDecisionId = payload.id;
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

// Delete Decision modal --------
function setupDeleteDecisionModal() {
  const modal = document.getElementById("deleteDecisionModal");
  if (!modal) return;

  const titleEl = document.getElementById("deleteDecisionTitle");
  const confirm = document.getElementById("confirmDeleteDecision");
  const cancel = document.getElementById("cancelDeleteDecision");

  const close = () => {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    pendingDeleteId = null;
    if (titleEl) titleEl.textContent = "";
  };

  confirm.onclick = () => {
    if (pendingDeleteId) {
      deleteDecision(pendingDeleteId);
      renderDecisionList();
    }
    close();
  };

  cancel.onclick = close;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (modal.classList.contains("show") && e.key === "Escape") close();
  });
}

function openDeleteDecisionModal(id) {
  const modal = document.getElementById("deleteDecisionModal");
  const titleEl = document.getElementById("deleteDecisionTitle");
  if (!modal) return;
  const decision = getDecisions().find((d) => d.id === id);
  pendingDeleteId = id;
  if (titleEl) {
    titleEl.textContent = decision?.title || "Untitled decision";
  }
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function createNewDecision(title) {
  const payload = {
    id: "d-" + Date.now().toString(36),
    title: title || "Untitled decision",
    reflection: "",
    options: [],
    updatedAt: new Date().toISOString(),
  };
  upsertDecision(payload);
  return payload.id;
}

// -------- New Decision modal --------
function setupNewDecisionModal() {
  const modal = document.getElementById("newDecisionModal");
  if (!modal) return;

  const input = document.getElementById("newDecisionInput");
  const confirm = document.getElementById("confirmNewDecision");
  const cancel = document.getElementById("cancelNewDecision");
  const error = document.getElementById("newDecisionError");

  const closeModal = () => {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    error.textContent = "";
    input.value = "";
  };

  const submit = () => {
    const title = input.value.trim();
    if (!title) {
      error.textContent = "Please enter a title.";
      input.focus();
      return;
    }
    const id = createNewDecision(title);
    closeModal();
    window.location.href = `decision.html?id=${encodeURIComponent(id)}`;
  };

  confirm.onclick = submit;
  cancel.onclick = closeModal;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      closeModal();
    }
  });
}

function openNewDecisionModal() {
  const modal = document.getElementById("newDecisionModal");
  const input = document.getElementById("newDecisionInput");
  if (!modal || !input) return;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => input.focus(), 50);
}

// -------- Summary --------
function queueAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveDecision(currentDecisionId);
  }, AUTO_SAVE_DELAY);
}

function wireOptionListeners(optionDiv) {
  const titleInput = optionDiv.querySelector(".option-title");
  if (titleInput)
    titleInput.addEventListener("input", () => {
      updateSummary();
      queueAutoSave();
    });
  optionDiv.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", () => {
      updateSummary();
      queueAutoSave();
    });
  });
}

function removeListItem(btn) {
  btn.parentElement.remove();
  updateSummary();
  queueAutoSave();
}

function removeOption(btn) {
  const option = btn.closest(".option");
  if (option) option.remove();
  updateSummary();
  queueAutoSave();
}

function updateSummary() {
  const container = document.getElementById("summaryChoices");
  const titleEl = document.getElementById("summaryDecisionTitle");
  if (!container || !titleEl) return;

  updateDecisionPreview();

  const decisionTitle =
    document.getElementById("decision")?.value.trim() || "Decision";
  titleEl.textContent = decisionTitle;

  const options = [...document.querySelectorAll(".option")]
    .map((opt) => ({
      title: opt.querySelector(".option-title")?.value.trim(),
      pros: [...opt.querySelectorAll(".pros input")]
        .map((i) => i.value.trim())
        .filter(Boolean),
      cons: [...opt.querySelectorAll(".cons input")]
        .map((i) => i.value.trim())
        .filter(Boolean),
    }))
    .filter((opt) => opt.title || opt.pros.length || opt.cons.length);

  container.innerHTML = "";

  if (!options.length) {
    container.innerHTML = '<p class="muted">Nothing to show yet.</p>';
    return;
  }

  options.forEach((opt, idx) => {
    const choice = document.createElement("div");
    choice.className = "summary-choice";

    const heading = document.createElement("h4");
    heading.className = "choice-title";
    heading.textContent = `Choice ${idx + 1}: ${opt.title || "Untitled"}`;
    choice.appendChild(heading);

    const table = document.createElement("table");
    table.className = "summary-grid";

    table.innerHTML = `
      <thead>
        <tr>
          <th>Pros</th>
          <th>Cons</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");
    const rows = Math.max(opt.pros.length, opt.cons.length, 1);
    for (let i = 0; i < rows; i++) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(opt.pros[i] || "")}</td>
        <td>${escapeHtml(opt.cons[i] || "")}</td>
      `;
      tbody.appendChild(tr);
    }

    choice.appendChild(table);
    container.appendChild(choice);
  });
}

// -------- Utilities --------
function updateDecisionPreview() {
  const preview = document.getElementById("decisionPreview");
  if (!preview) return;
  const text = document.getElementById("decision")?.value.trim();
  preview.textContent = text || "Your decision will appear here";
}

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
