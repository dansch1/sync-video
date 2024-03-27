import videojs from "video.js";
import Player from "video.js/dist/types/player";
import { AtomPlayer } from "./Players/AtomPlayer";
import { OffsetPlayer } from "./Players/OffsetPlayer";
import { SyncPlayer } from "./Players/SyncPlayer";
import { VideoPlayer } from "./Players/VideoPlayer";
import { SyncPlayerStatus } from "./Players/Types";
import { isEqual, normalize } from "./utils";

// HTMLElements container
const selectionContainer = document.querySelector(".selection-container") as HTMLDivElement;
const playerContainer = document.querySelector(".player-container") as HTMLDivElement;
const controlsContainer = playerContainer.querySelector(".controls-container") as HTMLDivElement;
const videoContainer = playerContainer.querySelector(".video-container") as HTMLDivElement;

// HTMLElements timeline
const videoTimeline = playerContainer.querySelector(".video-timeline") as HTMLDivElement;
const progressTime = videoTimeline.querySelector("span") as HTMLSpanElement;
const progressBar = playerContainer.querySelector(".progress-bar") as HTMLDivElement;

// HTMLElements options left
const mixerBtn = playerContainer.querySelector(".mixer") as HTMLButtonElement;
const mixerOptions = playerContainer.querySelector(".mixer-options") as HTMLDivElement;
const volumeBtn = playerContainer.querySelector(".volume") as HTMLButtonElement;
const volumeBtnImage = playerContainer.querySelector(".volume i") as HTMLElement;
const volumeSlider = playerContainer.querySelector(".left input") as HTMLInputElement;
const currentVidTime = playerContainer.querySelector(".current-time") as HTMLParagraphElement;
const videoDuration = playerContainer.querySelector(".video-duration") as HTMLParagraphElement;

// HTMLElements options center
const skipBackward = playerContainer.querySelector(".skip-backward") as HTMLElement;
const playPauseBtn = playerContainer.querySelector(".play-pause") as HTMLButtonElement;
const playPauseBtnImage = playerContainer.querySelector(".play-pause i") as HTMLElement;
const skipForward = playerContainer.querySelector(".skip-forward") as HTMLElement;

// HTMLElements options right
const speedBtn = playerContainer.querySelector(".playback-speed") as HTMLButtonElement;
const speedOptions = playerContainer.querySelector(".speed-options") as HTMLUListElement;
const fullScreenBtn = playerContainer.querySelector(".fullscreen") as HTMLButtonElement;
const fullScreenBtnImage = playerContainer.querySelector(".fullscreen i") as HTMLElement;

// videojs players
const playerOptions = { textTrackSettings: false, controlBar: false, loadingSpinner: false, errorDisplay: false, bigPlayButton: false };
const players: Player[] = [];
const playerStatus: boolean[] = [];
const offsetPlayers: OffsetPlayer[] = [];
const volumeSliders: HTMLInputElement[] = [];
const playerCount = 2;

// maps video formats to the correct videojs type
const videoTypes = {
    opus: "video/ogg",
    ogv: "video/ogg",
    mp4: "video/mp4",
    mov: "video/mp4",
    m4v: "video/mp4",
    mkv: "video/x-matroska",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    aac: "audio/aac",
    caf: "audio/x-caf",
    flac: "audio/flac",
    oga: "audio/ogg",
    wav: "audio/wav",
    m3u8: "application/x-mpegURL",
    mpd: "application/dash+xml",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
};

// global variables
let syncPlayer: AtomPlayer;
let overallVolume = 1;

// timers
let fadeTimer: NodeJS.Timeout;
let dblclickTimer: NodeJS.Timeout;

/**
 * Initializes all dynamic elements.
 */
function setup(): void {
    setupPlayers();
    setupInputs();
    setupVolumeSliders();
}

/**
 * Initializes the individual players and the main SyncPlayer.
 */
