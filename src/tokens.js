import { nanoid } from "nanoid";

export function newId() {
  return nanoid(10);
}

export function makeKey(id) {
  return `link:${id}`;
}

export function nowIso() {
  return new Date().toISOString();
}
