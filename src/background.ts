import { handleError, Message, Task } from "./common";
import { addTask, Chapter, LoadState, Title, updateTask } from "./state";
import { mp3WithCUE } from "./processor/mp3-with-cue";

let state: LoadState;
let running: boolean;
let reloadTask: string;
browser.runtime.onMessage.addListener(handleMessage);


/**
 * Handle browser.runtime messages
 *
 * @param message Message content
 */
async function handleMessage(message: Message) {
  if (message.cmd === "start") {
    browser.tabs.query({ currentWindow: true, active: true }).then(async () => {
      state = new LoadState();
      running = false;
      reloadTask = undefined;
      // Clear active tasks
      await browser.storage.local.set({ "tasks": [] });
      reloadTask = await addTask(new Task("", "Reloading Tab", "Running"));
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
      console.log("Reloading current tab...");
      await browser.tabs.reload();
      console.log("Starting download...");
    });
  } else {
    console.log(`Got command ${message.cmd}`);
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
    const syncState = JSON.parse(body);
    for (const i in syncState.loans) {
      if (syncState.loans[i].id === state.id) {
        state.expires = new Date(syncState.loans[i].expires);
      }
    }
    runIfLoaded();
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
    const bookMedia = JSON.parse(body);
    if (bookMedia.covers["cover300Wide"]) {
      state.cover_href = bookMedia.covers["cover300Wide"].href;
    } else if (bookMedia.covers["cover150Wide"]) {
      state.cover_href = bookMedia.covers["cover150Wide"].href;
    } else if (bookMedia.covers["cover510Wide"]) {
      state.cover_href = bookMedia.covers["cover510Wide"].href;
    }

    runIfLoaded();
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
    const titleMeta = JSON.parse(body);
    const response = await fetch(titleMeta.urls.openbook);
    const responseJson = await response.json();
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

    console.log("Got table of contents");
    console.log(responseJson.nav.toc);
    state.chapters = [];

    for (const row of responseJson.nav.toc) {
      const last = state.chapters[state.chapters.length - 1];
      if (last && last.title === row.title) {
        console.log(`Found contiguous chapters with the same name, merging ${row.title}`);
      } else {
        const split = row.path.split("#");
        let offset;
        if (split.length === 2) {
          offset = parseInt(split[1]);
        } else {
          offset = 0;
        }
        state.chapters.push(
          new Chapter(row.title, spine.get(split[0]), offset)
        );
      }
    }
    console.log("Parsed table of contents");
    console.log(state.chapters);
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
    console.log("State loaded");
    console.log(state);
    updateTask(reloadTask, "Completed").catch(handleError);
    if (!running) {
      running = true;
      browser.webRequest.onBeforeRequest.removeListener(handleMainFrameWebRequest);
      browser.webRequest.onBeforeRequest.removeListener(handleBookMetaWebRequest);
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
    }
    {
      console.log("Already running");
    }
  } else {
    console.log("Still waiting for state...");
    console.log(state);
  }
}
