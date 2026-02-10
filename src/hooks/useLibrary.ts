import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLibraryStore } from '@/stores/libraryStore';
import { useCollections } from './useCollections';
import type { Book, ScanResult } from '@/types';
import { detectBookType } from '@/lib/constants';

export function mapScanResults(results: ScanResult[]): Book[] {
  const savedRaw = localStorage.getItem("books_meta_v3");
  const progressMap = new Map();
  if (savedRaw) JSON.parse(savedRaw).forEach((b: any) => progressMap.set(b.id, b));

  return results.map((r) => {
    // Intentar match por path primero, luego por titulo+autor (para archivos movidos)
    let saved = progressMap.get(r.path);
    if (!saved) {
      const titleLower = r.metadata.title.toLowerCase();
      const authorLower = r.metadata.author.toLowerCase();
      for (const [, v] of progressMap) {
        if (v.title?.toLowerCase() === titleLower && v.author?.toLowerCase() === authorLower) {
          saved = v;
          break;
        }
      }
    }

    return {
      ...r.metadata,
      id: r.path,
      path: r.path,
      title: saved?.title || r.metadata.title,
      author: saved?.author || r.metadata.author,
      description: saved?.description ?? r.metadata.description ?? null,
      currentChapter: saved?.currentChapter || 0,
      progress: saved?.progress || 0,
      lastRead: saved?.lastRead || "Sin leer",
      type: detectBookType(r.path),
      subfolder: r.subfolder || null,
      inferredOrder: r.inferred_order ?? null,
      displayName: r.display_name ?? null,
    };
  });
}

export function useLibrary() {
  const {
    setLibraryPath, setBooks,
    editingLocalBook, editLocalForm, setEditingLocalBook, setEditLocalForm,
  } = useLibraryStore();
  const { detectSagasFromScan } = useCollections();

  async function scanLibrary(path: string) {
    try {
      const results: ScanResult[] = await invoke("scan_directory", { dirPath: path });
      const scannedBooks = mapScanResults(results);
      setBooks(scannedBooks);
      detectSagasFromScan(results);
    } catch (err) { console.error(err); }
  }

  async function selectLibraryFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setLibraryPath(selected);
      localStorage.setItem("libraryPath", selected);
      scanLibrary(selected);
    }
  }

  function startEditLocalBook(book: Book) {
    setEditingLocalBook(book);
    setEditLocalForm({ title: book.title, author: book.author, description: book.description || '' });
  }

  function saveLocalBookEdit() {
    if (!editingLocalBook) return;
    setBooks((prev: Book[]) => prev.map(b =>
      b.id === editingLocalBook.id
        ? { ...b, title: editLocalForm.title, author: editLocalForm.author, description: editLocalForm.description }
        : b
    ));
    setEditingLocalBook(null);
  }

  return { scanLibrary, selectLibraryFolder, startEditLocalBook, saveLocalBookEdit };
}
