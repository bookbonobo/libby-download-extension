import { Command, Task } from "./common";
import { addTask, LoadState, Title, updateTask } from "./state";
import { mp3WithCUE } from "./processor/mp3-with-cue";
import { mp3Parts } from "./processor/mp3-parts";
import { parseToc } from "./processor/utils";

let stateTask: string;
let stateCheckCounter = 1;
let state: LoadState;
let running: boolean;
let merge: boolean;
browser.runtime.onMessage.addListener(handleCommand);


/**
 * Handle browser.runtime messages
 *
 * @param command Command
 */
async function handleCommand(command: Command) {
  if (command.cmd === "start") {
    stateCheckCounter = 1;
    browser.tabs.query({ currentWindow: true, active: true }).then(async () => {
      running = false;
      // @ts-ignore
      merge = command.args["merge"];
      state = new LoadState();
      // Clear active tasks
      await browser.storage.local.set({ "tasks": [] });
      const reloadTask = await addTask(new Task("", "Reloading Tab", "Running"));
      console.log("Starting network listener...");
      browser.webRequest.onBeforeRequest.addListener(
        handleMainFrameWebRequest,
        { urls: ["<all_urls>"], types: ["main_frame"] },
        ["blocking"]
      );
      browser.webRequest.onBeforeRequest.addListener(
        handleBookMetaWebRequest,
        { urls: ["<all_urls>"] },
        ["blocking"]
      );
      console.log("Reloading current tab");
      await browser.tabs.reload();
      console.log("Starting download");
      await updateTask(reloadTask, "Completed");
      stateTask = await addTask(new Task("", "Waiting for State", "Waiting"));
    });
  } else {
    console.log(`Got command ${command.cmd}`);
  }
}

/**
 * Handle sync route WebRequest
 *
 * @param details
 */
function handleSync(details: { url?: string | URL; method?: string; requestId?: any; }) {
  const filter = browser.webRequest.filterResponseData(details.requestId);
  bufferJSONBody(filter, (body) => {
    try {
      const syncState = JSON.parse(body);
      for (const i in syncState.loans) {
        if (syncState.loans[i].id === state.id) {
          state.expires = new Date(syncState.loans[i].expires);
        }
      }
      runIfLoaded();
    } catch (e) {
      handleError(e);
    }
  });
}

/**
 * Handle media WebRequest
 *
 * @param details
 */
function handleMedia(details: { url?: string | URL; method?: string; requestId?: any; }) {
  const filter = browser.webRequest.filterResponseData(details.requestId);
  bufferJSONBody(filter, (body) => {
    try {
      const bookMedia = JSON.parse(body);
      if (bookMedia.covers["cover300Wide"]) {
        state.cover_href = bookMedia.covers["cover300Wide"].href;
      } else if (bookMedia.covers["cover150Wide"]) {
        state.cover_href = bookMedia.covers["cover150Wide"].href;
      } else if (bookMedia.covers["cover510Wide"]) {
        state.cover_href = bookMedia.covers["cover510Wide"].href;
      }
      runIfLoaded();
    } catch (e) {
      handleError(e);
    }
  });
}

/**
 * Handle title WebRequest
 *
 * @param details
 */
function handleTitle(details: { url?: string | URL; method?: string; requestId?: any; }) {
  const filter = browser.webRequest.filterResponseData(details.requestId);
  bufferJSONBody(filter, async (body) => {
    try {
      const titleMeta = JSON.parse(body);
      const response = await fetch(titleMeta.urls.openbook);
      const responseJson = await response.json();
      console.log(`Got response ${JSON.stringify(responseJson)}`);
      const title = responseJson.title;
      state.title = new Title(title.main, title.subtitle, title.collection);

      const authors = [];
      const narrators = [];
      for (const i in responseJson.creator) {
        const creator = responseJson.creator[i];
        if (creator.role === "author") {
          authors.push(creator.name);
        } else if (creator.role === "narrator") {
          narrators.push(creator.name);
        }
      }

      state.authors = authors;
      state.narrators = narrators;

      if (responseJson.short) {
        state.description = responseJson.description.short;
      } else if (responseJson.description.long) {
        state.description = responseJson.description.long;
      }

      const url = new URL(titleMeta.urls.openbook);
      const spine = new Map();
      for (const i in responseJson.spine) {
        spine.set(
          responseJson.spine[i]["-odread-original-path"],
          `${url.protocol}//${url.host}/${responseJson.spine[i].path}`
        );
      }

      state.chapters = parseToc(spine, responseJson.nav.toc);
      console.log(`Parsed table of contents ${JSON.stringify(state.chapters)}`);
    } catch (e) {
      handleError(e);
    }
  });
}

/**
 * Handle main frame load WebRequest
 *
 * @param details WebRequest filter details
 */
function handleMainFrameWebRequest(details: { url: string; }) {
  const path = details.url.split("/");
  state.id = path[path.length - 1];
}

/**
 * Handle book meta WebRequest
 *
 * @param details WebRequest filter details
 */
function handleBookMetaWebRequest(details: { url: string | URL; method: string; }) {
  const url = new URL(details.url);
  if (details.method === "GET") {
    if (url.pathname.endsWith("/sync")) {
      handleSync(details);
    } else if (url.pathname.endsWith(`/media/${state.id}`)) {
      handleMedia(details);
    } else if (url.pathname.endsWith(`/title/${state.id}`)) {
      handleTitle(details);
    }
  }
}

/**
 * Buffer the JSON body of a web request
 *
 * @param filter
 * @param action
 */
function bufferJSONBody(filter: any, action: (body: string) => void) {
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();
  let data = "";
  filter.ondata = (event: { data: BufferSource; }) => {
    const body = decoder.decode(event.data, { stream: true });
    data += body;
  };

  filter.onstop = () => {
    action(data);
    filter.write(encoder.encode(data));
    filter.disconnect();
  };
}

/**
 * Check if state is loaded and start download/processing task if state is
 * loaded and download isn't running already.
 */
function runIfLoaded(): void {
  if (state.loaded()) {
    console.log(`State loaded ${JSON.stringify(state)}`);
    updateTask(stateTask, "Completed")
      .catch(handleError);
    if (!running) {
      running = true;
      browser.webRequest.onBeforeRequest.removeListener(handleMainFrameWebRequest);
      browser.webRequest.onBeforeRequest.removeListener(handleBookMetaWebRequest);
      if (merge) {
        console.log("Merging files and parsing chapters");
        mp3WithCUE(state)
          .then(() => {
            state = new LoadState();
            running = false;
          })
          .catch((error) => {
            addTask(new Task("", "Loading State", "Failed")).catch(handleError);
            console.log(error);
            state = new LoadState();
            running = false;
          });
      } else {
        console.log("Downloading files directly");
        mp3Parts(state)
          .then(() => {
            state = new LoadState();
            running = false;
          })
          .catch((error) => {
            addTask(new Task("", "Loading State", "Failed")).catch(handleError);
            console.log(error);
            state = new LoadState();
            running = false;
          });
      }
    } else {
      console.log("Already running");
    }
  } else {
    stateCheckCounter += 1;
    updateTask(stateTask, `Check ${stateCheckCounter}`)
      .catch(handleError);
    console.log(`Still waiting for state ${JSON.stringify(state)}`);
  }
}

function handleError(error: Error) {
  state = new LoadState();
  running = false;
  console.log(`Error: ${error}`);
  addTask(new Task("Error", `${error}`, "Failed"))
    .catch(console.error);
}