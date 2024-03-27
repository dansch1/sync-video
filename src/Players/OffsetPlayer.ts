import { AtomPlayer, AtomPlayerEvents } from "./AtomPlayer";
import { TickPlayer } from "./TickPlayer";
import { SyncPlayerStatus } from "./Types";

/**
 * AtomPlayer that plays another AtomPlayer after a given offset.
 * The player has the visibility flag set to true while the timer is playing.
 * This can be used for css to hide the player during this time if desired.
 */
export class OffsetPlayer extends AtomPlayer {
    private readonly player: AtomPlayer;
    private readonly timer: TickPlayer;

    private _currentPlayer: AtomPlayer;
    private _offset = 0;

    /**
     * Initializes the player.
     * @param offset the time in ms to wait before starting the player 
     * @param player the player to start after the offset
     */
    public constructor(offset: number, player: AtomPlayer) {
        super();
        this.player = player;
        this._offset = offset || 0;

        this.timer = new TickPlayer(this._offset);
        this._currentPlayer = this._offset > 0 ? this.timer : this.player;

        this.status = this.currentPlayer.status;
        this.duration = this.timer.duration + this.player.duration;

        this.currentTime = this.currentPlayer === this.timer ? this.timer.currentTime : this.player.currentTime + this._offset;
        this._visible = this.currentPlayer !== this.timer;

        this.playbackRate = this.currentPlayer.playbackRate;


        // Sync the player and the timer so that when the timer finishes the player starts
        // and the updates to the status, time, duration and playback rate is applied to the currently active player.

        // add player listeners
        this.syncAtomProps(this.player, "status", () => {
            if (this.currentPlayer === this.player) {
                this.status = this.player.status;
            }
        });

        this.syncAtomProps(this.player, "timeupdate", () => {
            if (this.currentPlayer === this.player) {
                this.currentTime = this.player.currentTime + this._offset;
            }
        });

        this.syncAtomProps(this.player, "durationchange", () => {
            this.duration = this.timer.duration + this.player.duration;
        });

        this.syncAtomProps(this.player, "ratechange", () => {
            if (this.currentPlayer === this.player) {
                this.playbackRate = this.player.playbackRate;
            }
        });

        // add timer listeners
        this.syncAtomProps(this.timer, "status", async () => {
            if (this.currentPlayer !== this.timer) {
                return;
            }

            if (this.timer.status !== SyncPlayerStatus.Ended) {
                this.status = this.timer.status;
                return;
            }

            this.currentPlayer = this.player;

            if (this.status === SyncPlayerStatus.Playing) {
                await this.player.seek(0);
                await this.player.play();
                return;
            }
        });

        this.syncAtomProps(this.timer, "timeupdate", () => {
            if (this.currentPlayer === this.timer) {
                this.currentTime = this.timer.currentTime;
            }
        });

        this.syncAtomProps(this.timer, "durationchange", () => {
            this.duration = this.timer.duration + this.player.duration;
        });

        this.syncAtomProps(this.timer, "ratechange", () => {
            if (this.currentPlayer === this.timer) {
                this.playbackRate = this.timer.playbackRate;
            }
        });
    }

    /**
     * Add the given listener to the given player
     * and make sure the listeners get removed when this player is destroyed.
     * @param player the player to add the event to
     * @param event the event to add
     * @param listener the function to call for the event
     */
    private syncAtomProps(player: AtomPlayer, event: AtomPlayerEvents, listener: () => void): void {
        player.on(event, listener);

        this._sideEffect.addDisposer((): void => {
            player.off(event, listener);
        });
    }

    /**
     * Returns the currently active player.
     * If currentTime < offset this will be the timer,
     * otherwise the player is returned.
     */
    private get currentPlayer(): AtomPlayer {
        return this._currentPlayer;
    }

    /**
     * Set the currently active player.
     */
    private set currentPlayer(player: AtomPlayer) {
        if (this._currentPlayer !== player) {
            this._currentPlayer = player;
            this.visible = player !== this.timer;
        }
    }

    /**
     * Return the duration for the timer.
     */
    public get offset(): number {
        return this._offset;
    }

    /**
     * Sets the duration for the timer.
     * @param ms the new duration in milliseconds
     */
    public async setOffset(ms: number) {
        ms = Math.floor(ms);

        if (this._offset !== ms) {
            this.timer.duration = ms;
            this._offset = ms;

            // reevaluate the current player
            await this.seekImpl(this.currentTime);
        }
    }

    protected async readyImpl(): Promise<void> {
        await Promise.all([this.player.ready(), this.timer.ready()]);
    }

    protected async playImpl(): Promise<void> {
        await this.currentPlayer.play();
    }

    protected async pauseImpl(): Promise<void> {
        await this.currentPlayer.pause();
    }

    protected async stopImpl(): Promise<void> {
        await this.timer.stop();
        await this.player.stop();

        this.currentPlayer = this.player;
    }

    protected async seekImpl(ms: number): Promise<void> {
        let oldPlayer = this.currentPlayer;
        let wasPlaying = this.currentPlayer.isPlaying;

        ms >= this.offset ? await this.seekPlayer(ms) : await this.seekTimer(ms);

        // continue playing
        if (this.currentPlayer !== oldPlayer && wasPlaying) {
            await this.currentPlayer.play();
        }
    }

    /**
     * Try to set the current duration of the timer to the given time.
     * If the player was running previously, it will be reset.
     * @param ms the new current time in milliseconds
     */
    private async seekTimer(ms: number): Promise<void> {
        if (this.currentPlayer !== this.timer) {
            this.currentPlayer = this.timer;

            await this.player.ready();
            await this.player.seek(0);
        }

        await this.timer.seek(ms);
    }

    /**
     * Try to set the current duration of the player to the given time.
     * If the timer was running previously, it will be stopped.
     * @param ms the new current time in milliseconds
     */
    private async seekPlayer(ms: number): Promise<void> {
        if (this.currentPlayer !== this.player) {
            this.currentPlayer = this.player;

            await this.timer.stop();
        }

        await this.player.seek(ms - this._offset);
    }

    protected setPlaybackRateImpl(value: number): void {
        this.player.playbackRate = value;
        this.timer.playbackRate = value;
    }
}
