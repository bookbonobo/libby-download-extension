import { handleError, Task } from "../common";
import { addTask, LoadState, updateTask } from "../state";

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

  constructor(title: string, start: Position) {
    this.title = title;
    this.start = start;
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
    return this.partFiles.get(part)
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
  const partMap = new Map<number, URL>();
  const index: Array<ChapterBounds> = [];

  // Build chapter index
  state.chapters.forEach((chapter, idx) => {
    const path = new URL(chapter.path);
    const split = path.pathname.split("-");
    const partFile = split[split.length - 1];
    const part = partFile.split(".")[0];
    const partNumber = parseInt(part.replace(/\D/g, ""));
    partMap.set(partNumber, path);
    const position = new Position(partNumber, chapter.offset);
    index.push(new ChapterBounds(chapter.title, position));
    if (idx > 0) {
      index[idx - 1].end = position;
    }
  });
  index[index.length - 1].end = new Position(index[index.length - 1].start.part, -1);
  return new Spine(partMap, index);
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
  let zipName = `${title}_DUE_${expiration.toDateString()}.zip`;
  zipName = zipName.replace(/[/\\?%*:|"<>]/g, '-');
  const processTask = await addTask(new Task(zipName, "Downloading Zip", "Running"));
  const archive = await zip.generateAsync({ type: "blob" });
  const archiveUrl = URL.createObjectURL(archive);
  await browser.downloads.download({
    "filename": zipName,
    url: archiveUrl
  }).catch(handleError);
  await updateTask(processTask, "Completed");
  URL.revokeObjectURL(archiveUrl);
}

/**
 * Fetch and calculate duration of a part file
 *
 * @param part
 * @param url
 */
export async function fetchPart(part: number, url: URL): Promise<Uint8Array> {
  const downloadTask = await addTask(new Task(`Part${zeroPad(part)}`, "Download", "Running"));
  const response = await fetch(url);
  const content = new Uint8Array(await response.arrayBuffer());
  await updateTask(downloadTask, "Completed");
  return content
}