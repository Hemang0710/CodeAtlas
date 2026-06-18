import * as vscode from "vscode";

import { listRepos } from "./api";
import { getConfig, setRepoId } from "./config";
import { ChatPanel } from "./panel";

/**
 * Extension entry point. Registers three commands:
 *   - codeatlas.openChat           open the chat panel
 *   - codeatlas.askAboutSelection  send the current editor selection as context
 *   - codeatlas.selectRepo         pick which indexed repo to query
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("codeatlas.openChat", () => {
      ChatPanel.createOrShow(context.extensionUri);
    }),

    vscode.commands.registerCommand("codeatlas.askAboutSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        void vscode.window.showInformationMessage(
          "CodeAtlas: select some code first.",
        );
        return;
      }

      const question = await vscode.window.showInputBox({
        prompt: "What do you want to know about the selected code?",
        placeHolder: "e.g. What calls this function? Is this safe?",
      });
      if (!question) return;

      const selection = editor.document.getText(editor.selection);
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);

      const panel = ChatPanel.createOrShow(context.extensionUri);
      await panel.runAsk(question, { filePath, selection });
    }),

    vscode.commands.registerCommand("codeatlas.selectRepo", async () => {
      await pickRepo();
    }),
  );
}

/**
 * Fetch the server's indexed repos and let the user pick one. Pre-selects the
 * repo whose GitHub URL matches the workspace's git remote, when we can find
 * one, so the common case is a single Enter press.
 */
async function pickRepo(): Promise<void> {
  const { serverUrl } = getConfig();

  let repos;
  try {
    repos = await listRepos(serverUrl);
  } catch (err) {
    void vscode.window.showErrorMessage(
      `CodeAtlas: couldn't reach the server at ${serverUrl}. ${
        err instanceof Error ? err.message : ""
      }`.trim(),
    );
    return;
  }

  if (repos.length === 0) {
    void vscode.window.showInformationMessage(
      `CodeAtlas: no indexed repositories on ${serverUrl}. Index one in the web app first.`,
    );
    return;
  }

  const remote = await getWorkspaceRemoteUrl();
  const items: vscode.QuickPickItem[] = repos.map((r) => ({
    label: r.name,
    description: r.status,
    detail: r.githubUrl,
    // Surface a hint when this repo matches the open workspace's remote.
    picked: remote !== undefined && normalizeUrl(r.githubUrl) === remote,
  }));
  // Float a matched repo to the top of the list.
  items.sort((a, b) => Number(b.picked) - Number(a.picked));

  const choice = await vscode.window.showQuickPick(items, {
    title: "Select the indexed repository to query",
    placeHolder: "Pick a repo CodeAtlas has indexed",
    matchOnDetail: true,
  });
  if (!choice) return;

  const chosen = repos.find((r) => r.githubUrl === choice.detail);
  if (!chosen) return;

  await setRepoId(chosen.id);
  void vscode.window.showInformationMessage(
    `CodeAtlas: now querying ${chosen.name}.`,
  );
}

/** Best-effort read of the workspace's `origin` remote, normalized. */
async function getWorkspaceRemoteUrl(): Promise<string | undefined> {
  try {
    const gitExtension =
      vscode.extensions.getExtension<GitExtensionApi>("vscode.git");
    if (!gitExtension) return undefined;
    const api = (await gitExtension.activate()).getAPI(1);
    const repo = api.repositories[0];
    const url = repo?.state.remotes[0]?.fetchUrl;
    return url ? normalizeUrl(url) : undefined;
  } catch {
    return undefined;
  }
}

/** Reduce a clone/remote URL to `github.com/owner/repo` for comparison. */
function normalizeUrl(url: string): string {
  return url
    .trim()
    .replace(/^git@github\.com:/, "github.com/")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function deactivate(): void {
  // Nothing to clean up — ChatPanel disposes itself via onDidDispose.
}

// Minimal typing for the bits of the built-in Git extension API we touch.
interface GitExtensionApi {
  getAPI(version: 1): {
    repositories: Array<{
      state: { remotes: Array<{ fetchUrl?: string }> };
    }>;
  };
}
