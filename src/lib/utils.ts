import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { LocalCollection, Book } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
}

export function coverSrc(cover: string | null | undefined): string | undefined {
  if (!cover) return undefined;
  return cover.startsWith('data:') ? cover : `data:image/png;base64,${cover}`;
}

export function getCollectionCoverSrc(
  collection: LocalCollection,
  books: Book[]
): string | undefined {
  if (collection.coverBase64) return coverSrc(collection.coverBase64);
  if (collection.bookEntries.length > 0) {
    const firstBookId = collection.bookEntries[0].bookId;
    const book = books.find(b => b.id === firstBookId);
    if (book?.cover) return coverSrc(book.cover);
  }
  return undefined;
}
