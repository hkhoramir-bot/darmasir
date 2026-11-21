"use client";

import { create } from "zustand";
import type { CityId } from "@/lib/metro-data";

export type ScreenName =
  | "home"
  | "lines"
  | "search"
  | "settings"
  | "planner"
  | "map"
  | "status"
  | "history"
  | "alert"
  | "line-detail"
  | "station-detail";

export interface ScreenParams {
  lineId?: string;
  stationId?: string;
  fromStationId?: string;
  toStationId?: string;
  pref?: "fastest" | "least_transfers" | "quietest";
}

export interface Screen {
  name: ScreenName;
  params?: ScreenParams;
}

interface MetroState {
  booted: boolean;
  city: CityId;
  stack: Screen[];
  favorites: string[];
  alertDestination: { stationId: string; stationName: string; beforeStations: number } | null;
  setBooted: () => void;
  setCity: (c: CityId) => void;
  push: (s: Screen) => void;
  pop: () => void;
  goTab: (name: ScreenName) => void;
  setFavorites: (ids: string[]) => void;
  toggleFavoriteLocal: (id: string) => void;
  setAlertDestination: (d: MetroState["alertDestination"]) => void;
}

export const useMetro = create<MetroState>((set, get) => ({
  booted: false,
  city: "tehran",
  stack: [{ name: "home" }],
  favorites: [],
  alertDestination: null,
  setBooted: () => set({ booted: true }),
  setCity: (city) => set({ city }),
  push: (s) => set({ stack: [...get().stack, s] }),
  pop: () => {
    const st = get().stack;
    if (st.length > 1) set({ stack: st.slice(0, -1) });
  },
  goTab: (name) => set({ stack: [{ name }] }),
  setFavorites: (ids) => set({ favorites: ids }),
  toggleFavoriteLocal: (id) => {
    const favs = get().favorites;
    set({ favorites: favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id] });
  },
  setAlertDestination: (d) => set({ alertDestination: d }),
}));

/** ناوبری ساده از هر جای اپ */
export const nav = {
  go: (name: ScreenName, params?: ScreenParams) => useMetro.getState().push({ name, params }),
  tab: (name: ScreenName) => useMetro.getState().goTab(name),
  back: () => useMetro.getState().pop(),
};
