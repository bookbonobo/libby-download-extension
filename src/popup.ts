import { Task,  handleResponse, Command } from "./common";

/**
 * Listen for start or clear tasks clicks
 */
function listenForClicks() {
  document.querySelector("#start-download-btn").addEventListener("click", () => {
    browser.runtime.sendMessage(new Command("start", {
      // @ts-ignore
      "merge": document.querySelector("#mergeFiles").checked
    }))
      .then(handleResponse, console.error);
  });
  document.querySelector("#clear-tasks").addEventListener("click", () => {
    browser.storage.local.set({ "tasks": [] }).catch(console.error);
  });
  document.querySelector("#mergeFiles").addEventListener("click", (event) => {
    // @ts-ignore
    console.log(`Setting merge state to ${event.target.checked}`);
    // @ts-ignore
    browser.storage.local.set({ "merge": event.target.checked }).catch(console.error);
  });
}


/**
 * Hide popup elements if the active tab isn't Libby
 */
function reportDisabled() {
  document.querySelector("#popup-content").classList.add("hidden");
  document.querySelector("#warn-content").classList.remove("hidden");
}

/**
 * Populate task table
 *
 * @param tasks
 */
function reloadTasks(tasks: Array<Task>) {
  const table = document.querySelector("#task-table");
  const tbody = document.createElement("tbody");
  tasks.forEach((taskStatus, idx) => {
      const row = document.createElement("tr");
      if (taskStatus.state.startsWith("Completed")) {
        row.classList.add("table-success");
      } else if (taskStatus.state.startsWith("Failed")) {
        row.classList.add("table-danger");
      } else {
        row.classList.add("table-primary");
      }
      const number = document.createElement("td");
      number.innerText = (idx + 1).toString();
      const filename = document.createElement("td");
      filename.innerText = taskStatus.filename;
      const task = document.createElement("td");
      task.innerText = taskStatus.task;
      const status = document.createElement("td");
      status.innerText = taskStatus.state;

      row.appendChild(number);
      row.appendChild(filename);
      row.appendChild(task);
      row.appendChild(status);
      tbody.appendChild(row);
    }
  );

  table.replaceChild(tbody, table.querySelector("tbody"));
}

async function loadMergeState() {
  const mergeResponse = await browser.storage.local.get("merge");
  const checkbox = document.querySelector("#mergeFiles");
  if (mergeResponse["merge"] != undefined) {
    // @ts-ignore
    checkbox.checked = mergeResponse["merge"];
  } else {
    // @ts-ignore
    checkbox.checked = true;
  }
}


// If the active tab is Libby, display pop-up content and listen for clicks
browser.tabs.query({ currentWindow: true, active: true }).then(async (tabs) => {
  if (tabs[0].url.startsWith("https://libbyapp.com/open/loan/")) {
    await loadMergeState();
    let tasks: Array<Task>;
    const storageResponse = await browser.storage.local.get("tasks");
    if (storageResponse["tasks"]) {
      tasks = storageResponse["tasks"];
    } else {
      tasks = [];
    }

    reloadTasks(tasks);

    // Add a listener to local storage on task changes
    browser.storage.local.onChanged.addListener((changes) => {
      if (changes["tasks"]) {
        reloadTasks(changes["tasks"].newValue);
      }
    });
    listenForClicks();
  } else {
    reportDisabled();
  }
}, console.error);

