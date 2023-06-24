import { ParsedPartPath } from "../src/state";

describe("part path parsing", () => {
  test("offset should be parsed", () => {
    const part = new ParsedPartPath("{12345-6789}Fmt111-Part01.mp3#111");
    expect(part.path).toBe("{12345-6789}Fmt111-Part01.mp3");
    expect(part.offset).toBe(111);
  });
});