function setupPlayers(): void {
    // create HTML video tags
    videoContainer.innerHTML = `<video inert></video>`.repeat(playerCount);

    // create videojs players
    for (let i = 0; i < playerCount; i++) {
        let video = videoContainer.querySelectorAll("video")[i];
        video.id = `video${i}`;

        let player = videojs(video, playerOptions);

        player.on("loadeddata", async () => {
            playerStatus[i] = true;
            player.trigger("durationchange");
            player.playbackRate(syncPlayer.playbackRate);
        });

        player.on("error", () => {
            playerStatus[i] = false;
            player.trigger("durationchange");
        });

        players.push(player);
        playerStatus.push(false);
        offsetPlayers.push(new OffsetPlayer(0, new VideoPlayer(player)));
    }

    // create sync player
    syncPlayer = new SyncPlayer(offsetPlayers);

    syncPlayer.on("status", updateStatus);
    syncPlayer.on("durationchange", updateTime);
    syncPlayer.on("timeupdate", updateTime);
}

/**
 * Initializes an url and file input field for each player.
 */
function setupInputs(): void {
    // create HTML input tags
    selectionContainer.innerHTML = `<h2></h2><input type="url"><input type="file" accept="video/*"><input type="number" min="0" value="0">`.repeat(playerCount);

    // setup EventListeners for inputs
    for (let i = 0; i < playerCount; i++) {
        let heading = selectionContainer.querySelectorAll("h2")[i] as HTMLHeadingElement;
        heading.innerText = `Video ${i}`;

        let inputs = selectionContainer.querySelectorAll("input");
        let urlInput = inputs[3 * i] as HTMLInputElement;
        let fileInput = inputs[3 * i + 1] as HTMLInputElement;
        let offsetInput = inputs[3 * i + 2] as HTMLInputElement;

        urlInput.addEventListener("keypress", e => {
            if (e.key === "Enter") {
                loadUrl(players[i], urlInput.value);
            }
        });

        fileInput.addEventListener("click", () => fileInput.value = "");
        fileInput.addEventListener("change", e => loadFile(players[i], e));

        const updateOffset = async (): Promise<void> => {
            let offset = parseFloat(offsetInput.value) || 0;
            offset = Math.max(offset, 0) * 1000;
            await offsetPlayers[i].setOffset(offset);
        };

        offsetInput.addEventListener("keypress", async e => {
            if (e.key === "Enter") {
                await updateOffset();
            }
        });

        offsetInput.addEventListener("change", async () => {
            await updateOffset();
        });
    }
}

/**
 * Initializes a volume slider for each player.
 */
function setupVolumeSliders(): void {
    // create HTML input tags
    mixerOptions.innerHTML = `<p></p><input type="range" min="0" max="1" value="1" step="any">`.repeat(playerCount);

    // setup EventListeners for inputs
    for (let i = 0; i < playerCount; i++) {
        let paragraph = mixerOptions.querySelectorAll("p")[i] as HTMLParagraphElement;
        paragraph.innerHTML = `Video ${i}`;

        let slider = mixerOptions.querySelectorAll("input")[i] as HTMLInputElement;
        volumeSliders.push(slider);

        slider.addEventListener("input", e => {
            if ((e.target instanceof HTMLInputElement)) {
                setSliderVolume(players[i], slider, parseFloat(e.target.value));
            }
        });
    }
}

/**
 * Loads the given url for the given player.
 * @param player the player to load the source
 * @param url the url to load
 */
function loadUrl(player: Player, url: string): void {
    // try to load only valid urls
    if (!isValidHttpUrl(url)) {
        return;
    }

    // fix for json urls
    // (fix more urls here if necessary)
    if (url.includes("json?base64_init=1")) {
        url = url.split("json?base64_init=1")[0] + "mpd";
    }

    let source = { type: "video/mp4", src: url };

    // get corresponding type
    for (let [key, value] of Object.entries(videoTypes)) {
        if (url.includes(`.${key}`)) {
            source.type = value;
            break;
        }
    }

    loadVideo(player, source);
}

/**
 * Returns true if the given string contains a valid url.
 * @param string the string to check
 * @returns true if string is a valid url
 */
