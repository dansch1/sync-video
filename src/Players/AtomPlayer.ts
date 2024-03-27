import EventEmitter from "eventemitter3";
import { SideEffectManager } from "side-effect-manager";
import { normalize, isEqual } from "../utils";
import { SyncPlayerStatus } from "./Types";

export type AtomPlayerEvents =
    | "status"
    | "timeupdate"
    | "durationchange"
    | "ratechange"
    | "visibilitychange"
    | "ready";

const enum AtomPlayerInitStatus {
    Idle,
    Initializing,
    Ready,
}

/**
 * Abstract template class for any player.
 * This will handle the initialization of the player
 * and the general state transitioning.
 */
export abstract class AtomPlayer extends EventEmitter<AtomPlayerEvents> {
    private readonly loadInit: Promise<void>;

    private _initStatus: AtomPlayerInitStatus = AtomPlayerInitStatus.Idle;
    private _status: SyncPlayerStatus = SyncPlayerStatus.Ready;
    protected ignoreSetStatus = false;

    protected _sideEffect = new SideEffectManager();

    private _currentTime = 0;
    private _duration = 0;
    private _playbackRate = 1;
    protected _visible = true;

    /**
     * Initializes the player.
     */
    protected constructor() {
        super(); // for the EventEmitter
        this.loadInit = this.init();
    }

    /**
     * Returns true if the initialization
     * of the player is done.
     */
    public get isReady(): boolean {
        return this._initStatus === AtomPlayerInitStatus.Ready;
    }

    /**
     * Returns true if the status of the player
     * is either playing or buffering.
     */
    public get isPlaying(): boolean {
        return this._status === SyncPlayerStatus.Playing || this._status === SyncPlayerStatus.Buffering;
    }

    /**
     * Returns the current player status.
     */
    public get status(): SyncPlayerStatus {
        return this._status;
    }

    /**
     * Sets the current player status.
     * If the status was changed a "status" event is emitted,
     * unless the ignoreSetStatus flag was set.
     */
    public set status(value: SyncPlayerStatus) {
        if (!this.ignoreSetStatus && this._status !== value) {
            this._status = value;
            this.emit("status");
        }
    }

    /**
     * Returns the current time of the player.
     */
    public get currentTime(): number {
        return this._currentTime;
    }

    /**
     * Sets the current time of the player.
     * If the current time was changed a "timeupdate" event is emitted.
     */
    public set currentTime(ms: number) {
        ms = Math.floor(ms);

        if (this._currentTime !== ms) {
            this._currentTime = ms;
            this.emit("timeupdate");
        }
    }

    /**
     * Returns the current duration of the player.
     */
    public get duration(): number {
        return this._duration;
    }

    /**
     * Sets the duration of the player.
     * If the duration was changed a "durationchange" event is emitted.
     */
    public set duration(ms: number) {
        ms = Math.floor(ms);

        if (this._duration !== ms) {
            this._duration = ms;
            this.emit("durationchange");
        }
    }

    /**
     * Returns the playback rate of the player.
     */
    public get playbackRate(): number {
        return this._playbackRate;
    }

    /**
     * Sets the playback rate of the player.
     * If the playback rate was changed a "ratechange" event is emitted.
     */
    public set playbackRate(value: number) {
        const rate = normalize(value);

        if (!isEqual(this._playbackRate, rate)) {
            this.setPlaybackRateImpl(rate);
            this._playbackRate = rate;
            this.emit("ratechange");
        }
    }

    /**
     * Returns the visibility of the player.
     */
    public get visible(): boolean {
        return this._visible;
    }

    /**
     * Sets the visibility of the player.
     * If the visibility was changed a "visibilitychange" event is emitted.
     */
    public set visible(value: boolean) {
        if (this._visible !== value) {
            this._visible = value;
            this.emit("visibilitychange");
        }
    }

    /**
     * Initializes the player.
     * The player will not do anything until the initiaization is finished.
     * Emits an ready event on completion.
     */
    private async init(): Promise<void> {
        switch (this._initStatus) {
            case AtomPlayerInitStatus.Ready: {
                return;
            }

            case AtomPlayerInitStatus.Initializing: {
                return new Promise(resolve => this.once("ready", resolve));
            }

            // idle status
            default: {
                this.ignoreSetStatus = true;
                this._initStatus = AtomPlayerInitStatus.Initializing;

                await new Promise(r => setTimeout(r));
                await this.initImpl();

                this._initStatus = AtomPlayerInitStatus.Ready;
                this.emit("ready");
                this.ignoreSetStatus = false;
            }
        }
    }

