import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { PageLoading } from "@/components/feedback/Loading";
import { AppShell } from "@/layouts/AppShell";
import { AppServicesProvider } from "@/services/app";

// Route-level code splitting keeps the shell snappy on small phones.
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const MarketsPage = lazy(() => import("@/pages/MarketsPage"));
const AnalysisPage = lazy(() => import("@/pages/AnalysisPage"));
const StrategyPage = lazy(() => import("@/pages/StrategyPage"));
const JournalPage = lazy(() => import("@/pages/JournalPage"));
const ResearchPage = lazy(() => import("@/pages/ResearchPage"));
const RiskPage = lazy(() => import("@/pages/RiskPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

export default function App() {
  return (
    <AppServicesProvider>
      <Routes>
      <Route element={<AppShell />}>
        <Route
          index
          element={
            <Suspense fallback={<PageLoading />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="markets"
          element={
            <Suspense fallback={<PageLoading />}>
              <MarketsPage />
            </Suspense>
          }
        />
        <Route
          path="analysis"
          element={
            <Suspense fallback={<PageLoading />}>
              <AnalysisPage />
            </Suspense>
          }
        />
        <Route
          path="strategy"
          element={
            <Suspense fallback={<PageLoading />}>
              <StrategyPage />
            </Suspense>
          }
        />
        <Route
          path="journal"
          element={
            <Suspense fallback={<PageLoading />}>
              <JournalPage />
            </Suspense>
          }
        />
        <Route
          path="research"
          element={
            <Suspense fallback={<PageLoading />}>
              <ResearchPage />
            </Suspense>
          }
        />
        <Route
          path="risk"
          element={
            <Suspense fallback={<PageLoading />}>
              <RiskPage />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageLoading />}>
              <SettingsPage />
            </Suspense>
          }
        />
        <Route
          path="notifications"
          element={
            <Suspense fallback={<PageLoading />}>
              <NotificationsPage />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <Suspense fallback={<PageLoading />}>
              <NotFoundPage />
            </Suspense>
          }
        />
      </Route>
      </Routes>
    </AppServicesProvider>
  );
}
