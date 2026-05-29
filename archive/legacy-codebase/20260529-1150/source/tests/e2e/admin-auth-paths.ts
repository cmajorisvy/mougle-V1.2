import path from "path";

export const ADMIN_STORAGE_STATE_PATH =
  process.env.ADMIN_STORAGE_STATE_PATH ||
  path.join(process.cwd(), ".local/playwright/admin-storage-state.json");
