// KlioReader API Client
// Conecta la app de escritorio con el backend PHP

const API_URL = localStorage.getItem("apiUrl") || "http://localhost:8000";

function getToken(): string | null {
  return localStorage.getItem("authToken");
}

function setToken(token: string): void {
  localStorage.setItem("authToken", token);
}

export function clearAuth(): void {
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUser");
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem("authUser");
  return raw ? JSON.parse(raw) : null;
}

export function setApiUrl(url: string): void {
  localStorage.setItem("apiUrl", url.replace(/\/+$/, ""));
  window.location.reload();
}

export function getApiUrl(): string {
  return localStorage.getItem("apiUrl") || "http://localhost:8000";
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets boundary automatically)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearAuth();
    throw new Error("Sesión expirada");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }

  // Handle binary responses (downloads)
  const contentType = res.headers.get("Content-Type") || "";
  if (contentType.includes("application/pdf") || contentType.includes("epub")) {
    return res.blob() as unknown as T;
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error(`[API] Respuesta no-JSON de ${endpoint}:`, text.substring(0, 500));
    throw new Error(`Respuesta inválida del servidor (${res.status})`);
  }
}

// ── Types ──

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  xp?: number;
  level?: number;
  streak?: number;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface CloudBook {
  id: number;
  title: string;
  author: string;
  file_name: string;
  file_type: "epub" | "pdf";
  file_size: number;
  total_chapters: number;
  description: string | null;
  cover_base64: string | null;
  current_chapter: number;
  current_page: number;
  progress_percent: number;
  last_read: string | null;
  created_at: string;
}

export interface UserProfile extends AuthUser {
  avatar: string | null;
  selected_title_id: string | null;
  total_books: number;
  total_notes: number;
  total_bookmarks: number;
  created_at: string;
}

export interface Note {
  id: number;
  book_id: number;
  chapter_index: number;
  content: string;
  highlight_text: string | null;
  color: string;
  created_at: string;
}

export interface Bookmark {
  id: number;
  book_id: number;
  chapter_index: number;
  page_index: number;
  label: string;
  created_at: string;
}

export interface UserStats {
  xp: number;
  level: number;
  streak: number;
  last_streak_date: string | null;
}

export interface CheckHashResponse {
  exists: boolean;
  file_size?: number;
  file_type?: string;
}

export interface UploadResponse {
  id: number;
  title: string;
  author: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_type: string;
  deduplicated: boolean;
  progress_restored: boolean;
  restored_progress_percent?: number;
}

// ── Auth ──

export async function register(
  username: string,
  email: string,
  password: string
): Promise<AuthUser> {
  const res = await request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
  setToken(res.token);
  localStorage.setItem("authUser", JSON.stringify(res.user));
  return res.user;
}

export async function login(
  login: string,
  password: string
): Promise<AuthUser> {
  const res = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ login, password }),
  });
  setToken(res.token);
  localStorage.setItem("authUser", JSON.stringify(res.user));
  return res.user;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ── User ──

export async function getProfile(): Promise<UserProfile> {
  return request<UserProfile>("/api/user/profile");
}

export async function updateProfile(
  data: Partial<{ username: string; email: string; password: string; avatar: string; selected_title_id: string | null }>
): Promise<void> {
  await request("/api/user/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getStats(): Promise<UserStats> {
  return request<UserStats>("/api/user/stats");
}

export async function syncStats(stats: UserStats): Promise<void> {
  await request("/api/user/stats", {
    method: "PUT",
    body: JSON.stringify(stats),
  });
}

// ── Books ──

export async function listBooks(): Promise<CloudBook[]> {
  return request<CloudBook[]>("/api/books");
}

export async function getBook(id: number): Promise<CloudBook> {
  return request<CloudBook>(`/api/books/${id}`);
}

export async function checkHash(md5: string): Promise<CheckHashResponse> {
  return request<CheckHashResponse>("/api/books/check-hash", {
    method: "POST",
    body: JSON.stringify({ md5 }),
  });
}

export async function uploadBook(
  file: File | null,
  metadata?: { title?: string; author?: string; total_chapters?: number; cover_base64?: string; description?: string; file_hash?: string }
): Promise<UploadResponse> {
  const form = new FormData();
  if (file) form.append("file", file);
  if (metadata?.file_hash) form.append("file_hash", metadata.file_hash);
  if (metadata?.title) form.append("title", metadata.title);
  if (metadata?.author) form.append("author", metadata.author);
  if (metadata?.total_chapters) form.append("total_chapters", String(metadata.total_chapters));
  if (metadata?.cover_base64) form.append("cover_base64", metadata.cover_base64);
  if (metadata?.description) form.append("description", metadata.description);

  return request<UploadResponse>("/api/books/upload", {
    method: "POST",
    body: form,
  });
}

export async function deleteAccount(): Promise<void> {
  await request("/api/user/delete", { method: "DELETE" });
}

export async function downloadBook(id: number): Promise<Blob> {
  return request<Blob>(`/api/books/${id}/download`);
}

export async function updateBook(
  id: number,
  data: Partial<{ title: string; author: string; description: string; cover_base64: string; total_chapters: number }>
): Promise<void> {
  await request(`/api/books/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteBook(id: number): Promise<void> {
  await request(`/api/books/${id}`, { method: "DELETE" });
}

// ── Reading Progress ──

export async function getProgress(bookId: number) {
  return request<{ current_chapter: number; current_page: number; progress_percent: number }>(
    `/api/books/${bookId}/progress`
  );
}

export async function syncProgress(
  bookId: number,
  data: { current_chapter: number; current_page: number; progress_percent: number }
): Promise<void> {
  await request(`/api/books/${bookId}/progress`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Notes ──

export async function getNotes(bookId: number): Promise<Note[]> {
  return request<Note[]>(`/api/books/${bookId}/notes`);
}

export async function addNote(
  bookId: number,
  data: { chapter_index: number; content: string; highlight_text?: string; color?: string }
): Promise<{ id: number }> {
  return request(`/api/books/${bookId}/notes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteNote(noteId: number): Promise<void> {
  await request(`/api/notes/${noteId}`, { method: "DELETE" });
}

// ── Bookmarks ──

export async function getBookmarks(bookId: number): Promise<Bookmark[]> {
  return request<Bookmark[]>(`/api/books/${bookId}/bookmarks`);
}

export async function addBookmark(
  bookId: number,
  data: { chapter_index: number; page_index: number; label?: string }
): Promise<{ id: number }> {
  return request(`/api/books/${bookId}/bookmarks`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteBookmark(bookmarkId: number): Promise<void> {
  await request(`/api/bookmarks/${bookmarkId}`, { method: "DELETE" });
}
