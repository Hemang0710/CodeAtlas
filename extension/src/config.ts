import * as vscode from "vscode";

/**
 * Thin wrapper over VS Code settings so the rest of the extension reads
 * config through one place. Settings are defined in package.json under
 * `contributes.configuration`.
 */

export interface CodeAtlasConfig {
  serverUrl: string;
  repoId: string;
}

export function getConfig(): CodeAtlasConfig {
  const cfg = vscode.workspace.getConfiguration("codeatlas");
  // Trim a trailing slash so we can always concatenate `${serverUrl}/api/...`.
  const serverUrl = (cfg.get<string>("serverUrl") ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  const repoId = cfg.get<string>("repoId") ?? "";
  return { serverUrl, repoId };
}

/**
 * Persist the chosen repo id. Prefers workspace scope (so different projects
 * can point at different indexed repos) and falls back to global when there
 * is no open workspace.
 */
export async function setRepoId(repoId: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("codeatlas");
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await cfg.update("repoId", repoId, target);
}
