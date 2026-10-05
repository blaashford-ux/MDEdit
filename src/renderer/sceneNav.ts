/** Jumps the caret between scene breaks in one editor. Returns false when there is nowhere to go. */
export interface SceneNav {
  go(dir: 1 | -1): boolean;
}
