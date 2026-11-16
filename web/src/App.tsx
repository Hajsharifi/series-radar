import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ScheduleProvider } from "./hooks/ScheduleContext";
import { NativeReminders } from "./components/NativeReminders";
import { Layout } from "./components/Layout";
import { RadarPage } from "./pages/RadarPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { ShowDetailsPage } from "./pages/ShowDetailsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MoviesPage } from "./pages/MoviesPage";
import { MovieDetailsPage } from "./pages/MovieDetailsPage";
import { BoxOfficePage } from "./pages/BoxOfficePage";

export default function App() {
  return (
    <ScheduleProvider>
      <NativeReminders />
      <HashRouter>
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
      </HashRouter>
    </ScheduleProvider>
  );
}