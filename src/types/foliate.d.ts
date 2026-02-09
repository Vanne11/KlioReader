declare module 'foliate-js/view.js' {
  export class View extends HTMLElement {
    book: any;
    language: { canonical?: string; locale?: any; isCJK?: boolean; direction?: string };
    isFixedLayout: boolean;
    lastLocation: FoliateLocation | null;
    renderer: FoliatePaginator;
    history: { back(): void; forward(): void; canGoBack: boolean; canGoForward: boolean };
    open(book: File | Blob | string): Promise<void>;
    close(): void;
    init(opts: { lastLocation?: any; showTextStart?: boolean }): Promise<void>;
    goTo(target: string | number): Promise<any>;
    goToFraction(frac: number): Promise<void>;
    next(distance?: number): Promise<void>;
    prev(distance?: number): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    getCFI(index: number, range?: Range): string;
    getSectionFractions(): number[];
  }
}

interface FoliatePaginator extends HTMLElement {
  setStyles(styles: string | [string, string]): void;
  setAttribute(name: string, value: string): void;
  getContents(): Array<{ doc: Document; index: number; overlayer?: any }>;
}

interface FoliateLocation {
  fraction?: number;
  section?: number;
  tocItem?: { label?: string; href?: string };
  pageItem?: { label?: string };
  cfi?: string;
  range?: Range;
}

interface FoliateRelocateDetail {
  fraction?: number;
  section?: number;
  tocItem?: { label?: string; href?: string };
  pageItem?: { label?: string };
  cfi?: string;
  range?: Range;
}

interface FoliateLoadDetail {
  doc: Document;
  index: number;
}
