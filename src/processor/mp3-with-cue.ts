import { downloadZip, fetchPart, getMp3Meta, getSpine, zeroPad } from "./utils";
import { parseBuffer } from "music-metadata";
import JSZip from "jszip";
import NodeID3 from "node-id3";
import { LoadState } from "../state";

/**
 * Fetch Audiobook as a single merged MP3 file with a .cue file
 * providing chapter metadata
 *
 * @param state
 */
export async function mp3WithCUE(state: LoadState) {
  const mp3Meta = await getMp3Meta(state);
  const spine = await getSpine(state);
  const zip = new JSZip();
  const folder = zip.folder(mp3Meta.title);
  let cueContent = `TITLE "${mp3Meta.title}"
FILE "${mp3Meta.title}.mp3" MP3`;

  const parts = [];

  // Download first part
  let offset = 0;
  let current = await fetchPartWithDuration(spine.index[0].start.part, spine.getPartUrl(spine.index[0].start.part));
  parts.push(current.content);
  const mp3Chapters = [];

  // Iterate chapters, downloading parts and emitting cue file entries
  // along the way
  for (const entry of spine.index) {
    const idx = spine.index.indexOf(entry);
    if (entry.start.part > current.part) {
      offset += current.duration;
      current = await fetchPartWithDuration(entry.start.part, spine.getPartUrl(entry.start.part));
      parts.push(current.content);
    }

    const currentOffset = offset + entry.start.offset;
    const currentOffsetMs = Math.round(currentOffset * 1000);
    if (idx > 0) {
      mp3Chapters[idx - 1].endTimeMs = currentOffsetMs;
      console.log(mp3Chapters[idx - 1]);
    }
    mp3Chapters[idx] = new MP3Chapter(entry.title, currentOffsetMs);
    cueContent += `
  TRACK ${zeroPad(idx + 1)} AUDIO
    TITLE "${entry.title}"
    INDEX 01 ${toTime(false, Math.round(currentOffset))}`;
  }

  // If the last chapter spans a part boundary, have to fetch the last one too
  const endPart = spine.index[spine.index.length - 1].end.part;
  if (parts.length < endPart) {
    current = await fetchPartWithDuration(endPart, spine.partFiles.get(endPart));
    parts.push(current.content);
  }

  mp3Chapters[spine.index.length - 1].endTimeMs = Math.round((offset + current.duration) * 1000);
  console.log(mp3Chapters[spine.index.length - 1]);

  // Append chapters id3 tag
  mp3Meta.tags["chapter"] = mp3Chapters;
  // Merge parts into a single file
  const mergedContent = new Uint8Array(await new Response(new Blob(parts)).arrayBuffer());
  // Tag it with parsed metadata
  const tagged = NodeID3.update(mp3Meta.tags, <Buffer>mergedContent);

  // Add both files to the zip and download
  folder.file(`${mp3Meta.title}.cue`, cueContent);
  folder.file(`${mp3Meta.title}.mp3`, tagged.buffer);
  await downloadZip(zip, mp3Meta.title, state.expires);
}

class MP3Chapter {
  elementID: string;
  startTimeMs: number;
  endTimeMs: number;

  constructor(elementID: string, startTimeMs: number) {
    this.elementID = elementID;
    this.startTimeMs = startTimeMs;
  }
}

/**
 * Part number, mp3 file content, and calculated duration
 */
class FetchResult {
  part: number;
  content: Uint8Array;
  duration: number;

  constructor(part: number, content: Uint8Array, duration: number) {
    this.part = part;
    this.content = content;
    this.duration = duration;
  }
}

/**
 * Fetch and calculate duration of a part file
 *
 * @param part
 * @param url
 */
export async function fetchPartWithDuration(part: number, url: URL): Promise<FetchResult> {
  const content = await fetchPart(part, url);
  const partMeta = await parseBuffer(content);
  return new FetchResult(part, content, partMeta.format.duration);
}


/**
 * Format second offsets as cue compatible timestamp
 *
 * @param seconds
 * @param withHours
 */
function toTime(withHours: boolean, seconds: number): string {
  if (withHours) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 3600 % 60);
    return `${zeroPad(h)}:${zeroPad(m)}:${zeroPad(s)}`;
  } else {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 3600 % 60);
    return `${zeroPad(m)}:${zeroPad(s)}`;
  }
}