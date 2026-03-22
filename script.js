let optionCount = 0;

function addOption() {
  optionCount++;

  const container = document.getElementById("optionsContainer");

  const optionDiv = document.createElement("div");
  optionDiv.className = "option";

  optionDiv.innerHTML = `
    <input placeholder="Option name (e.g. Leave Job)" class="option-title">

    <h4>Pros</h4>
    <ul class="list pros"></ul>
    <button onclick="addPoint(this, 'pros')">+ Add Pro</button>

    <h4>Cons</h4>
    <ul class="list cons"></ul>
    <button onclick="addPoint(this, 'cons')">+ Add Con</button>

    <br>
    <button class="delete-btn" onclick="this.parentElement.remove()">Delete Option</button>
  `;

  container.appendChild(optionDiv);
}

function addPoint(button, type) {
  const option = button.parentElement;
  const list = option.querySelector(`.${type}`);

  const li = document.createElement("li");

  li.innerHTML = `
    <input placeholder="${type}...">
    <button onclick="this.parentElement.remove()">X</button>
  `;

  list.appendChild(li);
}

// AI Integration
document.getElementById("aiBtn").onclick = async () => {
  const decision = document.getElementById("decision").value;
  const reflection = document.getElementById("reflection").value;

  const options = document.querySelectorAll(".option");

  let optionsText = "";

  options.forEach((opt, index) => {
    const title = opt.querySelector(".option-title").value;

    const pros = [...opt.querySelectorAll(".pros input")].map(i => i.value);
    const cons = [...opt.querySelectorAll(".cons input")].map(i => i.value);

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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    resultDiv.innerText = data.reply;

  } catch (err) {
    resultDiv.innerText = "AI Error";
  }
};