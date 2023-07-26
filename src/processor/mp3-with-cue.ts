import { ChapterBounds, cleanFilename, downloadZip, getMp3Meta, getSpine, MP3Meta, Spine, zeroPad } from "./utils";
import JSZip from "jszip";
import NodeID3 from "node-id3";
import { LoadState } from "../state";
import { fetchPartWithDuration, FetchResult } from "./fetch";

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
  const processed = await processMP3Files(spine, mp3Meta);
  console.log("Finished processing mp3");

  console.log("Chapter list");
  for (const chapter of processed.chapters) {
    console.log(`${JSON.stringify(chapter)}`);
  }

  // Merge parts into a single file
  const mergedContent = new Uint8Array(await new Response(new Blob(processed.parts)).arrayBuffer());
  // Tag it with parsed metadata
  const tagged = NodeID3.update(mp3Meta.tags, <Buffer>mergedContent);

  // Add both files to the zip and download
  const filename = cleanFilename(mp3Meta.title);
  zip.file(`${filename}.cue`, processed.cueContent);
  zip.file(`${filename}.mp3`, tagged.buffer);
  console.log(mp3Meta);
  await downloadZip(zip, `${mp3Meta.title.slice(0, Math.min(25, mp3Meta.title.length))}`, state.expires);
}

/**
 * Encapsulation of a chapter as it sits in the merged mp3 stream
 */
export class MP3Chapter {
  // this is used as title, but according to the mp3 ID3v2 spec there must
  // be an elementId field
  elementID: string;
  startTimeMs: number;
  endTimeMs: number;

  constructor(title: string, startTimeMs: number, endTimeMs: number) {
    this.elementID = title;
    this.startTimeMs = startTimeMs;
    this.endTimeMs = endTimeMs;
  }
}

/**
 * Result of processing the full audiobook with meta, chapter locations,
 * and binary payloads of the mp3 part files
 */
export class ProcessedMP3 {
  parts: Uint8Array[];
  chapters: MP3Chapter[];
  meta: MP3Meta;
  cueContent: string;

  constructor(meta: MP3Meta) {
    this.parts = [];
    this.chapters = [];
    this.cueContent = `TITLE "${meta.title}"
FILE "${meta.title}.mp3" MP3`;
    this.meta = meta;
  }
}

/**
 * Generate processed mp3 from spine and meta
 *
 * @param spine Parsed part file map and chapter index
 * @param meta Mp3 metadata
 */
export async function processMP3Files(spine: Spine, meta: MP3Meta) {
  const processed = new ProcessedMP3(meta);
  let offset = 0;
  let current;
  // iterate chapters, downloading parts and emitting cue file entries
  // along the way
  for (const entry of spine.index) {
    console.log(`Processing chapter '${entry.title}' ${entry.start.part}#${entry.start.offset} to ${entry.end.part}#${entry.end.offset}`);
    const start = offset;
    const idx = spine.index.indexOf(entry);
    while (!current || current.part < entry.end.part) {
      if (current) {
        offset = finalizePartOffsets(current, entry, offset);
        console.log(`Fetching part ${current.part + 1}`);
        current = await fetchPartWithDuration(current.part + 1, spine.getPartUrl(current.part + 1));
      } else {
        console.log(`Fetching part 1`);
        current = await fetchPartWithDuration(1, spine.getPartUrl(1));
      }
      processed.parts.push(current.content);
    }

    let end;
    if (entry.end.offset === -1) {
      // end offset of -1 is a magic number for "the rest"
      end = -1;
    } else if (entry.start.part === entry.end.part) {
      // if both offsets refer to the same part, only increment the global offset
      // by the difference between them
      console.log(`Incrementing offset by (end - start), ${entry.end.offset - entry.start.offset}`);
      offset += entry.end.offset - entry.start.offset;
      console.log(`Current offset ${offset}`);
      end = offset;
    } else {
      // otherwise move the global offset by the end offset
      console.log(`Incrementing offset by end offset ${entry.end.offset}`);
      offset += entry.end.offset;
      console.log(`Current offset ${offset}`);
      end = offset;
    }

    processed.chapters[idx] = new MP3Chapter(
      entry.title,
      Math.round(start * 1000),
      Math.round(end * 1000)
    );
    processed.cueContent += `
  TRACK ${zeroPad(idx + 1)} AUDIO
    TITLE "${entry.title}"
    INDEX 01 ${toTime(false, Math.round(start))}`;
  }

  // handle offsets of last chapter
  offset = finalizePartOffsets(
    current,
    spine.index[spine.index.length - 1],
    offset
  );
  // the end offset of the last chapter is probably going to be -1, update
  // it to be whatever the offset got incremented to in the finalization
  processed.chapters[processed.chapters.length - 1].endTimeMs = Math.round(offset * 1000);

  // append chapters id3 tag
  processed.meta.tags["chapter"] = processed.chapters;
  return processed;
}

/**
 *
 * @param current Current FetchResult
 * @param entry Current chapter entry
 * @param offset Position in merged file
 */
function finalizePartOffsets(current: FetchResult, entry: ChapterBounds, offset: number): number {
  // increment by what's left in the current file
  if (current.part === entry.start.part) {
    console.log(`Incrementing by remainder of ${current.part}: ${current.duration - entry.start.offset}`);
    offset += current.duration - entry.start.offset;
    console.log(`Current offset ${offset}`);
  } else {
    console.log(`Incrementing by full duration of ${current.part}: ${current.duration}`);
    offset += current.duration;
    console.log(`Current offset ${offset}`);
  }
  return offset;
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