function isValidHttpUrl(string: string): boolean {
    let url;

    try {
        url = new URL(string);
    } catch (_) {
        return false;
    }

    return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Loads the given file for the given player.
 * @param player the player to load the source
 * @param e the file to load
 */
function loadFile(player: Player, e: Event): void {
    if (e.target instanceof HTMLInputElement && e.target.files && e.target.files.length > 0) {
        loadVideo(player, { type: "video/mp4", src: URL.createObjectURL(e.target.files[0]) });
    }
}

/**
 * Loads the given source for the given player
 * if no source was previously loaded for this player.
 * @param player the player to load the source
 * @param source the source to load 
 */
async function loadVideo(player: Player, source: Record<string, string>): Promise<void> {
    if (ready()) {
        await syncPlayer.ready();
        await syncPlayer.seek(0);
    }

    player.src(source);
    player.load();
}

/**
 * Returns true if a source for every player was successfully set.
 * @returns true if SyncPlayer is ready
 */
function ready() {
    return playerStatus.every(e => e === true);
}

/**
 * Updates the play/pause button and the visibility of the controls
 * depending on the current status of the SyncPlayer.
 */
function updateStatus(): void {
    // update play/pause button
    swapTokens(playPauseBtnImage, syncPlayer.isPlaying, "fa-pause", "fa-play");

    // update controls
    syncPlayer.isPlaying ? hideControls() : showControls();
}

/**
 * Show the controls as long as the SyncPlayer is not playing.
 * However, when the SyncPlayer is playing,
 * the controls are hidden again after a certain amount of time.
 */
function showControls() {
    playerContainer.classList.add("show-controls");
    hideControls();
}

/**
 * Hides the controls after a certain amount of time
 * if the SyncPlayer is not playing.
 */
function hideControls(): void {
    if (!playerContainer.classList.contains("show-controls") || !syncPlayer.isPlaying) {
        return;
    }

    // restart timer
    clearTimeout(fadeTimer);

    fadeTimer = setTimeout(() => {
        if (syncPlayer.isPlaying) {
            playerContainer.classList.remove("show-controls");
        }
    }, 3000);
}

/**
 * Sets the current time for the SyncPlayer.
 * @param ms the time to set to
 */
async function setTime(ms: number) {
    if (ready()) {
        await syncPlayer.seek(ms);
    }
}

/**
 * Updates the current time and duration labels to match the SyncPlayer.
 */
function updateTime(): void {
    if (syncPlayer.duration <= 0) {
        currentVidTime.innerText = videoDuration.innerText = "00:00";
        return;
    }

    progressBar.style.width = `${(syncPlayer.currentTime / syncPlayer.duration) * 100}%`;
    currentVidTime.innerText = formatTime(syncPlayer.currentTime);
    videoDuration.innerText = formatTime(syncPlayer.duration);
}

/**
 * Returns the given time as a formatted string.
 * (Format: HH:MM:SS or MM:SS if no hours are necessary)
 * @param time the time in ms
 * @returns the formated time
 */
function formatTime(time: number): string {
    let date = new Date(time).toISOString();
    return date.substring(time < 3600000 ? 14 : 11, 19);
}

/**
 * Adjusts the current time of the SyncPlayer if the progressbar is dragged.
 * @param e the corresponding MouseEvent
 */
async function draggableProgressBar(e: MouseEvent): Promise<void> {
    if (!ready()) {
        return;
    }

    let timelineWidth = videoTimeline.clientWidth;

    progressBar.style.width = `${e.offsetX}px`;
    await syncPlayer.seek((e.offsetX / timelineWidth) * syncPlayer.duration);
    currentVidTime.innerText = formatTime(syncPlayer.currentTime);
}

/**
 * Adjusts the overall volume of the SyncPlayer.
 * @param newOverallVolume the new overall volume of the player
 */
function setOverallVolume(newOverallVolume: number): void {
    // volume works (almost) like the windows sound mixer
    // overall volume influences each indiviual volume slider
    // no individual slider can be higher than the overall volume slider
    if (isEqual(newOverallVolume, overallVolume)) {
        return;
    }

    newOverallVolume = Math.min(Math.max(normalize(newOverallVolume), 0), 1);
    let change = newOverallVolume / overallVolume;

    // influence each slider depending on how big the change was
    for (let i = 0; i < volumeSliders.length; i++) {
        let slider = volumeSliders[i];
        let oldSliderVolume = parseFloat(slider.value);
        let newSliderVolume = Math.abs(overallVolume - oldSliderVolume) < 0.01 ? newOverallVolume : oldSliderVolume * change;

        players[i].volume(newSliderVolume);
        slider.value = newSliderVolume.toString();
    }

    // set new overall volume
    overallVolume = newOverallVolume;
    volumeSlider.value = newOverallVolume.toString();

    swapTokens(volumeBtnImage, overallVolume > 0, "fa-volume-high", "fa-volume-xmark");
}

/**
 * Adjusts the volume of the given player and adjusts the corresponding slider.
 * @param player the player to set the new volume
 * @param slider the corresponding slider to the player
 * @param desiredVolume the new volume of the player/slider
 */
function setSliderVolume(player: Player, slider: HTMLInputElement, desiredVolume: number): void {
    // if an indivual volume slider gets a value higher than the overall volume slider
    // then the overall volume slider will also be set to this value
    let newSliderVolume = Math.min(desiredVolume, overallVolume);
    player.volume(newSliderVolume);
    slider.value = newSliderVolume.toString();

    if (desiredVolume > overallVolume) {
        setOverallVolume(desiredVolume);
    }
}

/**
 * Replaces the class token of the given element depending on the condition.
 * @param element the HTMLElement to replace the token
 * @param condition the condition that decides which token to replace
 * @param trueToken the token that replaces the other if the condition is true
 * @param falseToken the token that replaces the other if the condition is false
 */
function swapTokens(element: HTMLElement, condition: boolean, trueToken: string, falseToken: string): void {
    let oldToken = condition ? falseToken : trueToken;
    let newToken = condition ? trueToken : falseToken;
    element.classList.replace(oldToken, newToken);
}

/**
 * Shows the preview label for the hovered time
 * at the correct spot.
 */
videoTimeline.addEventListener("mousemove", e => {
    let timelineWidth = videoTimeline.clientWidth;
    let xPos = e.offsetX;

    let percent = Math.floor((xPos / timelineWidth) * syncPlayer.duration);
    let time = formatTime(percent);

    // add offset so that the lable is still readable at the edges
    let offset = time.length * 4;
    let labelPos = xPos < offset ? offset : (xPos > timelineWidth - offset) ? timelineWidth - offset : xPos;

    progressTime.style.left = `${labelPos}px`;
    progressTime.innerText = time;
});

/**
 * Toggles between mute and unmute.
 * (mute => overall volume = 0; unmute => overall volume = 0.5)
 */
volumeBtn.addEventListener("click", () => {
    let newVolume = overallVolume > 0 ? 0 : 0.5;
    setOverallVolume(newVolume);
    volumeSlider.value = newVolume.toString();
});

/**
* Adjusts the overall volume.
* (overall volume influnces each individual volume slider!)
*/
volumeSlider.addEventListener("input", e => {
    if (e.target instanceof HTMLInputElement) {
        let newVolume = parseFloat(e.target.value);
        setOverallVolume(newVolume);
    }
});

/**
* Toggle the SyncPlayer between play and pause.
* The SyncPlayer can only be started if a source for each indivual player was set previously.
*/
playPauseBtn.addEventListener("click", async () => {
    if (!ready()) {
        return;
    }

    if (syncPlayer.status === SyncPlayerStatus.Ended) {
        await syncPlayer.seek(0);
        await syncPlayer.play();
        return;
    }

    syncPlayer.isPlaying ? await syncPlayer.pause() : await syncPlayer.play();
});

/**
 * Makes each speed option selectable
 * and if selected changes the current playbackrate of the SyncPlayer
 */
speedOptions.querySelectorAll("li").forEach(option => {
    const select = (): void => {
        // adjust playbackrate
        syncPlayer.playbackRate = parseFloat(option.dataset.speed!);

        // remove previously selecetd
        // and select new one
        speedOptions.querySelector(".active")!.classList.remove("active");
        option.classList.add("active");

        // hide window
        speedOptions.classList.remove("show");
    }

    option.addEventListener("keypress", e => {
        if (e.key === " " || e.key === "Enter") {
            select();
        }
    });

    option.addEventListener("click", () => {
        select();
    });
});

/**
 * Toggle between fullsceen.
 */
fullScreenBtn.addEventListener("click", () => {
    fullScreenBtn.blur();

    if (document.fullscreenElement) {
        document.exitFullscreen();
        return;
    }

    playerContainer.requestFullscreen();
});

/**
 * Update fullsceen button and class tag for the container (for css).
 */
document.addEventListener("fullscreenchange", () => {
    let isFullscreen = document.fullscreenElement != null;

    swapTokens(playerContainer, isFullscreen, "fullscreen", "normal");
    swapTokens(fullScreenBtnImage, isFullscreen, "fa-compress", "fa-expand");
});

/**
 * Handle single click.
 */
document.addEventListener("click", e => {
    if (!(e.target instanceof Node)) {
        return;
    }

    // close the mixer options window if the user clicks away
    if (!mixerBtn.contains(e.target) && !mixerOptions.contains(e.target)) {
        mixerOptions.classList.remove("show");
    }

    // close the speed options window if the user clicks away
    if (!speedBtn.contains(e.target) && !speedOptions.contains(e.target)) {
        speedOptions.classList.remove("show");
    }

    // play/pause controls
    if (videoContainer.contains(e.target) && e.detail === 1) {
        dblclickTimer = setTimeout(() => playPauseBtn.click(), 200);
    }
});

/**
 * Handle double click.
 */
document.addEventListener("dblclick", e => {
    if (e.target instanceof Node && videoContainer.contains(e.target)) {
        clearTimeout(dblclickTimer);
        fullScreenBtn.click();
    }
});

/**
* Handle keyboard inputs.
*/
document.addEventListener("keydown", async e => {
    if (e.target instanceof Node && (selectionContainer.contains(e.target) || controlsContainer.contains(e.target))) {
        return;
    }

    let key = e.key.toLowerCase();

    switch (key) {
        // play/pause controls
        case " ": {
            playPauseBtn.click();
            break;
        }

        // volume controls
        case "arrowup":
        case "arrowdown": {
            setOverallVolume(overallVolume + (key === "arrowup" ? 0.1 : -0.1));
            break;
        }

        // time controls
        case "arrowright":
        case "arrowleft": {
            await setTime(syncPlayer.currentTime + (key === "arrowright" ? 5000 : -5000));
            break;
        }

        // speed controls
        case "a":
        case "d": {
            let options = Array.from(speedOptions.querySelectorAll("li"));
            let active = options.indexOf(options.find(x => x.classList.contains("active")) || options[2]);
            let next = Math.min(Math.max(active + (key === "a" ? 1 : -1), 0), options.length - 1)

            options[next].click();
            break;
        }
    }
});

/**
 * Handle global focus changes.
 */
document.addEventListener("focusin", () => {
    let activeElement = document.activeElement;

    if (controlsContainer.contains(activeElement)) {
        showControls();
    }

    mixerOptions.contains(activeElement) ? mixerOptions.classList.add("show") : mixerOptions.classList.remove("show");
    speedOptions.contains(activeElement) ? speedOptions.classList.add("show") : speedOptions.classList.remove("show");
});

// container events
playerContainer.addEventListener("mousemove", () => showControls());

// timeline events
videoTimeline.addEventListener("click", async e => await setTime((e.offsetX / videoTimeline.clientWidth) * syncPlayer.duration));
videoTimeline.addEventListener("mousedown", () => videoTimeline.addEventListener("mousemove", draggableProgressBar));
document.addEventListener("mouseup", () => videoTimeline.removeEventListener("mousemove", draggableProgressBar));

// controller events
mixerBtn.addEventListener("click", () => mixerOptions.classList.toggle("show"));
skipBackward.addEventListener("click", async () => await setTime(syncPlayer.currentTime - 5000));
skipForward.addEventListener("click", async () => await setTime(syncPlayer.currentTime + 5000));
speedBtn.addEventListener("click", () => speedOptions.classList.toggle("show"));

// default values
setup();
setOverallVolume(0.5);

console.log("Version 1.5");
