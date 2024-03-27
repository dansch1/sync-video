import { AtomPlayer } from "./AtomPlayer";
import { SyncPlayerStatus } from "./Types";

/**
 * AtomPlayer that plays a timer for the given duration.
 */
export class TickPlayer extends AtomPlayer {
    private _startTimer: (startTime: number, playbackRate: number) => void;
    private _stopTimer: () => void;
    private _resetTimer: (startTime: number, playbackRate: number) => void;

    /**
     * Initializes the player.
     * @param duration the duration the timer should play for
     */
    public constructor(duration: number) {
        super();
        this.duration = duration;

        // timer initialization
        let playRafTicket = NaN;

        this._startTimer = (startTime: number, playbackRate: number): void => {
            window.cancelAnimationFrame(playRafTicket);
            const startTimestamp = Date.now();

            const playRaf = (): void => {
                this.currentTime = (Date.now() - startTimestamp) * playbackRate + startTime;

                if (this.currentTime >= this.duration) {
                    this.stop();
                    return;
                }

                playRafTicket = window.requestAnimationFrame(playRaf);
            };

            playRaf();
        };

        this._stopTimer = (): void => {
            window.cancelAnimationFrame(playRafTicket);
            playRafTicket = NaN;
        };

        this._resetTimer = (startTime: number, playbackRate: number): void => {
            if (playRafTicket) {
                this._startTimer(startTime, playbackRate);
                return;
            }

            this.currentTime = startTime;
        };

        // stop timer when the player is destroyed
        this._sideEffect.addDisposer(this._stopTimer);
    }

    protected async readyImpl(): Promise<void> {
        this._stopTimer();
    }

    protected async playImpl(): Promise<void> {
        this._startTimer(this.currentTime, this.playbackRate);
        this.status = SyncPlayerStatus.Playing;
    }

    protected async pauseImpl(): Promise<void> {
        this._stopTimer();
    }

    protected async stopImpl(): Promise<void> {
        this._stopTimer();
        this.currentTime = this.duration;
    }

    protected async seekImpl(ms: number): Promise<void> {
        this._resetTimer(ms, this.playbackRate);
    }

    protected setPlaybackRateImpl(playbackRate: number): void {
        this._resetTimer(this.currentTime, playbackRate);
    }
}
