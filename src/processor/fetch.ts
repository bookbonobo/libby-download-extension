import { zeroPad } from "./utils";
import { addTask, updateTask } from "../state";
import { Task } from "../common";

/**
 * Part number, mp3 file content, and calculated duration
 */
export class FetchResult {
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
 * @param part Part number
 * @param url Url to file
 */
export async function fetchPart(part: number, url: URL): Promise<Uint8Array> {
  const downloadTask = await addTask(new Task(`Part${zeroPad(part)}`, "Download", "Running"));
  const response = await fetch(url);
  const content = new Uint8Array(await response.arrayBuffer());
  await updateTask(downloadTask, "Completed");
  return content;
}


/**
 * Fetch and calculate duration of a part file
 *
 * @param part
 * @param url
 */
export async function fetchPartWithDuration(part: number, url: URL): Promise<FetchResult> {
  const content = await fetchPart(part, url);
  import("music-metadata");
  const musicMetadata = await import("music-metadata");
  const partMeta = await musicMetadata.parseBuffer(content);
  return new FetchResult(part, content, partMeta.format.duration);
}