    /**
     * Safely destroys this player.
     */
    public destroy(): void {
        this._sideEffect.flushAll();
    }

    /**
     * Try to switch the player to the Ready state.
     * From the Ready state the player can switch to any other state.
     */
    public async ready(): Promise<void> {
        if (!this.isReady) {
            this.status = SyncPlayerStatus.Buffering;
            await this.loadInit;
        }

        if (this._status !== SyncPlayerStatus.Ready) {
            this.status = SyncPlayerStatus.Ready;
            await this.readyImpl();
        }
    }

    /**
     * Try to switch the player to the Playing state.
     * This can only happen from a Ready or Pause state
     * and if successfully will result in a Playing or Buffering state. 
     */
    public async play(): Promise<void> {
        if (!this.isReady) {
            this.status = SyncPlayerStatus.Buffering;
            await this.loadInit;
        }

        if (this._status !== SyncPlayerStatus.Playing && this._status !== SyncPlayerStatus.Ended) {
            await this.playImpl();
        }
    }

    /**
     * Try to switch the player to the Pause state.
     * This will only work from a Ready or Playing/Buffering state.
     */
    public async pause(): Promise<void> {
        if (!this.isReady) {
            await this.loadInit;
        }

        if (this._status !== SyncPlayerStatus.Pause && this._status !== SyncPlayerStatus.Ended) {
            this.status = SyncPlayerStatus.Pause;
            await this.pauseImpl();
        }
    }

    /**
     * Try to switch the player to the Ended state.
     * Any state can transition to the Ended state.
     * If successfull currentTime === duration holds.
     */
    public async stop(): Promise<void> {
        if (!this.isReady) {
            await this.loadInit;
        }

        if (this._status === SyncPlayerStatus.Ended) {
            return;
        }

        this.status = SyncPlayerStatus.Ended;

        this.ignoreSetStatus = true;
        await this.readyImpl();
        await this.stopImpl();
        this.ignoreSetStatus = false;
    }

    /**
     * Try to set the current duration of the player to the given time.
     * The current status will be preserved unless
     * the previus state was Ended and the new currentTime < duration
     * in which case the state is changed to the Ready state.
     * @param ms the new current time in milliseconds
     */
    public async seek(ms: number): Promise<void> {
        if (!this.isReady) {
            await this.loadInit;
        }

        ms = Math.max(Math.floor(ms), 0);

        if (ms === this._currentTime) {
            return;
        }

        if (ms >= this.duration) {
            await this.stop();
            return;
        }

        const lastStatus = this._status;

        await this.seekImpl(ms);

        switch (lastStatus) {
            case SyncPlayerStatus.Ready:
            case SyncPlayerStatus.Ended: {
                await this.ready();
                break;
            }

            case SyncPlayerStatus.Pause: {
                await this.pause();
                break;
            }

            case SyncPlayerStatus.Buffering:
            case SyncPlayerStatus.Playing: {
                await this.play();
                break;
            }
        }
    }

    /**
     * Implementation for the concrete initialization of the specific player.
     * @returns a resolved promis
     */
    protected initImpl(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * This gets called when the transition to the Ready state was successfull.
     * Execute player specifc code here. 
     */
    protected abstract readyImpl(): Promise<void>;

    /**
     * This gets called when the transition to the Play state was successfull.
     * Execute player specifc code here. 
     */
    protected abstract playImpl(): Promise<void>;

    /**
     * This gets called when the transition to the Pause state was successfull.
     * Execute player specifc code here.
     */
    protected abstract pauseImpl(): Promise<void>;

    /**
     * This gets called when the transition to the Ended state was successfull.
     * Execute player specifc code here.
     */
    protected abstract stopImpl(): Promise<void>;

    /**
     * This gets called when the player should set the new current time.
     * Execute player specifc code here.
     * @param ms the new current time in milliseconds
     */
    protected abstract seekImpl(ms: number): Promise<void>;

    /**
     * This gets called when the player should set the new playback rate.
     * Execute player specifc code here.
     * @param value the new playback rate
     */
    protected abstract setPlaybackRateImpl(value: number): void;
}
