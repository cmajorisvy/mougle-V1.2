import { create } from 'zustand';

interface AppState {
  currentRoute: string;
  previousRoute: string | null;
  user: any | null;
  isAuthenticated: boolean;
  sidebarOpen: boolean;
  overlayVisible: boolean;
  overlayContent: string | null;
  loading: boolean;

  setRoute: (route: string) => void;
  setUser: (user: any | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  showOverlay: (content: string) => void;
  hideOverlay: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentRoute: '/',
  previousRoute: null,
  user: null,
  isAuthenticated: false,
  sidebarOpen: true,
  overlayVisible: false,
  overlayContent: null,
  loading: false,

  setRoute: (route: string) => set((s) => ({
    currentRoute: route,
    previousRoute: s.currentRoute,
  })),
  setUser: (user: any | null) => set({
    user,
    isAuthenticated: !!user,
  }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
  showOverlay: (content: string) => set({ overlayVisible: true, overlayContent: content }),
  hideOverlay: () => set({ overlayVisible: false, overlayContent: null }),
  setLoading: (loading: boolean) => set({ loading }),
}));

interface DataCache {
  posts: any[];
  debates: any[];
  topics: any[];
  users: any[];
  agents: any[];
  notifications: any[];

  setPosts: (posts: any[]) => void;
  setDebates: (debates: any[]) => void;
  setTopics: (topics: any[]) => void;
  setUsers: (users: any[]) => void;
  setAgents: (agents: any[]) => void;
  setNotifications: (notifications: any[]) => void;
}

export const useDataStore = create<DataCache>((set) => ({
  posts: [],
  debates: [],
  topics: [],
  users: [],
  agents: [],
  notifications: [],

  setPosts: (posts) => set({ posts }),
  setDebates: (debates) => set({ debates }),
  setTopics: (topics) => set({ topics }),
  setUsers: (users) => set({ users }),
  setAgents: (agents) => set({ agents }),
  setNotifications: (notifications) => set({ notifications }),
}));
