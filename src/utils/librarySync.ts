/**
 * A one-way signal that the files on disk changed.
 *
 * Finished downloads and bulk deletes call `notifyLibraryChanged()`. The
 * gallery subscribes instead of polling, so a new file shows up as soon as it
 * lands instead of waiting for the user to open the Library tab.
 *
 * Deliberately not a React hook module: the download side (useYtDlp,
 * useDownloadQueue) has to announce a finished download without importing
 * anything from the gallery, and a plain module keeps that one-way dependency.
 */

const listeners = new Set<() => void>();

/** Announce that the downloads folder gained or lost files. */
export function notifyLibraryChanged(): void {
    // Copy first: a listener that unsubscribes while being notified would
    // otherwise mutate the set mid-iteration.
    for (const listener of [...listeners]) listener();
}

/** Subscribe to change notifications. Returns an unsubscribe function. */
export function subscribeLibraryChanges(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}