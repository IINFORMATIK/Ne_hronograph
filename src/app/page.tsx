"use client";

import { useEffect, useState } from "react";
import { Shell, type TabId } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { DashboardView } from "@/views/DashboardView";
import { ScheduleView } from "@/views/ScheduleView";
import { GenerateView } from "@/views/GenerateView";
import { SubstitutionsView } from "@/views/SubstitutionsView";
import { ClassesView } from "@/views/ClassesView";
import { TeachersView } from "@/views/TeachersView";
import { RoomsView, SpecsView, SubjectsView } from "@/views/CatalogViews";
import { BellsView } from "@/views/BellsView";
import { SystemView } from "@/views/SystemView";
import { Icon } from "@/components/ui";

const TABS: TabId[] = [
  "overview",
  "schedule",
  "generate",
  "substitutions",
  "classes",
  "teachers",
  "subjects",
  "rooms",
  "specs",
  "bells",
  "settings",
  "data",
];

function tabFromHash(): TabId {
  if (typeof window === "undefined") return "overview";
  const h = window.location.hash.replace("#", "") as TabId;
  return TABS.includes(h) ? h : "overview";
}

export default function Home() {
  const { ready, state } = useStore();
  const [tab, setTab] = useState<TabId>("overview");

  useEffect(() => {
    setTab(tabFromHash());
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (next: TabId) => {
    setTab(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${next}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (!ready) {
    return (
      <div className="relative grid min-h-screen place-items-center">
        <div className="app-bg" />
        <div className="app-grid" />
        <div className="relative flex flex-col items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-amber/40 bg-amber/10 text-amber">
            <Icon name="calendar" className="spin h-7 w-7" />
          </span>
          <p className="font-display text-[13px] tracking-[0.28em] text-muted uppercase">
            Готовим базу и подбираем расписание
          </p>
          <p className="max-w-sm text-center text-[11.5px] text-dim">
            Первый запуск: загружается демо-школа и автоматически составляется сетка уроков.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Shell active={tab} onNavigate={navigate}>
      {tab === "overview" ? <DashboardView onNavigate={navigate} /> : null}
      {tab === "schedule" ? <ScheduleView /> : null}
      {tab === "generate" ? <GenerateView /> : null}
      {tab === "substitutions" ? <SubstitutionsView /> : null}
      {tab === "classes" ? <ClassesView /> : null}
      {tab === "teachers" ? <TeachersView /> : null}
      {tab === "subjects" ? <SubjectsView /> : null}
      {tab === "rooms" ? <RoomsView /> : null}
      {tab === "specs" ? <SpecsView /> : null}
      {tab === "bells" ? <BellsView /> : null}
      {tab === "settings" || tab === "data" ? <SystemView /> : null}
      {state.classes.length === 0 && tab === "overview" ? null : null}
    </Shell>
  );
}
