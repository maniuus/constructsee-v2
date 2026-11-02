import { useEffect } from "react";
import { ErrorPopup } from "./components/errors/ErrorPopup";
import { RibbonBar } from "./components/shell/RibbonBar";
import { StatusBar } from "./components/shell/StatusBar";
import { TitleBar } from "./components/shell/TitleBar";
import { Workspace } from "./components/shell/Workspace";
import { PdfPreview } from "./components/pdf/PdfPreview";
import { RegionDialog } from "./components/ahsp/RegionDialog";
import { Dialogs } from "./components/dialogs/Dialogs";
import { useWbsStore } from "./store/useWbsStore";
import { useUiStore } from "./store/useUiStore";

export default function App() {
  const load = useWbsStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        useUiStore.getState().openFind();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-shell text-ink antialiased">
      <TitleBar />
      <RibbonBar />
      <Workspace />
      <PdfPreview />
      <RegionDialog />
      <Dialogs />
      <StatusBar />
      <ErrorPopup />
    </div>
  );
}
