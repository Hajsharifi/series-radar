import { Suspense, lazy } from "react";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClientProvider } from '@tanstack/react-query';
import { ScheduleProvider } from "./hooks/ScheduleContext";
import { NativeReminders } from "./components/NativeReminders";
import { DownloadsWatchlist } from "./components/DownloadsWatchlist";
import { Layout } from "./components/Layout";
import { queryClient } from "./lib/queryClient";
import { Loader } from "./components/Loader";
import TmdbSeriesPage from "./pages/TmdbSeriesPage";
import { initTheme } from "./lib/theme";
import { useEffect } from "react";
import { migrateFavoritesToTmdb } from "./lib/favorite-migration";

initTheme();

const RadarPage = lazy(() => import("./pages/RadarPage"));
const MoviesPage = lazy(() => import("./pages/MoviesPage"));
const BoxOfficePage = lazy(() => import("./pages/BoxOfficePage"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const MovieDetailsPage = lazy(() => import("./pages/MovieDetailsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const MovieHistoryPage = lazy(() => import("./pages/MovieHistoryPage"));
const DownloadsPage = lazy(() => import("./pages/DownloadsPage"));
const PersonPage = lazy(() => import("./pages/PersonPage"));

function RedirectToTv() {
  const { id } = useParams();
  return <Navigate to={`/tv/${id ?? ""}`} replace />;
}

export default function App() {
  useEffect(() => {
    void migrateFavoritesToTmdb();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ScheduleProvider>
        <NativeReminders />
        <DownloadsWatchlist />
        <HashRouter>
          <Suspense fallback={<Loader />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<RadarPage />} />
                <Route path="/movies" element={<MoviesPage />} />
                <Route path="/boxoffice" element={<BoxOfficePage />} />
                <Route path="/favorites" element={<FavoritesPage />} />
                <Route path="/show/:id" element={<RedirectToTv />} />
                <Route path="/series/:id" element={<RedirectToTv />} />
                <Route path="/tv/:id" element={<TmdbSeriesPage />} />
                <Route path="/movie/:id" element={<MovieDetailsPage />} />
                <Route path="/person/:id" element={<PersonPage />} />
                <Route path="/settings" element={<SettingsPage />} />
<Route path="/search" element={<SearchPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/movie-history" element={<MovieHistoryPage />} />
                <Route path="/downloads" element={<DownloadsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </ScheduleProvider>
    </QueryClientProvider>
  );
}