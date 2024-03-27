import { AtomPlayer, AtomPlayerEvents } from "./AtomPlayer";
import { SyncPlayerStatus } from "./Types";

/**
 * AtomPlayer that syncs two other AtomPlayers together.
 * This player finished when the longer player ends.
 */
export class ClusterPlayer extends AtomPlayer {
    private readonly rowPlayer: AtomPlayer;
    private readonly colPlayer: AtomPlayer;

    private stopFrameDropCheck?: () => void;

    /**
     * Initializes the player.
     * @param rowPlayer the first player to sync
     * @param colPlayer the second player to sync
     */
    public constructor(rowPlayer: AtomPlayer, colPlayer: AtomPlayer) {
        super();

        this.rowPlayer = rowPlayer;
        this.colPlayer = colPlayer;

        // Sync the two sub players together
        // so that updates to the status, time, duration and playback rate are applied to both players.
        this.addPlayerListener("status", (emitter, receptor) => {
            if (this.ignoreSetStatus) {
                return;
            }

            this.syncSubPlayer(emitter, receptor);
            this.updateStatus(emitter, receptor);

            this.rowPlayer.status === SyncPlayerStatus.Playing && this.colPlayer.status === SyncPlayerStatus.Playing ? this.startFrameDropCheck() : this.stopFrameDropCheck?.();
        });

        this.addPlayerListener("timeupdate", () => {
            this.updateCurrentTime();
        });

        this.addPlayerListener("durationchange", () => {
            this.updateDuration();
        });

        this.addPlayerListener("ratechange", emitter => {
            this.playbackRate = emitter.playbackRate;
        });

        // set default values
        this.updateCurrentTime();
        this.updateDuration();
        this.playbackRate = this.longerPlayer.playbackRate;
    }

    /**
     * Add the given listener to both players
     * and make sure the listeners get removed when this player is destroyed.
     * @param event the event to add
     * @param listener the function to call for the event
     */
    private addPlayerListener(event: AtomPlayerEvents, listener: (emitter: AtomPlayer, receptor: AtomPlayer) => void): void {
        this._sideEffect.add(() => {
            const handler = (): void => {
                listener(this.rowPlayer, this.colPlayer);
            };

            this.rowPlayer.on(event, handler);

            return (): void => {
                this.rowPlayer.off(event, handler);
            };
        });

        this._sideEffect.add(() => {
            const handler = (): void => {
                listener(this.colPlayer, this.rowPlayer);
            };

            this.colPlayer.on(event, handler);

            return (): void => {
                this.colPlayer.off(event, handler);
            };
        });
    }

    /**
     * Update the current time of this player
     * from the current time of the longer of the two sub players.
     */
    private updateCurrentTime() {
        this.currentTime = this.longerPlayer.currentTime;
    }

    /**
     * Update the duration of this player
     * from the duration of the longer of the two sub players.
     */
    private updateDuration() {
        this.duration = this.longerPlayer.duration;
    }

    /**
     * Returns the player with the longer duration.
     */
    private get longerPlayer() {
        return this.rowPlayer.duration >= this.colPlayer.duration ? this.rowPlayer : this.colPlayer;
    }

    public override get isReady(): boolean {
        return this.rowPlayer.isReady && this.colPlayer.isReady;
    }

    public override destroy(): void {
        super.destroy();
        this.stopFrameDropCheck?.();
        this.rowPlayer.destroy();
        this.colPlayer.destroy();
    }

    public override async ready(): Promise<void> {
        await this.readyImpl();
    }

    public override async play(): Promise<void> {
        await this.playImpl();
    }

    public override async pause(): Promise<void> {
        await this.pauseImpl();
    }

    public override async stop(): Promise<void> {
        await this.stopImpl();
    }

    public override async seek(ms: number): Promise<void> {
        await this.seekImpl(ms);
    }

    protected async readyImpl(): Promise<void> {
        await this.invokeSubPlayers(player => player.ready());
    }

    protected async playImpl(): Promise<void> {
        await this.invokeSubPlayers(player => player.play());
    }

    protected async pauseImpl(): Promise<void> {
        await this.invokeSubPlayers(player => player.pause());
    }

