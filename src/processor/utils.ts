import { Task } from "../common";
import { addTask, Chapter, LoadState, ParsedPartPath, updateTask } from "../state";

/**
 * MP3 metadata that should be added to the file
 */
export class MP3Meta {
  title: string;
  author: string;
  narrator: string;
  tags: any;

  constructor(title: string, author: string, narrator: string, tags: any) {
    this.title = title;
    this.author = author;
    this.narrator = narrator;
    this.tags = tags;
  }
}

/**
 * Position in multi-part audio stream
 */
export class Position {
  part: number;
  offset: number;

  constructor(part: number, offset: number) {
    this.part = part;
    this.offset = offset;
  }
}

/**
 * A chapter's title, starting position, and ending position
 */
export class ChapterBounds {
  title: string;
  start: Position;
  end: Position;

  constructor(title: string, start: Position, end: Position) {
    this.title = title;
    this.start = start;
    this.end = end;
  }
}

/**
 * Audiobook part locations and parsed chapter index
 */
export class Spine {
  partFiles: Map<number, URL>;
  index: Array<ChapterBounds>;

  constructor(partFiles: Map<number, URL>, index: Array<ChapterBounds>) {
    this.partFiles = partFiles;
    this.index = index;
  }

  getPartUrl(part: number): URL {
    return this.partFiles.get(part);
  }
}

/**
 * Create MP3 tags from loaded metadata
 *
 * @param state
 */
export async function getMp3Meta(state: LoadState): Promise<MP3Meta> {
  let title = state.title.title;
  if (state.title.subtitle) {
    title += `: ${state.title.subtitle}`;
  }
  if (state.title.collection) {
    title += ` (${state.title.collection})`;
  }

  const narrator = state.narrators.join(", ");
  const author = state.authors.join(", ");

  const coverResponse = await fetch(state.cover_href);
  const coverBlob = await coverResponse.blob();
  const coverType = coverBlob.type;
  const coverContent = new Buffer(await coverBlob.arrayBuffer());
  const tags = {
    "title": title,
    "album": title,
    "artist": author,
    "composer": narrator,
    "trackNumber": 1,
    "image": {
      "mime": coverType,
      "type": {
        "id": 3,
        "name": "Front Cover"
      },
      "description": state.description,
      "imageBuffer": coverContent
    },
    "validUntil": {
      "year": state.expires.getFullYear(),
      "month": state.expires.getMonth(),
      "day": state.expires.getDay()
    }
  };
  return new MP3Meta(title, author, narrator, tags);
}

/**
 * Parse Spine from loaded metadata
 *
 * @param state
 */
export function getSpine(state: LoadState): Spine {
  console.log("Building spine");
  const partMap = new Map<number, URL>();
  const index: Array<ChapterBounds> = [];

  // Build chapter index
  state.chapters.forEach((chapter, idx) => {
    console.log(`Building chapter index for ${JSON.stringify(chapter)} index ${idx}`);
    const firstUrl = new URL(chapter.paths[0]);
    const firstPart = parsePartUrl(firstUrl);
    partMap.set(firstPart, firstUrl);
    // set chapter start
    const bounds = new ChapterBounds(
      chapter.title,
      new Position(firstPart, chapter.offset),
      new Position(firstPart, -1)
    );
    console.log(`Chapter start ${JSON.stringify(bounds)}`);
    for (const path of chapter.paths.slice(1)) {
      console.log(`Adding part with path ${path}`);
      const url = new URL(path);
      const partNumber = parsePartUrl(url);
      partMap.set(partNumber, url);
      bounds.end.part = partNumber;
    }
    index.push(bounds);
    if (idx > 0) {
      // if this isn't the first chapter, set the previous chapter's end to
      // this chapters start
      index[idx - 1].end = bounds.start;
    }
  });

  return new Spine(partMap, index);
}

/**
 * Parse part number from url
 *
 * @param url
 */
function parsePartUrl(url: URL): number {
  const split = url.pathname.split("-");
  // paths have the form xxxxx-PartX.mp3, grab the part bit
  const partFile = split[split.length - 1];
  const part = partFile.split(".")[0];
  return parseInt(part.replace(/\D/g, ""));
}

/**
 * Pad a number with a leading 0 if it's < 10
 *
 * @param index
 */
export function zeroPad(index: number): string {
  if (index < 10) {
    return `0${index}`;
  } else {
    return index.toString();
  }
}

/**
 * Download zip file to browser
 *
 * @param zip Zip file object
 * @param title Audiobook title
 * @param expiration Loan expiration
 */
export async function downloadZip(zip: any, title: string, expiration: Date) {
  const zipName = cleanFilename(`${title}_DUE_${expiration.toDateString()}.zip`);
  const processTask = await addTask(new Task(zipName, "Downloading Zip", "Running"));
  const archive = await zip.generateAsync({ type: "blob" });
  const archiveUrl = URL.createObjectURL(archive);
  await browser.downloads.download({
    "filename": zipName,
    url: archiveUrl
  });
  await updateTask(processTask, "Completed");
  URL.revokeObjectURL(archiveUrl);
}

/**
 * Sanitize reserved path characters
 *
 * @param filename
 */
export function cleanFilename(filename: string): string {
  return filename.replace(/[/\\?%*:|"<>]/g, "");
}

/**
 * Parse table of contents
 *
 * @param spine Mapping of "part" identifier -> url of resource
 * @param toc TOC from api
 */
export function parseToc(spine: Map<string, string>, toc: any): Chapter[] {
  console.log(`Parsing table of contents from ${JSON.stringify(toc)}`);
  const chapters: Chapter[] = [];
  for (const row of toc) {
    const last = chapters[chapters.length - 1];
    if (last && last.title === row.title) {
      console.log(`Found contiguous chapters with the same name, merging ${row.title}`);
      if (row.contents) {
        for (const sub of row.contents) {
          const part = new ParsedPartPath(sub.path);
          const partUrl = spine.get(part.path);
          if (last.paths[last.paths.length - 1] != partUrl) {
            last.paths.push(partUrl);
          }
        }
      } else if (row.path) {
        const part = new ParsedPartPath(row.path);
        const partUrl = spine.get(part.path);
        if (last.paths[last.paths.length - 1] != partUrl) {
          last.paths.push(partUrl);
        }
      }
    } else {
      const part = new ParsedPartPath(row.path);
      const chapter = new Chapter(row.title, [spine.get(part.path)], part.offset);
      if (row.contents) {
        for (const sub of row.contents) {
          const part = new ParsedPartPath(sub.path);
          const partUrl = spine.get(part.path);
          if (chapter.paths[chapter.paths.length - 1] != partUrl) {
            chapter.paths.push(partUrl);
          }
        }
      }
      chapters.push(chapter);
    }
  }
  return chapters;
}
