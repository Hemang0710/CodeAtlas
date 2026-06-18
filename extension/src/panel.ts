import * as vscode from "vscode";

import { askStream, type AskContext } from "./api";
import { getConfig } from "./config";

/**
 * Singleton chat webview. Renders the conversation, streams answers from the
 * server, and — the IDE-native payoff — turns `path:line` citations into
 * links that open the file at that line in the editor.
 */
export class ChatPanel {
  public static current: ChatPanel | undefined;
  private static readonly viewType = "codeatlas.chat";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  /** Aborts the in-flight stream when a new question starts or the panel closes. */
  private activeController: AbortController | undefined;

  public static createOrShow(extensionUri: vscode.Uri): ChatPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ChatPanel.current) {
      ChatPanel.current.panel.reveal(column);
      return ChatPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      ChatPanel.viewType,
      "CodeAtlas",
      column ?? vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      },
    );

    ChatPanel.current = new ChatPanel(panel, extensionUri);
    return ChatPanel.current;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (msg: { type: string; [k: string]: unknown }) => {
        if (msg.type === "ask" && typeof msg.question === "string") {
          void this.runAsk(msg.question);
        } else if (
          msg.type === "openFile" &&
          typeof msg.path === "string" &&
          typeof msg.line === "number"
        ) {
          void openCitation(msg.path, msg.line);
        }
      },
      null,
      this.disposables,
    );
  }

  /**
   * Run one question through the server and stream the answer into the panel.
   * `context` carries highlighted editor code when invoked from a selection.
   */
  public async runAsk(question: string, context?: AskContext): Promise<void> {
    const { serverUrl, repoId } = getConfig();

    if (!repoId) {
      this.post({
        type: "error",
        message:
          "No repository selected. Run “CodeAtlas: Select indexed repository” first.",
      });
      void vscode.commands.executeCommand("codeatlas.selectRepo");
      return;
    }

    // Cancel any previous in-flight stream before starting a new one.
    this.activeController?.abort();
    const controller = new AbortController();
    this.activeController = controller;

    this.post({ type: "userMessage", text: question, context: context?.filePath });
    this.post({ type: "assistantStart" });

    try {
      await askStream({
        serverUrl,
        repoId,
        question,
        context,
        signal: controller.signal,
        onDelta: (chunk) => this.post({ type: "delta", text: chunk }),
      });
      this.post({ type: "assistantEnd" });
    } catch (err) {
      if (controller.signal.aborted) return; // superseded by a newer question
      this.post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (this.activeController === controller) {
        this.activeController = undefined;
      }
    }
  }

  private post(message: Record<string, unknown>): void {
    void this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.css"),
    );
    const nonce = getNonce();

    // Strict CSP: only our nonce'd script runs, styles only from our origin.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>CodeAtlas</title>
</head>
<body>
  <div id="messages" role="log" aria-live="polite"></div>
  <form id="composer">
    <textarea id="input" rows="2" placeholder="Ask about this codebase…  (Enter to send, Shift+Enter for newline)"></textarea>
    <button id="send" type="submit">Ask</button>
  </form>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    ChatPanel.current = undefined;
    this.activeController?.abort();
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

/**
 * Open a repo-relative `path` at 1-based `line` in the editor. Tries a direct
 * join against each workspace folder first, then falls back to a workspace
 * search by relative path.
 */
async function openCitation(path: string, line: number): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    void vscode.window.showWarningMessage(
      "CodeAtlas: open a folder to jump to file citations.",
    );
    return;
  }

  for (const folder of folders) {
    const uri = vscode.Uri.joinPath(folder.uri, path);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await revealAtLine(doc, line);
      return;
    } catch {
      // Not in this folder at that path — try the next one.
    }
  }

  // Fallback: the citation path may be relative to a subdir. Search by it.
  const matches = await vscode.workspace.findFiles(
    `**/${path}`,
    "**/node_modules/**",
    1,
  );
  if (matches.length > 0) {
    const doc = await vscode.workspace.openTextDocument(matches[0]);
    await revealAtLine(doc, line);
    return;
  }

  void vscode.window.showWarningMessage(
    `CodeAtlas: couldn't find “${path}” in this workspace.`,
  );
}

async function revealAtLine(
  doc: vscode.TextDocument,
  line: number,
): Promise<void> {
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  // Citations are 1-based; VS Code positions are 0-based. Clamp into range.
  const target = Math.max(0, Math.min(line - 1, doc.lineCount - 1));
  const range = doc.lineAt(target).range;
  editor.selection = new vscode.Selection(range.start, range.start);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function getNonce(): string {
  let text = "";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