    protected async stopImpl(): Promise<void> {
        await this.invokeSubPlayers(player => player.stop());
    }

    protected async seekImpl(ms: number): Promise<void> {
        let wasPlaying = this.isPlaying;

        await this.invokeSubPlayers(player => player.seek(ms));

        if (wasPlaying) {
            await this.playImpl();
        }
    }

    protected setPlaybackRateImpl(value: number): void {
        this.rowPlayer.playbackRate = value;
        this.colPlayer.playbackRate = value;
    }

    /**
     * Calls the given function on each player.
     * @param action the function the players should call
     */
    private async invokeSubPlayers(action: (player: AtomPlayer) => unknown): Promise<void> {
        await Promise.all([this.rowPlayer, this.colPlayer].map(action));
    }

    /**
     * Sync the states of the two sub players.
     * This gets called whenever a player changes it status.
     * @param emitter the player whose status was changed
     * @param receptor the other player
     */
    private async syncSubPlayer(emitter: AtomPlayer, receptor: AtomPlayer): Promise<void> {
        switch (emitter.status) {
            case SyncPlayerStatus.Pause: {
                if (receptor.isPlaying) {
                    await receptor.pause();
                }
                break;
            }

            case SyncPlayerStatus.Buffering: {
                if (receptor.status === SyncPlayerStatus.Playing) {
                    await receptor.ready();
                }
                break;
            }

            case SyncPlayerStatus.Playing: {
                if (receptor.status === SyncPlayerStatus.Buffering) {
                    await emitter.ready();
                } else if (receptor.status === SyncPlayerStatus.Ready && (receptor.duration <= 0 || emitter.currentTime < receptor.duration)) {
                    await receptor.play();
                }
                break;
            }
        }
    }

    /**
     * Update the status of this combined player
     * based on the status of the two sub players to sync.
     * This gets called whenever a player changes it status.
     * @param emitter the player whose status was changed
     * @param receptor the other player
     */
    private updateStatus(emitter: AtomPlayer, receptor: AtomPlayer): void {
        switch (emitter.status) {
            case SyncPlayerStatus.Ready: {
                if (receptor.status === SyncPlayerStatus.Ready || receptor.status === SyncPlayerStatus.Ended) {
                    this.status = SyncPlayerStatus.Ready;
                }
                break;
            }

            case SyncPlayerStatus.Pause: {
                if (receptor.status !== SyncPlayerStatus.Playing) {
                    this.status = SyncPlayerStatus.Pause;
                }
                break;
            }

            case SyncPlayerStatus.Buffering: {
                if (receptor.status !== SyncPlayerStatus.Pause) {
                    this.status = SyncPlayerStatus.Buffering;
                }
                break;
            }

            case SyncPlayerStatus.Playing: {
                if (receptor.status === SyncPlayerStatus.Playing || receptor.status === SyncPlayerStatus.Ended) {
                    this.status = SyncPlayerStatus.Playing;
                }
                break;
            }

            case SyncPlayerStatus.Ended: {
                this.status = receptor.status;
                break;
            }
        }
    }

    /**
     * When this function is called, the current times of the two sub players are constantly checked
     * and if the difference between the two becomes too large, they are synchronized again.
     * To stop this call the stopFrameDropCheck function.
     */
    private startFrameDropCheck(): void {
        if (this.stopFrameDropCheck) {
            return;
        }

        let frameDropCount = 0;

        const ticket = setInterval(async () => {
            if (this.status !== SyncPlayerStatus.Playing) {
                frameDropCount = 0;
                return;
            }

            const diff = this.rowPlayer.currentTime - this.colPlayer.currentTime;
            frameDropCount = Math.abs(diff) > 1000 ? frameDropCount + 1 : 0;
            console.log(diff);

            if (frameDropCount < 2) {
                return;
            }

            // handle frame drops
            diff < 0 ? await this.rowPlayer.seek(this.colPlayer.currentTime) : await this.colPlayer.seek(this.rowPlayer.currentTime);
            
            frameDropCount = 0;
        }, 2000);

        this.stopFrameDropCheck = (): void => {
            this.stopFrameDropCheck = undefined;
            clearInterval(ticket);
        };
    }
}
