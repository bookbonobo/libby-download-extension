import { Task, handleError, handleResponse } from "./common";

function listenForClicks() {
  document.querySelector("#start-download-btn").addEventListener("click", () => {
    browser.runtime.sendMessage({
      cmd: "start"
    })
      .then(handleResponse, handleError);
  });
  document.querySelector("#clear-tasks").addEventListener("click", () => {
    browser.storage.local.set({ "tasks": [] });
  });
}


function reportDisabled() {
  document.querySelector("#popup-content").classList.add("hidden");
  document.querySelector("#warn-content").classList.remove("hidden");
}

function reloadTasks(tasks: Array<Task>) {
  const table = document.querySelector("#task-table");
  const tbody = document.createElement("tbody");
  tasks.forEach((taskStatus, idx) => {
    const row = document.createElement("tr");
    if (taskStatus.state === "Completed") {
      row.classList.add("table-success");
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
  });

  table.replaceChild(tbody, table.querySelector("tbody"));
}

browser.storage.local.onChanged.addListener((changes) => {
  if (changes["tasks"]) {
    reloadTasks(changes["tasks"].newValue);
  }
});

// or the short variant
browser.tabs.query({ currentWindow: true, active: true }).then(async (tabs) => {
  if (tabs[0].url.startsWith("https://libbyapp.com")) {
    let tasks: Array<Task>;
    const storageResponse = await browser.storage.local.get("tasks");
    if (storageResponse["tasks"]) {
      tasks = storageResponse["tasks"];
    } else {
      tasks = [];
    }
    reloadTasks(tasks);
    // for (const i in activeTasks) {
    //     appendRow(tbody, activeTasks[i]);
    // }
    listenForClicks();
  } else {
    reportDisabled();
  }
}, console.error);

