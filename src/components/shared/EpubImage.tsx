import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function EpubImage({ src, bookPath }: { src: string; bookPath: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    async function loadImg() {
      try {
        const cleanPath = src.replace(/^\.\.\//, '').replace(/^\.\//, '');
        const [bytes, mime]: [number[], string] = await invoke("read_epub_resource", { path: bookPath, resourcePath: cleanPath });
        const blob = new Blob([new Uint8Array(bytes)], { type: mime });
        objectUrl = URL.createObjectURL(blob);
        setImgUrl(objectUrl);
      } catch (e) { console.error("Error image", e); }
    }
    if (src && !src.startsWith('data:')) loadImg();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, bookPath]);

  if (!imgUrl) return <div className="h-40 w-full bg-secondary/10 animate-pulse rounded-lg my-4" />;
  return <img src={imgUrl} className="max-w-full h-auto rounded-lg my-4 shadow-md mx-auto block" alt="" />;
}
