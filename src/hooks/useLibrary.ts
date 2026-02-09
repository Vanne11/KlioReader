import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLibraryStore } from '@/stores/libraryStore';
import type { Book, BookMetadata } from '@/types';
import { detectBookType } from '@/lib/constants';

export function useLibrary() {
  const {
    setLibraryPath, setBooks,
    editingLocalBook, editLocalForm, setEditingLocalBook, setEditLocalForm,
  } = useLibraryStore();

  async function scanLibrary(path: string) {
    try {
      const results: [string, BookMetadata][] = await invoke("scan_directory", { dirPath: path });
      const savedRaw = localStorage.getItem("books_meta_v3");
      const progressMap = new Map();
      if (savedRaw) JSON.parse(savedRaw).forEach((b: any) => progressMap.set(b.id, b));
      const scannedBooks: Book[] = results.map(([filePath, meta]) => {
        const saved = progressMap.get(filePath);
        return {
          ...meta,
          id: filePath,
          path: filePath,
          title: saved?.title || meta.title,
          author: saved?.author || meta.author,
          description: saved?.description ?? meta.description ?? null,
          currentChapter: saved?.currentChapter || 0,
          progress: saved?.progress || 0,
          lastRead: saved?.lastRead || "Sin leer",
          type: detectBookType(filePath),
        };
      });
      setBooks(scannedBooks);
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
