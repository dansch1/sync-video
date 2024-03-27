import Player from "video.js/dist/types/player";
import { AtomPlayer } from "./AtomPlayer";
import { SyncPlayerStatus } from "./Types";

/**
 * AtomPlayer that plays a video via the videojs player.
 */
export class VideoPlayer extends AtomPlayer {
	private readonly video: Player;

	/**
	* Initializes the player.
	 * @param video the videojs player
	 */
	public constructor(video: Player) {
		super();

		this.video = video;
		this.video.controls(false);

		// add videojs listeners
		this.addVideoListener(["waiting", "canplay", "pause", "suspend", "playing", "play", "seeking", "seeked", "stalled", "canplaythrough"], (e?: Event): void => {
			if (this.status === SyncPlayerStatus.Ended) {
				return;
			}

			const eventType = e?.type;

			if (!this.video.paused() && eventType !== "seeking") {
				this.status = SyncPlayerStatus.Playing;
				return;
			}

			if (this.status !== SyncPlayerStatus.Pause && this.status !== SyncPlayerStatus.Ready) {
				this.status = eventType === "pause" ? SyncPlayerStatus.Ready : SyncPlayerStatus.Buffering;
			}
		});

		this.addVideoListener("error", () => {
			if (this.status === SyncPlayerStatus.Playing && this.video.paused()) {
				this.status = SyncPlayerStatus.Buffering;
			}
		});

		this.addVideoListener("ended", () => {
			this.status = SyncPlayerStatus.Ended;
		});

		this.addVideoListener("timeupdate", () => {
			this.updateCurrentTime();
		});

		this.addVideoListener("durationchange", () => {
			this.updateDuration();
		});

		// set default values
		this.updateCurrentTime();
		this.updateDuration();
	}

	/**
	 * Add the given listener to the videojs player
	 * and make sure the listeners get removed when this player is destroyed.
	 * @param type the event name
	 * @param listener the function to call for the event
	 */
	private addVideoListener(type: string | string[], listener: (e?: Event) => void): void {
		this.video.on(type, listener);

		this._sideEffect.addDisposer((): void => {
			this.video.off(type, listener)
		});
	}

	/**
	 * Update the current time of this player
	 * from the current time of the videojs player.
	 */
	private updateCurrentTime() {
		this.currentTime = (this.video.currentTime() || 0) * 1000;
	}

	/**
	 * Update the duration of this player
	 * from the duration of the videojs player.
	 */
	private updateDuration() {
		this.duration = (this.video.duration() || 0) * 1000;
	}

	protected async readyImpl(): Promise<void> {
		try {
			this.video.pause();
		} catch {
			// ignore
		}
	}

	protected async playImpl(): Promise<void> {
		try {
			await this.video.play();
		} catch {
			// ignore
		}
	}

	protected async pauseImpl(): Promise<void> {
		try {
			this.video.pause();
		} catch {
			// ignore
		}
	}

	protected async stopImpl(): Promise<void> {
		try {
			this.video.currentTime(this.video.duration());
		} catch {
			// ignore
		}
	}

	protected async seekImpl(ms: number): Promise<void> {
		try {
			this.video.currentTime(ms / 1000);
		} catch {
			// ignore
		}
	}

	protected setPlaybackRateImpl(value: number): void {
		try {
			this.video.playbackRate(value);
		} catch {
			// ignore
		}
	}
}
