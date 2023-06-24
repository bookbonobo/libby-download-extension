module.exports = {
  transform: {
    "\\.[jt]sx?$": "babel-jest"
  },
  moduleNameMapper: {
    "music-metadata": "MusicMetadataStub"
  },
  testEnvironment: "node",
  testRegex: "/tests/.*\\.(test|spec)?\\.(ts|tsx)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};