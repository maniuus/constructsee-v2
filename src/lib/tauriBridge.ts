import { invoke } from "@tauri-apps/api/core";
import { useErrorStore } from "../store/useErrorStore";
import { mockInvoke } from "./mockEngine";

export const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  try {
    if (!isTauriRuntime()) {
      return await mockInvoke<T>(command, args);
    }
    return await invoke<T>(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail =
      error instanceof Error
        ? error.stack
        : typeof error === "object"
          ? JSON.stringify(error, null, 2)
          : undefined;
    useErrorStore.getState().push({
      title: `IPC • ${command}`,
      message,
      detail,
    });
    return null;
  }
}
