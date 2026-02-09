export interface CoverSearchResult {
  title: string;
  author: string;
  coverId: number;
  coverUrlM: string;
  coverUrlL: string;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function imageUrlToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

export async function searchOpenLibraryCovers(query: string): Promise<CoverSearchResult[]> {
  const encoded = encodeURIComponent(query.trim());
  const res = await fetch(
    `https://openlibrary.org/search.json?q=${encoded}&limit=12&fields=key,title,author_name,cover_i`
  );
  if (!res.ok) throw new Error("Open Library search failed");

  const data = await res.json();
  const results: CoverSearchResult[] = [];

  for (const doc of data.docs || []) {
    if (!doc.cover_i) continue;
    results.push({
      title: doc.title || "Sin título",
      author: doc.author_name?.[0] || "Desconocido",
      coverId: doc.cover_i,
      coverUrlM: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
      coverUrlL: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
    });
  }

  return results;
}
