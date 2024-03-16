import { ChapterBounds, MP3Meta, Position, Spine } from "../src/processor/utils";
import { MP3Chapter, processMP3Files } from "../src/processor/mp3-with-cue";
import { fetchPartWithDuration, FetchResult } from "../src/processor/fetch";

jest.mock("../src/processor/fetch", () => {
  const original = jest.requireActual("../src/processor/fetch"); // Step 2.
  return {
    ...original,
    fetchPartWithDuration: jest.fn()
  };
});

global.browser = {
  storage: {
    // @ts-ignore
    local: {
      set: jest.fn(),
      get: jest.fn().mockImplementation(() => {
        return {"tasks": []}
      })
    }
  }
}

// @ts-ignore
fetchPartWithDuration.mockImplementation((part: number, url: URL) => {
  return new FetchResult(part, new Uint8Array(), 100);
});

describe("chapter processing", () => {
  test("process chapters should load files and calculate bounds", async () => {
    const partMap = new Map();
    partMap.set(1, "https://part1");
    partMap.set(2, "https://part2");
    partMap.set(3, "https://part3");
    partMap.set(4, "https://part4");
    partMap.set(5, "https://part5");
    const chapters = [
      new ChapterBounds(
        "Chapter 1",
        new Position(1, 0),
        new Position(2, 50)
      ),
      new ChapterBounds(
        "Chapter 2",
        new Position(2, 50),
        new Position(2, 75)
      ),
      new ChapterBounds(
        "Chapter 3",
        new Position(2, 75),
        new Position(3, 50)
      ),
      new ChapterBounds(
        "Chapter 4",
        new Position(3, 50),
        new Position(5, -1)
      )
    ];
    const spine = new Spine(partMap, chapters);
    const meta = new MP3Meta("Book Title", "Author", "Narrator", []);
    const processed = await processMP3Files(spine, meta, false);
    console.log(processed);
    expect(Array.from(partMap.keys())).toStrictEqual([1, 2, 3, 4, 5]);
    // all parts are mocked to have a duration of 100s
    expect(processed.chapters).toStrictEqual([
      // part1:0s to part2:50s
      new MP3Chapter("Chapter 1", 0, 150000),
      // part1:50s to part2:75s
      new MP3Chapter("Chapter 2", 150000, 175000),
      // part2:75s to part3:50s
      new MP3Chapter("Chapter 3", 175000, 250000),
      // part3:50s to part5:end
      new MP3Chapter("Chapter 4", 250000, 500000)
    ]);
    expect(processed.cueContent).toStrictEqual(`TITLE "Book Title"
FILE "Book Title.mp3" MP3
  TRACK 01 AUDIO
    TITLE "Chapter 1"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "Chapter 2"
    INDEX 01 02:30:00
  TRACK 03 AUDIO
    TITLE "Chapter 3"
    INDEX 01 02:55:00
  TRACK 04 AUDIO
    TITLE "Chapter 4"
    INDEX 01 04:10:00`);
  });
});
