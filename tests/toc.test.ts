import { ChapterBounds, getSpine, parseToc, Position } from "../src/processor/utils";
import { Chapter, LoadState } from "../src/state";

describe("table of contents parsing", () => {
  test("contiguous chapters should be merged", () => {
    const spine = new Map();
    spine.set("part-1", "https://path1");
    const toc = [
      { "title": "Chapter 1", path: "part-1" },
      { "title": "Chapter 1", path: "part-1#100" },
      { "title": "Chapter 2", path: "part-1#400" }
    ];
    const chapters = parseToc(spine, toc);
    expect(chapters).toStrictEqual([
      new Chapter("Chapter 1", ["https://path1"], 0),
      new Chapter("Chapter 2", ["https://path1"], 400)
    ]);
  });

  test("nested chapters should be merged", () => {
    const spine = new Map();
    spine.set("part-1", "https://path1");
    spine.set("part-2", "https://path2");
    const toc = [
      { "title": "Chapter 1", path: "part-1" },
      {
        "title": "Chapter 2", path: "part-1#400", contents: [
          { "title": "Chapter 2 (01:00)", path: "part-1#600" },
          { "title": "Chapter 2 (02:00)", path: "part-2" }
        ]
      },
      { title: "Chapter 2", path: "part-2#600" }
    ];
    const chapters = parseToc(spine, toc);
    expect(chapters).toStrictEqual([
      new Chapter("Chapter 1", ["https://path1"], 0),
      new Chapter("Chapter 2", ["https://path1", "https://path2"], 400)
    ]);
  });
});

describe("spine parsing", () => {
  test("spine should build", () => {
    const state = new LoadState();
    state.chapters = [
      new Chapter("Chapter 1", ["https://domain/xx-Part01.mp3"], 0),
      new Chapter("Chapter 2", ["https://domain/xx-Part01.mp3", "https://domain/xx-Part02.mp3"], 400)
    ];
    const spine = getSpine(state);
    expect(spine.index).toStrictEqual([
      new ChapterBounds(
        "Chapter 1",
        new Position(1, 0),
        new Position(1, 400)
      ),
      new ChapterBounds(
        "Chapter 2",
        new Position(1, 400),
        new Position(2, -1)
      )
    ]);
  });
});