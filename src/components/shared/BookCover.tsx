import { BookOpen } from "lucide-react";
import { coverSrc } from "@/lib/utils";

interface BookCoverProps {
  cover: string | null | undefined;
  className?: string;
  fallbackSize?: string;
}

export function BookCover({ cover, className = "w-full h-full", fallbackSize = "w-24 h-24" }: BookCoverProps) {
  if (cover) {
    return <img src={coverSrc(cover)} className={`${className} object-contain`} alt="" />;
  }
  return (
    <div className={`${className} flex items-center justify-center opacity-10`}>
      <BookOpen className={fallbackSize} />
    </div>
  );
}
