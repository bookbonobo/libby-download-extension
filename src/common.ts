const { v4: uuidv4 } = require('uuid');

export class Message {
    cmd: string
    status: Task
    constructor(cmd: string, status: Task) {
        this.cmd = cmd;
        this.status = status;
    }
}

export class Command {
    cmd: string
    args: object

    constructor(cmd: string, args: object) {
        this.cmd = cmd;
        this.args = args;
    }
}

export class Response {
    message: string

    constructor(message: string) {
        this.message = message;
    }
}

export class Task {
    id: string
    filename: string
    task: string
    state: string
    constructor(filename: string, task: string, state: string) {
        this.id = uuidv4();
        this.filename = filename;
        this.task = task;
        this.state = state;
    }
}

export function handleResponse(response: Response) {
    if (response != null && response.message != null) {
        console.log(`Received response in pop-up: ${response.message}`);
    }
}

export function handleError(error: Error) {
    console.log(`Error: ${error}`);
}