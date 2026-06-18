// @ts-check
// Webview frontend for the CodeAtlas chat panel. Communicates with the
// extension host over postMessage. Renders streaming answers and turns
// `path:line` citations into clickable links that open the file in the editor.
(function () {
  const vscode = acquireVsCodeApi();

  const messagesEl = /** @type {HTMLElement} */ (
    document.getElementById("messages")
  );
  const form = /** @type {HTMLFormElement} */ (
    document.getElementById("composer")
  );
  const input = /** @type {HTMLTextAreaElement} */ (
    document.getElementById("input")
  );
  const sendBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("send")
  );

  /** @type {{ bodyEl: HTMLElement, raw: string } | null} */
  let currentAssistant = null;

  showEmptyState();

  function showEmptyState() {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent =
      "Ask anything about the indexed repository.\nAnswers cite path:line — click a citation to jump to it.";
    messagesEl.appendChild(p);
  }

  function clearEmptyState() {
    const empty = messagesEl.querySelector(".empty");
    if (empty) empty.remove();
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Matches `path/to/file.ts:42` and `path/to/file.ts:42-58`. Runs over text
  // that is ALREADY HTML-escaped, so injecting <span> markup here is safe.
  const CITATION_RE = /([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6}):(\d+)(?:-(\d+))?/g;

  function linkifyCitations(escapedText) {
    return escapedText.replace(CITATION_RE, (whole, path, startLine) => {
      return `<span class="citation" data-path="${path}" data-line="${startLine}">${whole}</span>`;
    });
  }

  function renderAssistant() {
    if (!currentAssistant) return;
    currentAssistant.bodyEl.innerHTML =
      linkifyCitations(escapeHtml(currentAssistant.raw)) +
      '<span class="cursor"></span>';
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, label) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;
    const roleEl = document.createElement("span");
    roleEl.className = "role";
    roleEl.textContent = label;
    const body = document.createElement("div");
    body.className = "body";
    wrap.appendChild(roleEl);
    wrap.appendChild(body);
    messagesEl.appendChild(wrap);
    scrollToBottom();
    return body;
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    input.disabled = busy;
    sendBtn.textContent = busy ? "…" : "Ask";
  }

  // --- Outgoing: user submits a question ---------------------------------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    vscode.postMessage({ type: "ask", question });
  });

  // Enter sends; Shift+Enter inserts a newline.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // Citation clicks → tell the extension to open the file.
  messagesEl.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const cite = target.closest(".citation");
    if (!cite) return;
    const path = cite.getAttribute("data-path");
    const line = Number(cite.getAttribute("data-line"));
    if (path && Number.isFinite(line)) {
      vscode.postMessage({ type: "openFile", path, line });
    }
  });

  // --- Incoming: messages from the extension host ------------------------
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "userMessage": {
        clearEmptyState();
        const body = addMessage("user", "You");
        body.textContent = msg.text;
        if (msg.context) {
          const note = document.createElement("span");
          note.className = "context-note";
          note.textContent = `context: ${msg.context}`;
          body.appendChild(note);
        }
        setBusy(true);
        break;
      }
      case "assistantStart": {
        const body = addMessage("assistant", "CodeAtlas");
        currentAssistant = { bodyEl: body, raw: "" };
        renderAssistant();
        break;
      }
      case "delta": {
        if (currentAssistant) {
          currentAssistant.raw += msg.text;
          renderAssistant();
        }
        break;
      }
      case "assistantEnd": {
        if (currentAssistant) {
          // Drop the blinking cursor now that streaming is done.
          currentAssistant.bodyEl.innerHTML = linkifyCitations(
            escapeHtml(currentAssistant.raw),
          );
          currentAssistant = null;
        }
        setBusy(false);
        break;
      }
      case "error": {
        currentAssistant = null;
        const body = addMessage("error", "Error");
        body.textContent = msg.message;
        setBusy(false);
        break;
      }
    }
  });
})();
