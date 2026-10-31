import { useEffect } from "react";
import { ErrorPopup } from "./components/errors/ErrorPopup";
import { RibbonBar } from "./components/shell/RibbonBar";
import { StatusBar } from "./components/shell/StatusBar";
import { TitleBar } from "./components/shell/TitleBar";
import { Workspace } from "./components/shell/Workspace";
import { useWbsStore } from "./store/useWbsStore";

export default function App() {
  const load = useWbsStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-shell text-ink antialiased">
      <TitleBar />
      <RibbonBar />
      <Workspace />
      <StatusBar />
      <ErrorPopup />
    </div>
  );
}
