/**
 * Status for any AtomPlayer.
 * The Ready state can transition to any state and any other state can transition to it.
 * The Pause state can switch to the Buffering/Playing state and vice versa.
 * The player has the Ended state as long as currentTime === duration holds.
 */
export const enum SyncPlayerStatus {
    /** Idle State. It acts like Pause but ready to be changed into any other state. */
    Ready = "Ready",
    /** Video is paused intentionally. */
    Pause = "Pause",
    /** Buffering is only happened during playing process. */
    Buffering = "Buffering",
    /** Video is playing. */
    Playing = "Playing",
    /** Video is ended. */
    Ended = "Ended",
}
