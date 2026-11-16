"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShowDetails = getShowDetails;
exports.discoverUpcomingShows = discoverUpcomingShows;
const axios_1 = __importDefault(require("axios"));
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
function authHeaders() {
    const token = process.env.TMDB_BEARER_TOKEN;
    if (!token)
        throw new Error("TMDB_BEARER_TOKEN is not configured");
    return { Authorization: `Bearer ${token}` };
}
async function tmdbGet(path, params = {}) {
    const response = await axios_1.default.get(`${TMDB_BASE_URL}${path}`, {
        headers: authHeaders(),
        params: { language: "fa-IR", ...params },
        timeout: 15000,
    });
    return response.data;
}
function futureDate(value) {
    if (!value)
        return false;
    return value >= new Date().toISOString().slice(0, 10);
}
function normalizeDetails(details) {
    const today = new Date().toISOString().slice(0, 10);
    const futureSeasons = (details.seasons ?? [])
        .filter((season) => season.season_number > 0 && futureDate(season.air_date))
        .sort((a, b) => String(a.air_date).localeCompare(String(b.air_date)));
    const nextSeason = futureSeasons[0];
    const nextEpisodeDate = details.next_episode_to_air?.air_date ?? null;
    const nextSeasonDate = nextSeason?.air_date ?? null;
    const nextDate = nextSeasonDate ?? nextEpisodeDate ?? null;
    let category = "unknown";
    if (details.status === "Returning Series")
        category = "returning";
    else if (details.status === "Planned" || details.status === "In Production")
        category = "announced";
    else if (details.first_air_date && details.first_air_date > today)
        category = "new";
    return {
        id: details.id,
        title: details.name,
        originalTitle: details.original_name,
        overview: details.overview,
        posterPath: details.poster_path,
        status: details.status,
        category,
        nextSeasonNumber: nextSeason?.season_number ?? details.next_episode_to_air?.season_number ?? null,
        nextSeasonAirDate: nextSeasonDate,
        nextEpisodeAirDate: nextEpisodeDate,
        isDateConfirmed: Boolean(nextDate && (nextEpisodeDate || nextSeasonDate)),
        lastSyncedAt: new Date().toISOString(),
    };
}
async function getShowDetails(id) {
    const details = await tmdbGet(`/tv/${id}`);
    return normalizeDetails(details);
}
async function discoverUpcomingShows(maxPages = 2) {
    const statuses = ["0", "1", "2", "5"];
    const collected = [];
    for (const status of statuses) {
        for (let page = 1; page <= maxPages; page += 1) {
            const data = await tmdbGet("/discover/tv", {
                with_status: status,
                sort_by: "popularity.desc",
                page,
            });
            for (const item of data.results) {
                try {
                    collected.push(await getShowDetails(item.id));
                }
                catch (error) {
                    console.error(`Failed to fetch show ${item.id}`, error);
                }
            }
            if (page >= data.total_pages)
                break;
        }
    }
    const byId = new Map();
    for (const show of collected)
        byId.set(show.id, show);
    return [...byId.values()];
}
