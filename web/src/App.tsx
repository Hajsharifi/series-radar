import { Suspense, lazy } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from '@tanstack/react-query';
import { ScheduleProvider } from "./hooks/ScheduleContext";
import { NativeReminders } from "./components/NativeReminders";
import { Layout } from "./components/Layout";
import { queryClient } from "./lib/queryClient";
import { Loader } from "./components/Loader";

const RadarPage = lazy(() => import("./pages/RadarPage"));
const MoviesPage = lazy(() => import("./pages/MoviesPage"));
const BoxOfficePage = lazy(() => import("./pages/BoxOfficePage"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const ShowDetailsPage = lazy(() => import("./pages/ShowDetailsPage"));
const MovieDetailsPage = lazy(() => import("./pages/MovieDetailsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ScheduleProvider>
        <NativeReminders />
        <HashRouter>
          <Suspense fallback={<Loader />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<RadarPage />} />
                <Route path="/movies" element={<MoviesPage />} />
                <Route path="/boxoffice" element={<BoxOfficePage />} />
                <Route path="/favorites" element={<FavoritesPage />} />
                <Route path="/show/:id" element={<ShowDetailsPage />} />
                <Route path="/movie/:id" element={<MovieDetailsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </ScheduleProvider>
    </QueryClientProvider>
  );
}