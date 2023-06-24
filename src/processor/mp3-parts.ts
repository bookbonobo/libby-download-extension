import { LoadState } from "../state";
import { downloadZip, getMp3Meta, getSpine, zeroPad } from "./utils";
import JSZip from "jszip";
import NodeID3 from "node-id3";
import { fetchPart } from "./fetch";

/**
 * Fetch Audiobook exactly as it comes from Libby
 *
 * @param state
 */
export async function mp3Parts(state: LoadState) {
  const mp3Meta = await getMp3Meta(state);
  const spine = await getSpine(state);
  const zip = new JSZip();
  const folder = zip.folder(mp3Meta.title);
  for (const [part, url] of spine.partFiles) {
    const content = await fetchPart(part, url);
    const tagged = NodeID3.update(mp3Meta.tags, <Buffer>content);
    folder.file(`Part-${zeroPad(part)}.mp3`, tagged.buffer);
  }
  await downloadZip(zip, mp3Meta.title, state.expires);
}